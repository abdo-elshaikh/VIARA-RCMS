const { AppError } = require('../utils/errors');
const { logAction } = require('../services/auditService');
const { ensureActiveAttendanceClockIn } = require('./hrController');
const { onShiftClose } = require('../services/endOfDayService');
const { z } = require('zod');
const { hasReceptionSupervision, assertReceptionSupervision } = require('../services/receptionSupervisorService');

const VALID_SCOPES = new Set(['all', 'rooms', 'modalities', 'mine', 'unclaimed', 'emergency']);
const ASSIGNMENT_SCOPES = new Set(['all', 'rooms', 'modalities', 'emergency']);

const sanitizeTextArray = (value) => Array.isArray(value)
    ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 100)
    : [];

const METRICS_CACHE_TTL_MS = 3000;
const metricsCache = new Map();

const CURRENT_RECEPTION_SHIFT_CACHE_TTL_MS = 3000;
const currentReceptionShiftCache = new Map();

const buildShiftMetrics = async (db, shift, { forceRefresh = false } = {}) => {
    const cacheKey = String(shift.session_id || shift.user_id);
    const now = Date.now();
    if (process.env.NODE_ENV !== 'test' && !forceRefresh) {
        const cached = metricsCache.get(cacheKey);
        if (cached && (now - cached.timestamp < METRICS_CACHE_TTL_MS)) {
            return cached.data;
        }
    }

    const [taskResult, appointmentResult, paymentResult] = await Promise.all([
        db.query(`
            SELECT
                COUNT(*)::int AS claimed,
                COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
                COUNT(*) FILTER (WHERE status = 'Released')::int AS released,
                COUNT(*) FILTER (WHERE status IN ('Claimed', 'In_Progress'))::int AS active,
                COUNT(*) FILTER (WHERE notes ILIKE 'Transferred:%' OR notes ILIKE 'Transferred from%')::int AS transferred,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - claimed_at)) / 60)
                    FILTER (WHERE completed_at IS NOT NULL AND claimed_at IS NOT NULL)::numeric, 1), 0) AS average_handling_minutes
            FROM reception_work_items
            WHERE shift_session_id = $1
        `, [shift.session_id]),
        db.query(`
            SELECT COUNT(*)::int AS appointments_created
            FROM appointments
            WHERE created_by = $1
              AND created_at >= $2::timestamptz
              AND created_at < COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
        `, [shift.user_id, shift.started_at, shift.ended_at]),
        db.query(`
            SELECT
                COALESCE(SUM(method_count), 0)::int AS payment_count,
                COALESCE(SUM(method_total), 0) AS collected_amount,
                COALESCE(jsonb_object_agg(method, method_total) FILTER (WHERE method IS NOT NULL), '{}'::jsonb) AS by_method
            FROM (
                SELECT method, SUM(amount) AS method_total, COUNT(*) AS method_count
                FROM payments
                WHERE processed_by = $1
                  AND transaction_date >= $2::timestamptz
                  AND transaction_date < COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
                  AND payment_status = 'Completed'
                GROUP BY method
            ) payment_totals
        `, [shift.user_id, shift.started_at, shift.ended_at]),
    ]);

    const task = taskResult.rows[0] || {};
    const appointment = appointmentResult.rows[0] || {};
    const payment = paymentResult.rows[0] || {};
    const metrics = {
        claimed: Number(task.claimed || 0),
        completed: Number(task.completed || 0),
        released: Number(task.released || 0),
        transferred: Number(task.transferred || 0),
        active: Number(task.active || 0),
        averageHandlingMinutes: Number(task.average_handling_minutes || 0),
        appointmentsCreated: Number(appointment.appointments_created || 0),
        paymentCount: Number(payment.payment_count || 0),
        collectedAmount: Number(payment.collected_amount || 0),
        collectionsByMethod: payment.by_method || {},
    };

    if (process.env.NODE_ENV !== 'test') {
        metricsCache.set(cacheKey, { timestamp: now, data: metrics });
        if (metricsCache.size > 200) {
            for (const [k, v] of metricsCache.entries()) {
                if (now - v.timestamp > METRICS_CACHE_TTL_MS) metricsCache.delete(k);
            }
        }
    }

    return metrics;
};

const getCurrentReceptionShift = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const now = Date.now();
        if (process.env.NODE_ENV !== 'test') {
            const cached = currentReceptionShiftCache.get(userId);
            if (cached && (now - cached.timestamp < CURRENT_RECEPTION_SHIFT_CACHE_TTL_MS)) {
                return res.json(cached.data);
            }
        }

        const shiftResult = await db.query(`
            SELECT rss.*, u.full_name AS employee_name, b.name AS branch_name
            FROM reception_shift_sessions rss
            JOIN users u ON u.user_id = rss.user_id
            LEFT JOIN financial_branches b ON b.branch_id = rss.branch_id
            WHERE rss.user_id = $1 AND rss.status = 'Open'
            ORDER BY rss.started_at DESC
            LIMIT 1
        `, [userId]);

        const shift = shiftResult.rows[0];
        if (!shift) {
            if (process.env.NODE_ENV !== 'test') {
                currentReceptionShiftCache.set(userId, { timestamp: now, data: null });
            }
            return res.json(null);
        }

        const metrics = await buildShiftMetrics(db, shift);
        const payload = { ...shift, metrics, live_metrics: metrics };
        if (process.env.NODE_ENV !== 'test') {
            currentReceptionShiftCache.set(userId, { timestamp: now, data: payload });
            if (currentReceptionShiftCache.size > 200) {
                const oldest = currentReceptionShiftCache.keys().next().value;
                currentReceptionShiftCache.delete(oldest);
            }
        }
        res.json(payload);
    } catch (error) {
        next(error);
    }
};

const openReceptionShift = (db) => async (req, res, next) => {
    let client;
    try {
        const desk = String(req.body?.desk || '').trim();
        if (!desk || desk.length > 100) throw new AppError('A valid reception desk is required', 400);
        const requestedScope = VALID_SCOPES.has(req.body?.scope) ? req.body.scope : 'all';
        const scope = ASSIGNMENT_SCOPES.has(requestedScope) ? requestedScope : 'all';
        const rooms = sanitizeTextArray(req.body?.rooms);
        const modalities = sanitizeTextArray(req.body?.modalities);
        const branchId = req.body?.branchId || req.user?.branch_id || req.user?.branchId || null;
        if (scope === 'rooms' && rooms.length === 0) throw new AppError('Select at least one room for a room-scoped shift', 400);
        if (scope === 'modalities' && modalities.length === 0) throw new AppError('Select at least one device for a device-scoped shift', 400);

        client = await db.connect();
        await client.query('BEGIN');
        // Serialize scope allocation across all desks. Row locks alone cannot
        // prevent two new shifts from observing no conflict at the same time.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('reception-scope-assignments', 14301))");
        const existing = await client.query(`
            SELECT session_id, desk_identifier, room_ids, modality_ids, scope, status, started_at
            FROM reception_shift_sessions
            WHERE user_id = $1 AND status = 'Open'
            LIMIT 1 FOR UPDATE
        `, [req.user.user_id]);
        if (existing.rows.length) {
            throw new AppError(
                'You already have an open reception shift',
                409,
                true,
                'RECEPTION_SHIFT_ALREADY_OPEN',
                { status: 'Open', shift: existing.rows[0] }
            );
        }

        const conflict = await client.query(`
            SELECT session_id, user_id, desk_identifier, scope
            FROM reception_shift_sessions
            WHERE status = 'Open'
              AND (branch_id IS NOT DISTINCT FROM $5)
              AND (
                  LOWER(desk_identifier) = LOWER($1)
                  OR (scope = 'emergency' AND $2 = 'emergency')
                  OR (scope = 'rooms' AND $2 = 'rooms' AND room_ids && $3::text[])
                  OR (scope = 'modalities' AND $2 = 'modalities' AND modality_ids && $4::text[])
              )
            LIMIT 1
            FOR UPDATE
        `, [desk, scope, rooms, modalities, branchId]);
        if (conflict.rows.length) {
            throw new AppError('This desk or work scope is already assigned to another active receptionist at this branch', 409, true, 'RECEPTION_SCOPE_CONFLICT', {
                desk: conflict.rows[0].desk_identifier,
                scope: conflict.rows[0].scope,
            });
        }

        const activeAttendance = await client.query(`
            SELECT log_id, clock_in, shift_id
            FROM attendance_logs
            WHERE user_id = $1 AND clock_out IS NULL
            ORDER BY clock_in DESC
            LIMIT 1
            FOR SHARE
        `, [req.user.user_id]);

        if (!activeAttendance.rows.length) {
            throw new AppError(
                'Attendance clock-in is required before opening an operational shift. Please register attendance first. | يجب تسجيل الحضور أولاً قبل فتح وردية الاستقبال بناءً على جدول وردياتك المعتمد.',
                403,
                true,
                'ATTENDANCE_REQUIRED_BEFORE_SHIFT'
            );
        }

        const attendanceSession = activeAttendance.rows[0];
        const isStale = new Date(attendanceSession.clock_in) < new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (isStale) {
            throw new AppError(
                'Your previous attendance session is stale (exceeded 24 hours). Please settle and conclude it before opening a new shift. | جلسة الحضور السابقة معلقة وتجاوزت 24 ساعة. يرجى تسوية الانصراف أولاً.',
                403,
                true,
                'ATTENDANCE_STALE_SESSION'
            );
        }

        const result = await client.query(`
            INSERT INTO reception_shift_sessions (
                user_id, desk_identifier, room_ids, modality_ids, scope, branch_id
            ) VALUES ($1, $2, $3::text[], $4::text[], $5, $6)
            RETURNING *
        `, [req.user.user_id, desk, rooms, modalities, scope, branchId]);

        await client.query(`
            UPDATE reception_work_items
            SET shift_session_id = $2, updated_at = CURRENT_TIMESTAMP
            WHERE claimed_by = $1
              AND status IN ('Claimed', 'In_Progress')
              AND shift_session_id IS NULL
        `, [req.user.user_id, result.rows[0].session_id]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_SHIFT_OPENED',
            resourceId: result.rows[0].session_id,
            resourceTable: 'reception_shift_sessions',
            ipAddress: req.ip,
            details: { desk, scope, rooms, modalities },
            required: true,
        });
        await client.query('COMMIT');
        currentReceptionShiftCache.clear();
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
        }
        if (error?.code === '23505') {
            return next(new AppError(
                'You already have an open reception shift',
                409,
                true,
                'RECEPTION_SHIFT_ALREADY_OPEN',
                { status: 'Open' }
            ));
        }
        next(error);
    } finally {
        client?.release();
    }
};

const closeReceptionShift = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const shiftResult = await client.query(`
            SELECT *, TO_CHAR(started_at AT TIME ZONE COALESCE(NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''), 'Africa/Cairo'), 'YYYY-MM-DD') AS shift_date
            FROM reception_shift_sessions
            WHERE session_id = $1
            FOR UPDATE
        `, [req.params.sessionId]);
        const shift = shiftResult.rows[0];
        if (!shift) throw new AppError('Reception shift not found', 404);
        const isSupervisor = ['Admin', 'Developer'].includes(req.user.role);
        if (String(shift.user_id) !== String(req.user.user_id) && !isSupervisor) {
            throw new AppError('You can only close your own reception shift', 403);
        }
        if (shift.status !== 'Open') throw new AppError('Reception shift is already closed', 409);

        const openCashierShift = await client.query(`
            SELECT shift_id
            FROM cashier_shifts
            WHERE cashier_id = $1 AND status = 'Open'
            LIMIT 1
            FOR UPDATE
        `, [shift.user_id]);
        if (openCashierShift.rows.length) {
            throw new AppError('Close the cashier shift and reconcile its drawer balance before closing the reception shift. | يجب إغلاق وردية الخزينة وتسوية رصيد الدرج أولاً قبل إغلاق وردية الاستقبال.', 409, true, 'OPEN_CASHIER_SHIFT');
        }

        const metrics = await buildShiftMetrics(client, shift, { forceRefresh: true });
        if (metrics.active > 0) {
            throw new AppError(`There are ${metrics.active} active reception tasks. Transfer or complete them before closing the shift. | يوجد مهام نشطة بالاستقبال (${metrics.active}). يرجى تحويلها أو إنجازها قبل إغلاق الوردية.`, 409, true, 'ACTIVE_RECEPTION_TASKS', {
                activeTasks: metrics.active,
            });
        }

        const result = await client.query(`
            UPDATE reception_shift_sessions
            SET status = 'Closed',
                ended_at = CURRENT_TIMESTAMP,
                closing_notes = $2,
                metrics = $3::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE session_id = $1
            RETURNING *
        `, [shift.session_id, req.body?.notes ? String(req.body.notes).trim().slice(0, 2000) : null, JSON.stringify(metrics)]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_SHIFT_CLOSED',
            resourceId: shift.session_id,
            resourceTable: 'reception_shift_sessions',
            ipAddress: req.ip,
            details: metrics,
            required: true,
        });
        await client.query('COMMIT');
        currentReceptionShiftCache.clear();
        metricsCache.delete(String(shift.session_id));
        metricsCache.delete(String(shift.user_id));

        // Fire-and-forget: check for unexamined cases and notify admins.
        onShiftClose(db, {
            sessionId : shift.session_id,
            userId    : shift.user_id,
            userName  : req.user?.full_name || req.user?.username || '',
            date      : shift.shift_date,
        }).catch(() => {});

        res.json({ ...result.rows[0], shift_date: shift.shift_date, metrics });
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
        }
        next(error);
    } finally {
        client?.release();
    }
};

const getReceptionShiftHistory = (db) => async (req, res, next) => {
    try {
        const requestedUserId = req.query.userId;
        const isSupervisor = ['Admin', 'Developer', 'HR'].includes(req.user.role);
        const userId = requestedUserId || req.user.user_id;
        if (String(userId) !== String(req.user.user_id) && !isSupervisor) {
            await assertReceptionSupervision(db, req.user, userId, 'view_shifts');
        }
        const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        const fromDate = req.query.fromDate || null;
        const toDate = req.query.toDate || null;
        const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value))
            && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
            && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
        if ((fromDate && !isDate(fromDate)) || (toDate && !isDate(toDate))) {
            throw new AppError('Shift history dates must use YYYY-MM-DD format', 400);
        }
        if (fromDate && toDate && fromDate > toDate) throw new AppError('fromDate must be on or before toDate', 400);
        const values = [userId];
        let dateFilter = '';
        const timezone = `COALESCE(NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''), 'Africa/Cairo')`;
        if (fromDate) {
            values.push(fromDate);
            dateFilter += ` AND rss.started_at >= ($${values.length}::date::timestamp AT TIME ZONE ${timezone})`;
        }
        if (toDate) {
            values.push(toDate);
            dateFilter += ` AND rss.started_at < (($${values.length}::date + 1)::timestamp AT TIME ZONE ${timezone})`;
        }
        const limitIndex = values.length + 1;
        const offsetIndex = values.length + 2;
        values.push(limit, offset);
        const result = await db.query(`
            SELECT rss.*, u.full_name AS employee_name,
                   COALESCE(review.actions_reviewed, 0)::int AS actions_reviewed,
                   COALESCE(review.carried_forward, 0)::int AS carried_forward,
                   COALESCE(review.rescheduled, 0)::int AS rescheduled,
                   COALESCE(review.marked_no_show, 0)::int AS marked_no_show,
                   review.last_reviewed_at
            FROM reception_shift_sessions rss
            JOIN users u ON u.user_id = rss.user_id
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS actions_reviewed,
                       COUNT(*) FILTER (WHERE al.details->>'action' = 'carry_forward')::int AS carried_forward,
                       COUNT(*) FILTER (WHERE al.details->>'action' = 'reschedule')::int AS rescheduled,
                       COUNT(*) FILTER (WHERE al.details->>'action' = 'no_show')::int AS marked_no_show,
                       MAX(al.timestamp) AS last_reviewed_at
                FROM system_logs al
                WHERE al.details->>'jobName' = 'end-of-day-review'
                  AND al.details->>'sessionId' = rss.session_id::text
            ) review ON TRUE
            WHERE rss.user_id = $1
              ${dateFilter}
            ORDER BY rss.started_at DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `, values);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getReceptionShiftDetails = (db) => async (req, res, next) => {
    try {
        const sessionId = req.params.sessionId;
        const result = await db.query(`
            SELECT rss.*, u.full_name AS employee_name
            FROM reception_shift_sessions rss
            JOIN users u ON u.user_id = rss.user_id
            WHERE rss.session_id = $1::uuid
            LIMIT 1
        `, [sessionId]);
        const shift = result.rows[0];
        if (!shift) throw new AppError('Reception shift not found', 404);
        const isSupervisor = ['Admin', 'Developer'].includes(req.user.role);
        if (String(shift.user_id) !== String(req.user.user_id) && !isSupervisor) {
            await assertReceptionSupervision(db, req.user, shift.user_id, 'view_shifts');
        }
        if (shift.status === 'Open') {
            shift.live_metrics = await buildShiftMetrics(db, shift, { forceRefresh: true });
        }
        res.json(shift);
    } catch (error) {
        next(error);
    }
};

// Shift Handover
const handoverCreateSchema = z.object({
    toUserId: z.string().uuid().optional(),
    pendingTaskIds: z.array(z.string().uuid()).optional().default([]),
    notes: z.string().trim().max(2000).optional()
});

const createShiftHandover = (db) => async (req, res, next) => {
    let client;
    try {
        const data = handoverCreateSchema.parse(req.body || {});
        const sessionId = req.params.sessionId;

        client = await db.connect();
        await client.query('BEGIN');

        const shiftResult = await client.query(`
            SELECT * FROM reception_shift_sessions
            WHERE session_id = $1
            FOR UPDATE
        `, [sessionId]);
        const shift = shiftResult.rows[0];
        if (!shift) throw new AppError('Reception shift not found', 404);
        if (shift.status !== 'Open') throw new AppError('Can only create handover for open shifts', 409);

        const isSupervisor = ['Admin', 'Developer'].includes(req.user.role);
        const actingForTeamMember = String(shift.user_id) !== String(req.user.user_id) && !isSupervisor;
        if (actingForTeamMember &&
            !await hasReceptionSupervision(client, req.user, shift.user_id, 'manage_handovers')) {
            throw new AppError('You can only create handover for your own shift', 403);
        }

        let toUserId = data.toUserId || null;
        if (toUserId) {
            const targetUser = await client.query('SELECT user_id FROM users WHERE user_id = $1 AND is_active = TRUE', [toUserId]);
            if (!targetUser.rows.length) throw new AppError('Target user not found or inactive', 404);
            if (actingForTeamMember && String(toUserId) !== String(req.user.user_id) &&
                !await hasReceptionSupervision(client, req.user, toUserId, 'manage_handovers')) {
                throw new AppError('Handover recipient is outside your assigned team', 403);
            }
        }

        const result = await client.query(`
            INSERT INTO reception_shift_handovers (
                from_session_id, to_user_id, pending_task_ids, notes
            ) VALUES ($1, $2, $3::uuid[], $4)
            RETURNING *
        `, [sessionId, toUserId, data.pendingTaskIds, data.notes || null]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_SHIFT_HANDOVER_CREATED',
            resourceId: result.rows[0].handover_id,
            resourceTable: 'reception_shift_handovers',
            ipAddress: req.ip,
            details: { fromSession: sessionId, toUserId, pendingTaskCount: data.pendingTaskIds.length },
            required: true,
        });

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
        }
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        client?.release();
    }
};

const getShiftHandover = (db) => async (req, res, next) => {
    try {
        const sessionId = req.params.sessionId;
        const shiftResult = await db.query('SELECT user_id FROM reception_shift_sessions WHERE session_id = $1', [sessionId]);
        const shiftOwnerId = shiftResult.rows[0]?.user_id;
        if (!shiftOwnerId) throw new AppError('Reception shift not found', 404);
        const canViewAll = String(shiftOwnerId) === String(req.user.user_id) ||
            await hasReceptionSupervision(db, req.user, shiftOwnerId, 'view_shifts');
        if (!canViewAll) {
            const assignedHandover = await db.query(`
                SELECT 1 FROM reception_shift_handovers
                WHERE from_session_id = $1 AND to_user_id = $2 LIMIT 1
            `, [sessionId, req.user.user_id]);
            if (!assignedHandover.rows.length) throw new AppError('This handover is outside your access scope', 403);
        }
        const result = await db.query(`
            SELECT h.*, u.full_name AS to_user_name, u.role AS to_user_role
            FROM reception_shift_handovers h
            LEFT JOIN users u ON u.user_id = h.to_user_id
            WHERE h.from_session_id = $1
              AND ($2::boolean OR h.to_user_id = $3)
            ORDER BY h.created_at DESC
        `, [sessionId, canViewAll, req.user.user_id]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const handoverAckSchema = z.object({
    acknowledged: z.boolean()
});

const acknowledgeShiftHandover = (db) => async (req, res, next) => {
    let client;
    try {
        const data = handoverAckSchema.parse(req.body || {});
        const handoverId = req.params.handoverId;

        if (!data.acknowledged) {
            return next(new AppError('Must acknowledge the handover', 400));
        }

        client = await db.connect();
        await client.query('BEGIN');

        const handoverResult = await client.query(`
            SELECT * FROM reception_shift_handovers
            WHERE handover_id = $1
            FOR UPDATE
        `, [handoverId]);
        const handover = handoverResult.rows[0];
        if (!handover) throw new AppError('Handover not found', 404);
        if (handover.acknowledged_at) throw new AppError('Handover already acknowledged', 409);

        // Only the target user or supervisor can acknowledge
        const isTarget = handover.to_user_id && String(handover.to_user_id) === String(req.user.user_id);
        const isSupervisor = ['Admin', 'Developer'].includes(req.user.role);
        let handoverOwnerId = null;
        if (!isTarget && !isSupervisor) {
            const ownerResult = await client.query(
                'SELECT user_id FROM reception_shift_sessions WHERE session_id = $1',
                [handover.from_session_id]
            );
            handoverOwnerId = ownerResult.rows[0]?.user_id;
        }
        if (!isTarget && !isSupervisor &&
            !await hasReceptionSupervision(client, req.user, handoverOwnerId, 'manage_handovers')) {
            throw new AppError('You are not authorized to acknowledge this handover', 403);
        }

        const result = await client.query(`
            UPDATE reception_shift_handovers
            SET acknowledged_at = CURRENT_TIMESTAMP,
                acknowledged_by = $1
            WHERE handover_id = $2
            RETURNING *
        `, [req.user.user_id, handoverId]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_SHIFT_HANDOVER_ACKNOWLEDGED',
            resourceId: handoverId,
            resourceTable: 'reception_shift_handovers',
            ipAddress: req.ip,
            details: { fromSession: handover.from_session_id },
            required: true,
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
        }
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        client?.release();
    }
};


module.exports = {
    getCurrentReceptionShift,
    openReceptionShift,
    closeReceptionShift,
    getReceptionShiftHistory,
    getReceptionShiftDetails,
    buildShiftMetrics,
    createShiftHandover,
    getShiftHandover,
    acknowledgeShiftHandover,
};
