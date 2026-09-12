const { AppError } = require('../utils/errors');
const { logAction } = require('../services/auditService');
const { ensureActiveAttendanceClockIn } = require('./hrController');

const VALID_SCOPES = new Set(['all', 'rooms', 'modalities', 'mine', 'unclaimed', 'emergency']);
const ASSIGNMENT_SCOPES = new Set(['all', 'rooms', 'modalities', 'emergency']);

const sanitizeTextArray = (value) => Array.isArray(value)
    ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 100)
    : [];

const buildShiftMetrics = async (db, shift) => {
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
              AND created_at >= $2
              AND created_at < COALESCE($3, CURRENT_TIMESTAMP)
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
                  AND transaction_date >= $2
                  AND transaction_date < COALESCE($3, CURRENT_TIMESTAMP)
                  AND payment_status = 'Completed'
                GROUP BY method
            ) payment_totals
        `, [shift.user_id, shift.started_at, shift.ended_at]),
    ]);

    const task = taskResult.rows[0] || {};
    const appointment = appointmentResult.rows[0] || {};
    const payment = paymentResult.rows[0] || {};
    return {
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
};

const getCurrentReceptionShift = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT rss.*, u.full_name AS employee_name
            FROM reception_shift_sessions rss
            JOIN users u ON u.user_id = rss.user_id
            WHERE rss.user_id = $1 AND rss.status = 'Open'
            LIMIT 1
        `, [req.user.user_id]);
        if (!result.rows[0]) return res.json(null);
        const shift = result.rows[0];
        const metrics = await buildShiftMetrics(db, shift);
        res.json({ ...shift, live_metrics: metrics });
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
              AND (
                  LOWER(desk_identifier) = LOWER($1)
                  OR (scope = 'emergency' AND $2 = 'emergency')
                  OR (scope = 'rooms' AND $2 = 'rooms' AND room_ids && $3::text[])
                  OR (scope = 'modalities' AND $2 = 'modalities' AND modality_ids && $4::text[])
              )
            LIMIT 1
            FOR UPDATE
        `, [desk, scope, rooms, modalities]);
        if (conflict.rows.length) {
            throw new AppError('This desk or work scope is already assigned to another active receptionist', 409, true, 'RECEPTION_SCOPE_CONFLICT', {
                desk: conflict.rows[0].desk_identifier,
                scope: conflict.rows[0].scope,
            });
        }

        await ensureActiveAttendanceClockIn(client, req.user.user_id, '[نظام] تسجيل حضور تلقائي عند بدء وردية الاستقبال');

        const result = await client.query(`
            INSERT INTO reception_shift_sessions (
                user_id, desk_identifier, room_ids, modality_ids, scope
            ) VALUES ($1, $2, $3::text[], $4::text[], $5)
            RETURNING *
        `, [req.user.user_id, desk, rooms, modalities, scope]);

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
            SELECT * FROM reception_shift_sessions
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
            throw new AppError('يجب إغلاق وردية الخزينة وتسوية رصيد الدرج أولاً قبل إغلاق وردية الاستقبال (Close the cashier shift and reconcile its balance first)', 409, true, 'OPEN_CASHIER_SHIFT');
        }

        const metrics = await buildShiftMetrics(client, shift);
        if (metrics.active > 0) {
            throw new AppError(`يوجد مهام نشطة بالاستقبال (${metrics.active}). يرجى تحويلها أو إنجازها قبل إغلاق الوردية (Transfer or release all active reception tasks before closing shift)`, 409, true, 'ACTIVE_RECEPTION_TASKS', {
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
        res.json({ ...result.rows[0], metrics });
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
        const userId = isSupervisor && requestedUserId ? requestedUserId : req.user.user_id;
        const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
        const result = await db.query(`
            SELECT rss.*, u.full_name AS employee_name
            FROM reception_shift_sessions rss
            JOIN users u ON u.user_id = rss.user_id
            WHERE rss.user_id = $1
            ORDER BY rss.started_at DESC
            LIMIT $2
        `, [userId, limit]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCurrentReceptionShift,
    openReceptionShift,
    closeReceptionShift,
    getReceptionShiftHistory,
    buildShiftMetrics,
};
