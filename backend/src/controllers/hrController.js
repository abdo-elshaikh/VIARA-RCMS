const { z } = require('zod');
const { isGlobalReviewer, assertStaffSupervision } = require('../services/staffSupervisorService');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');
const {
    updateProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema, updateAttendanceSchema, manualAttendanceSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema, cancelLeaveSchema,
    updateLeaveBalanceSchema,
    createStaffCredentialSchema, updateStaffCredentialSchema,
    createAttendancePermissionSchema, updateAttendancePermissionStatusSchema, updateAttendanceSettingsSchema,
    createShiftRequestSchema, updateShiftRequestStatusSchema, createStaffEvaluationSchema,
    breakStartSchema, breakEndSchema
} = require('../schemas/hrSchema');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMPLOYEE_ROLES = Object.freeze([
    'Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse',
    'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'
]);
const {
    LEAVE_TYPES_WITH_BALANCE,
    DEFAULT_LEAVE_ENTITLEMENTS,
    toDateOnlyString,
    workingDays,
    workingDaysByYear,
    getLeaveEntitlement,
    computeLeaveBalances
} = require('../services/hrLeaveService');
const { invalidateAttendanceConfigCache } = require('../services/attendanceConfigCache');

const toNullable = (value) => value === undefined ? null : value;


const getLeaveBalances = (db) => async (req, res, next) => {
    try {
        const canViewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const requestedUserId = canViewAll ? (req.query.userId || null) : null;
        const year = Math.min(2100, Math.max(2000, Number.parseInt(req.query.year, 10) || new Date().getFullYear()));

        if (requestedUserId) {
            if (!z.string().uuid().safeParse(requestedUserId).success) throw new AppError('Invalid employee id', 400);
            return res.json(await computeLeaveBalances(db, [requestedUserId], year));
        }
        if (canViewAll) {
            const employees = await db.query('SELECT user_id FROM users WHERE is_active = TRUE AND role = ANY($1::user_role[]) ORDER BY full_name', [EMPLOYEE_ROLES]);
            return res.json(await computeLeaveBalances(db, employees.rows.map((row) => row.user_id), year));
        }
        res.json(await computeLeaveBalances(db, [getAuthenticatedUserId(req)], year));
    } catch (error) {
        next(error);
    }
};

const ensureDateRange = (startDate, endDate) => {
    const start = startDate || '1970-01-01';
    const end = endDate || new Date().toISOString().slice(0, 10);

    if (!ISO_DATE_PATTERN.test(start) || !ISO_DATE_PATTERN.test(end)) {
        throw new AppError('Date range must use YYYY-MM-DD dates', 400);
    }
    if (start > end) {
        throw new AppError('Start date must be on or before end date', 400);
    }
    return { start, end };
};

// Employee Profiles

const getEmployeeProfiles = (db) => async (req, res, next) => {
    try {
        const { department, employmentStatus, isActive, limit } = req.query;
        const pageLimit = Math.min(1000, Math.max(1, Number.parseInt(limit, 10) || 500));
        const params = [EMPLOYEE_ROLES];
        let query = `
            SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                   p.employee_id, p.department, p.job_title, p.hire_date,
                   p.termination_date, p.employment_status
        `;

        query += `
            FROM users u
            LEFT JOIN employee_profiles p ON u.user_id = p.user_id
            WHERE u.role = ANY($1::user_role[])
        `;
        if (department) {
            params.push(department);
            query += ` AND p.department = $${params.length}`;
        }
        if (employmentStatus) {
            params.push(employmentStatus);
            query += ` AND p.employment_status = $${params.length}`;
        }
        if (isActive === 'true' || isActive === 'false') {
            params.push(isActive === 'true');
            query += ` AND u.is_active = $${params.length}`;
        }
        params.push(pageLimit);
        query += ` ORDER BY u.created_at DESC LIMIT $${params.length}`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const updateEmployeeProfile = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateProfileSchema.parse(req.body);
        const keys = Object.keys(data);

        if (keys.length === 0) {
            return res.status(400).json({ message: 'No data provided' });
        }

        client = await db.connect();
        await client.query('BEGIN');

        const eligibleUser = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role = ANY($2::user_role[]) FOR UPDATE',
            [id, EMPLOYEE_ROLES]
        );
        if (!eligibleUser.rows.length) throw new AppError('Eligible employee not found', 404);
        const existing = await client.query('SELECT * FROM employee_profiles WHERE user_id = $1 FOR UPDATE', [id]);

        let result;
        if (existing.rows.length === 0) {
            result = await client.query(`
                INSERT INTO employee_profiles (user_id, employee_id, department, job_title, hire_date, termination_date, employment_status)
                SELECT u.user_id, $2, $3, $4, $5, $6, $7
                FROM users u
                WHERE u.user_id = $1 AND u.role = ANY($8::user_role[])
                ON CONFLICT (user_id) DO NOTHING
                RETURNING *
            `, [
                id,
                toNullable(data.employeeId),
                toNullable(data.department),
                toNullable(data.jobTitle),
                toNullable(data.hireDate),
                toNullable(data.terminationDate),
                data.employmentStatus || 'Full-Time',
                EMPLOYEE_ROLES
            ]);
            if (!result.rows.length) {
                // A concurrent request created the profile between our SELECT
                // and INSERT; fall through to the update path instead of
                // surfacing a misleading unique-violation error.
                const raced = await client.query('SELECT * FROM employee_profiles WHERE user_id = $1 FOR UPDATE', [id]);
                if (!raced.rows.length) throw new AppError('Eligible employee not found', 404);
                existing.rows.push(raced.rows[0]);
            } else {
                await logAction(client, {
                    userId: req.user.user_id, action: 'EMPLOYEE_PROFILE_CREATED', resourceId: id,
                    resourceTable: 'employee_profiles', ipAddress: req.ip,
                    details: { changedFields: keys }, required: true
                });
            }
        }
        if (!result || !result.rows.length) {
            // Clearing a recorded termination date re-opens payroll exposure;
            // block it once a paid or locked run already covers that date.
            const previousTermination = existing.rows[0]?.termination_date;
            if (previousTermination && data.terminationDate === null) {
                const paidAfter = await client.query(`
                    SELECT 1
                    FROM payroll_employee_items i
                    JOIN payroll_runs r ON r.run_id = i.run_id
                    JOIN payroll_periods p ON p.period_id = r.period_id
                    WHERE i.user_id = $1
                      AND r.status IN ('Paid', 'Locked')
                      AND p.end_date >= $2::date
                    LIMIT 1
                `, [id, previousTermination]);
                if (paidAfter.rows.length) {
                    throw new AppError('Termination date cannot be cleared: a paid payroll run already covers it. Reactivate the staff account instead.', 409);
                }
            }

            const setClauses = keys.map((k, i) => {
                const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                return `${dbKey} = $${i + 1}`;
            });
            const values = Object.values(data);
            values.push(id);

            result = await client.query(`
                UPDATE employee_profiles
                SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $${values.length} RETURNING *
            `, values);
            await logAction(client, {
                userId: req.user.user_id, action: 'EMPLOYEE_PROFILE_UPDATED', resourceId: id,
                resourceTable: 'employee_profiles', ipAddress: req.ip,
                details: { changedFields: keys }, required: true
            });
        }
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23505') return next(new AppError('Employee ID already exists for another employee', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};


// Staff Shifts

const getShifts = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, userId, limit = 500 } = req.query;
        if (startDate && Number.isNaN(new Date(startDate).getTime())) throw new AppError('Invalid shift start date', 400);
        if (endDate && Number.isNaN(new Date(endDate).getTime())) throw new AppError('Invalid shift end date', 400);
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) throw new AppError('Shift query end date must be on or after start date', 400);
        if (userId && !z.string().uuid().safeParse(userId).success) throw new AppError('Invalid employee id', 400);
        const canReviewAll = ['Developer', 'Admin', 'HR', 'Receptionist', 'Radiologist'].includes(req.user.role);
        let effectiveUserId = canReviewAll ? userId : getAuthenticatedUserId(req);
        let teamUserIds = null;
        if (!canReviewAll && userId && userId !== getAuthenticatedUserId(req)) {
            const supervised = await db.query(`
                SELECT employee_id FROM staff_supervisor_assignments
                WHERE supervisor_id = $1 AND employee_id = $2 AND revoked_at IS NULL
                  AND starts_at <= CURRENT_TIMESTAMP
                  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            `, [getAuthenticatedUserId(req), userId]);
            if (supervised.rows.length) {
                effectiveUserId = userId;
            }
        } else if (req.query.team === 'true') {
            const supervised = await db.query(`
                SELECT employee_id FROM staff_supervisor_assignments
                WHERE supervisor_id = $1 AND revoked_at IS NULL
                  AND starts_at <= CURRENT_TIMESTAMP
                  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            `, [getAuthenticatedUserId(req)]);
            teamUserIds = [getAuthenticatedUserId(req), ...supervised.rows.map((r) => r.employee_id)];
            effectiveUserId = null;
        }
        const pageLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 500));
        let query = `
            SELECT s.*, u.full_name as employee_name, u.role,
                   r.name AS room_name, r.room_number, r.type AS room_type
            FROM staff_shifts s
            JOIN users u ON s.user_id = u.user_id
            LEFT JOIN rooms r ON r.room_id = s.room_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND s.end_time > $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND s.start_time < $${paramCount++}`;
            params.push(endDate);
        }
        if (effectiveUserId) {
            query += ` AND s.user_id = $${paramCount++}`;
            params.push(effectiveUserId);
        } else if (teamUserIds) {
            query += ` AND s.user_id = ANY($${paramCount++}::uuid[])`;
            params.push(teamUserIds);
        }
        if (req.query.roomId) {
            if (!z.string().uuid().safeParse(req.query.roomId).success) throw new AppError('Invalid room id', 400);
            query += ` AND s.room_id = $${paramCount++}`;
            params.push(req.query.roomId);
        }

        query += ` ORDER BY s.start_time ASC LIMIT $${paramCount}::int`;
        params.push(pageLimit);
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

// Over-staffing guard: more than one employee with the same role assigned to
// the same room during an overlapping window. Returns a warning payload (or
// null); the caller decides to surface it — training and surge coverage make
// blocking wrong, silence worse.
const detectRoomOverstaffing = async (client, shift, role, excludeShiftId = null) => {
    if (!shift.room_id) return null;
    const overlaps = await client.query(`
        SELECT s.shift_id, s.start_time, s.end_time, u.full_name, r.name AS room_name
        FROM staff_shifts s
        JOIN users u ON u.user_id = s.user_id
        JOIN rooms r ON r.room_id = s.room_id
        WHERE s.room_id = $1
          AND s.shift_id <> $2::uuid
          AND u.role = $3
          AND s.start_time < $4
          AND s.end_time > $5
        ORDER BY s.start_time ASC
    `, [
        shift.room_id,
        excludeShiftId || shift.shift_id,
        role,
        shift.end_time,
        shift.start_time
    ]);
    if (!overlaps.rows.length) return null;
    return {
        message: 'Room over-staffing: another employee with the same role is assigned to this room during the same window',
        room: overlaps.rows[0].room_name,
        employees: overlaps.rows.map((row) => row.full_name),
        windows: overlaps.rows.map((row) => ({ from: row.start_time, to: row.end_time }))
    };
};

const createShift = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createShiftSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11701))', [data.userId]);
        const employee = await client.query(
            'SELECT user_id, role FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
            [data.userId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Employee not found, inactive, or not eligible for shift scheduling', 400);

        if (!isGlobalReviewer(req.user)) {
            await assertStaffSupervision(client, req.user, data.userId, 'shifts', { lock: true });
        }

        const conflict = await client.query(`
            SELECT shift_id FROM staff_shifts
            WHERE user_id = $1 AND start_time < $3 AND end_time > $2
            LIMIT 1
        `, [data.userId, data.startTime, data.endTime]);
        if (conflict.rows.length) throw new AppError('Employee already has an overlapping shift', 409);

        const result = await client.query(`
            INSERT INTO staff_shifts (user_id, start_time, end_time, room_id, notes)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [data.userId, data.startTime, data.endTime, data.roomId ?? null, data.notes]);

        // Scheduling over an approved leave is usually a mistake, but shift
        // planners sometimes do it deliberately for on-call coverage — warn
        // loudly instead of blocking.
        const leaveOverlap = await client.query(`
            SELECT start_date, end_date, leave_type
            FROM leave_requests
            WHERE user_id = $1
              AND status = 'Approved'
              AND start_date <= $3::date
              AND end_date >= $2::date
            LIMIT 1
        `, [data.userId, data.startTime, data.endTime]);
        const leaveWarning = leaveOverlap.rows.length ? {
            message: 'Shift overlaps an approved leave',
            leave: leaveOverlap.rows[0]
        } : null;

        // Two employees with the same role in the same room at the same time
        // is usually over-staffing, but it is legitimate for training or
        // surge coverage — warn with the overlapping names, do not block.
        const coverageWarning = await detectRoomOverstaffing(
            client, result.rows[0], employee.rows[0].role
        );

        await logAction(client, {
            userId: req.user.user_id, action: 'SHIFT_CREATED', resourceId: result.rows[0].shift_id,
            resourceTable: 'staff_shifts', ipAddress: req.ip,
            details: { userId: data.userId, startTime: data.startTime, endTime: data.endTime, leaveWarning, coverageWarning }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json({ ...result.rows[0], leave_warning: leaveWarning, coverage_warning: coverageWarning });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23P01') return next(new AppError('Employee already has an overlapping shift', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const deleteShift = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query('SELECT * FROM staff_shifts WHERE shift_id = $1 FOR UPDATE', [id]);
        if (existing.rows.length === 0) throw new AppError('Shift not found', 404);
        if (new Date(existing.rows[0].start_time) <= new Date()) {
            throw new AppError('Shifts that have already started cannot be removed from the roster', 409);
        }
        if (!isGlobalReviewer(req.user)) {
            await assertStaffSupervision(client, req.user, existing.rows[0].user_id, 'shifts', { lock: true });
        }
        const result = await client.query('DELETE FROM staff_shifts WHERE shift_id = $1 RETURNING *', [id]);
        await logAction(client, {
            userId: req.user.user_id, action: 'SHIFT_DELETED', resourceId: id,
            resourceTable: 'staff_shifts', ipAddress: req.ip,
            details: { startTime: result.rows[0].start_time, endTime: result.rows[0].end_time }, required: true
        });
        await client.query('COMMIT');
        res.status(204).send();
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateShift = (db) => async (req, res, next) => {
    let client;
    try {
        const data = updateShiftSchema.parse(req.body || {});
        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query(
            'SELECT * FROM staff_shifts WHERE shift_id = $1 FOR UPDATE',
            [req.params.id]
        );
        if (!existingResult.rows.length) throw new AppError('Shift not found', 404);
        const existing = existingResult.rows[0];
        if (new Date(existing.start_time) <= new Date()) {
            throw new AppError('Shifts that have already started cannot be edited', 409);
        }
        if (!isGlobalReviewer(req.user)) {
            await assertStaffSupervision(client, req.user, existing.user_id, 'shifts', { lock: true });
        }
        if (data.userId && String(data.userId) !== String(existing.user_id)) {
            throw new AppError('Changing the employee requires deleting and recreating the shift', 400);
        }

        const startTime = data.startTime || existing.start_time;
        const endTime = data.endTime || existing.end_time;
        if (new Date(endTime) <= new Date(startTime)) {
            throw new AppError('Shift end time must be after start time', 400);
        }
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11701))', [existing.user_id]);
        const conflict = await client.query(`
            SELECT shift_id FROM staff_shifts
            WHERE user_id = $1 AND shift_id <> $4
              AND start_time < $3 AND end_time > $2
            LIMIT 1
        `, [existing.user_id, startTime, endTime, req.params.id]);
        if (conflict.rows.length) throw new AppError('Employee already has an overlapping shift', 409);

        const result = await client.query(`
            UPDATE staff_shifts
            SET start_time = $1,
                end_time = $2,
                room_id = $3,
                notes = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE shift_id = $5
            RETURNING *
        `, [
            startTime,
            endTime,
            data.roomId !== undefined ? data.roomId : existing.room_id,
            data.notes === undefined ? existing.notes : data.notes,
            req.params.id
        ]);

        // Re-check room over-staffing for the updated window/room assignment.
        const employeeRole = await client.query('SELECT role FROM users WHERE user_id = $1', [existing.user_id]);
        const coverageWarning = await detectRoomOverstaffing(
            client, result.rows[0], employeeRole.rows[0]?.role, req.params.id
        );

        await logAction(client, {
            userId: req.user.user_id,
            action: 'SHIFT_UPDATED',
            resourceId: req.params.id,
            resourceTable: 'staff_shifts',
            ipAddress: req.ip,
            details: {
                previous: { startTime: existing.start_time, endTime: existing.end_time, roomId: existing.room_id, notes: existing.notes },
                current: { startTime, endTime, roomId: result.rows[0].room_id, notes: data.notes === undefined ? existing.notes : data.notes },
                coverageWarning
            },
            required: true
        });
        await client.query('COMMIT');
        res.json({ ...result.rows[0], coverage_warning: coverageWarning });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23P01') return next(new AppError('Employee already has an overlapping shift', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// Attendance

const getAuthenticatedUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id;

const { getAttendanceConfig } = require('../services/attendanceConfigCache');

const calculatePunctualityMetrics = ({
    clockIn,
    clockOut = null,
    shiftStartTime = null,
    shiftEndTime = null,
    config,
    permittedLateMinutes = 0,
    permittedEarlyMinutes = 0
}) => {
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let status = 'Present';

    if (shiftStartTime && clockIn) {
        const cInMs = new Date(clockIn).getTime();
        const sStartMs = new Date(shiftStartTime).getTime();
        const rawLateMin = Math.max(0, (cInMs - sStartMs) / 60000);
        const totalLateGrace = (config?.gracePeriodLateMinutes || 0) + (permittedLateMinutes || 0);

        if (rawLateMin > totalLateGrace) {
            status = 'Late';
            lateMinutes = config?.deductFullDelayAfterGrace
                ? Math.round(Math.max(0, rawLateMin - (permittedLateMinutes || 0)))
                : Math.round(Math.max(0, rawLateMin - totalLateGrace));
        } else {
            status = 'Present';
            lateMinutes = 0;
        }
    }

    if (shiftEndTime && clockOut) {
        const cOutMs = new Date(clockOut).getTime();
        const sEndMs = new Date(shiftEndTime).getTime();
        const rawEarlyMin = Math.max(0, (sEndMs - cOutMs) / 60000);
        const graceEarly = config?.gracePeriodEarlyMinutes || 0;

        if (rawEarlyMin > graceEarly) {
            earlyLeaveMinutes = Math.max(0, Math.round(rawEarlyMin - (permittedEarlyMinutes || 0)));
        } else {
            earlyLeaveMinutes = 0;
        }
    }

    return { lateMinutes, earlyLeaveMinutes, status };
};

const recordAttendanceAudit = async (clientOrDb, {
    logId = null,
    userId,
    actorId = null,
    actionType,
    previousState = null,
    newState = null,
    reason = null,
    ipAddress = null,
    userAgent = null,
    isViolation = false,
    violationDetails = null
}) => {
    try {
        await clientOrDb.query(`
            INSERT INTO attendance_audit_ledger (
                log_id, user_id, actor_user_id, action_type,
                previous_state, new_state, ip_address, user_agent,
                reason, is_violation, violation_details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            logId,
            userId,
            actorId || userId,
            actionType,
            previousState ? JSON.stringify(previousState) : null,
            newState ? JSON.stringify(newState) : null,
            ipAddress,
            userAgent,
            reason,
            isViolation,
            violationDetails ? JSON.stringify(violationDetails) : null
        ]);
    } catch (auditErr) {
        console.error('[AttendanceAuditLedger] Failed to record audit:', auditErr.message);
    }
};

const getAttendance = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, activeOnly, status } = req.query;
        const canReviewAll = ['Developer', 'Admin', 'HR', 'Receptionist', 'Radiologist'].includes(req.user.role);
        let userId = canReviewAll ? req.query.userId : getAuthenticatedUserId(req);
        let teamUserIds = null;
        if (!canReviewAll && req.query.userId && req.query.userId !== getAuthenticatedUserId(req)) {
            const supervised = await db.query(`
                SELECT employee_id FROM staff_supervisor_assignments
                WHERE supervisor_id = $1 AND employee_id = $2 AND revoked_at IS NULL
                  AND starts_at <= CURRENT_TIMESTAMP
                  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            `, [getAuthenticatedUserId(req), req.query.userId]);
            if (supervised.rows.length) {
                userId = req.query.userId;
            }
        } else if (req.query.team === 'true') {
            const supervised = await db.query(`
                SELECT employee_id FROM staff_supervisor_assignments
                WHERE supervisor_id = $1 AND revoked_at IS NULL
                  AND starts_at <= CURRENT_TIMESTAMP
                  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            `, [getAuthenticatedUserId(req)]);
            teamUserIds = [getAuthenticatedUserId(req), ...supervised.rows.map((r) => r.employee_id)];
            userId = null;
        }
        const limit = Math.min(1000, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
        if (startDate || endDate) ensureDateRange(startDate, endDate);
        // Each ledger row is enriched with its linked shift window (expected
        // start/end) and derived duration so the UI can show punctuality
        // against the roster without a second request.
        let query = `
            SELECT a.*, u.full_name as employee_name, u.role,
                   COALESCE(a.scheduled_start_snapshot, s.start_time) AS shift_start,
                   COALESCE(a.scheduled_end_snapshot, s.end_time) AS shift_end,
                   r.name AS room_name,
                   CASE WHEN a.clock_out IS NOT NULL AND a.status <> 'Absent'
                        THEN ROUND(EXTRACT(EPOCH FROM (a.clock_out - a.clock_in)) / 3600, 2)
                        ELSE NULL
                   END AS worked_hours
            FROM attendance_logs a
            JOIN users u ON a.user_id = u.user_id
            LEFT JOIN staff_shifts s ON s.shift_id = a.shift_id
            LEFT JOIN rooms r ON r.room_id = s.room_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND a.clock_in >= $${paramCount++}::date`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND a.clock_in < ($${paramCount}::date + interval '1 day')`;
            params.push(endDate);
            paramCount++;
        }
        if (userId) {
            query += ` AND a.user_id = $${paramCount++}`;
            params.push(userId);
        } else if (teamUserIds) {
            query += ` AND a.user_id = ANY($${paramCount++}::uuid[])`;
            params.push(teamUserIds);
        }
        if (status && ['Present', 'Late', 'Absent', 'Half-Day'].includes(status)) {
            query += ` AND a.status = $${paramCount++}::varchar`;
            params.push(status);
        }
        if (String(activeOnly).toLowerCase() === 'true') {
            query += ` AND a.clock_out IS NULL`;
        }

        query += ` ORDER BY a.clock_in DESC LIMIT $${paramCount}::int`;
        params.push(limit);
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const ensureActiveAttendanceClockIn = async (client, userId, defaultNotes = '[system] Auto clock-in upon opening shift') => {
    if (!userId) return null;
    const employee = await client.query(
        'SELECT user_id FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
        [userId, EMPLOYEE_ROLES]
    );
    if (!employee.rows.length) return null;

    const existing = await client.query(
        'SELECT * FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1 FOR UPDATE',
        [userId]
    );
    if (existing.rows.length > 0) {
        const activeSession = existing.rows[0];
        const stale = new Date(activeSession.clock_in) < new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (!stale) {
            return activeSession;
        }
        await client.query(`
            UPDATE attendance_logs a
            SET clock_out = GREATEST(
                    a.clock_in,
                    LEAST(
                        CURRENT_TIMESTAMP,
                        COALESCE((SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id), a.clock_in + interval '16 hours')
                    )
                ),
                notes = CONCAT_WS(E'\n', NULLIF(a.notes, ''), '[system] Stale attendance session automatically capped upon opening shift'),
                corrected_at = CURRENT_TIMESTAMP
            WHERE a.log_id = $1
        `, [activeSession.log_id]);
    }

    const scheduledShift = await client.query(`
        SELECT shift_id, start_time, end_time
        FROM staff_shifts
        WHERE user_id = $1
          AND CURRENT_TIMESTAMP >= start_time - interval '4 hours'
          AND CURRENT_TIMESTAMP < end_time
          AND NOT EXISTS (SELECT 1 FROM attendance_logs a WHERE a.shift_id = staff_shifts.shift_id)
        ORDER BY ABS(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)))
        LIMIT 1
        FOR UPDATE
    `, [userId]);
    const shift = scheduledShift.rows[0] || null;

    const result = await client.query(`
        INSERT INTO attendance_logs (
            user_id, clock_in, shift_id, late_minutes, status, notes,
            shift_link_type, scheduled_start_snapshot, scheduled_end_snapshot
        )
        VALUES (
            $1,
            CURRENT_TIMESTAMP,
            $2,
            CASE WHEN $3::timestamptz IS NULL THEN 0 ELSE GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $3::timestamptz)) / 60) END,
            CASE WHEN $3::timestamptz IS NOT NULL AND CURRENT_TIMESTAMP > $3::timestamptz THEN 'Late' ELSE 'Present' END,
            $4,
            $5,
            $6,
            $7
        ) RETURNING *
    `, [
        userId,
        shift?.shift_id || null,
        shift?.start_time || null,
        defaultNotes,
        shift ? 'Auto' : 'Unscheduled',
        shift?.start_time || null,
        shift?.end_time || null
    ]);

    return result.rows[0];
};

const clockIn = (db) => async (req, res, next) => {
    let client;
    try {
        const data = clockInSchema.parse(req.body || {});
        const userId = getAuthenticatedUserId(req);
        if (!userId) return next(new AppError('Authenticated user id is missing', 401));

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [userId]);
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
            [userId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Attendance is available to active employees only', 403);
        const employeeName = req.user?.full_name || req.user?.name || 'Employee';

        const existing = await client.query('SELECT * FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL FOR UPDATE', [userId]);
        if (existing.rows.length > 0) {
            const activeSession = existing.rows[0];
            const stale = new Date(activeSession.clock_in) < new Date(Date.now() - 24 * 60 * 60 * 1000);
            if (!stale) {
                await client.query('COMMIT');
                return res.json({
                    ...activeSession,
                    already_clocked_in: true,
                    message: 'Already clocked in'
                });
            }
            const settled = await client.query(`
                UPDATE attendance_logs a
                SET clock_out = GREATEST(
                        a.clock_in,
                        LEAST(
                            CURRENT_TIMESTAMP,
                            COALESCE((SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id), a.clock_in + interval '16 hours')
                        )
                    ),
                    notes = CONCAT_WS(E'\n', NULLIF(a.notes, ''), '[system] Stale attendance session automatically capped'),
                    corrected_by = $2,
                    corrected_at = CURRENT_TIMESTAMP
                WHERE a.log_id = $1
                RETURNING a.*
            `, [activeSession.log_id, userId]);
            await logAction(client, {
                userId,
                action: 'ATTENDANCE_STALE_SESSION_CLOSED',
                resourceId: activeSession.log_id,
                resourceTable: 'attendance_logs',
                ipAddress: req.ip,
                details: { clockIn: activeSession.clock_in, clockOut: settled.rows[0].clock_out, reason: 'New clock-in after 24 hours' },
                required: true
            });
            await recordAttendanceAudit(client, {
                logId: activeSession.log_id,
                userId,
                actorId: userId,
                actionType: 'STALE_SESSION_CLOSED',
                previousState: activeSession,
                newState: settled.rows[0],
                reason: 'New clock-in after 24 hours',
                ipAddress: req.ip,
                userAgent: req.get?.('user-agent') || null,
                isViolation: true,
                violationDetails: { reason: 'Stale session exceeded 24 hours' }
            });
        }

        const config = await getAttendanceConfig(client);

        const scheduledShift = await client.query(`
            SELECT shift_id, start_time, end_time
            FROM staff_shifts
            WHERE user_id = $1
              AND CURRENT_TIMESTAMP >= start_time - interval '4 hours'
              AND CURRENT_TIMESTAMP < end_time
              AND NOT EXISTS (SELECT 1 FROM attendance_logs a WHERE a.shift_id = staff_shifts.shift_id)
            ORDER BY ABS(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time)))
            LIMIT 1
            FOR UPDATE
        `, [userId]);
        const shift = scheduledShift.rows[0] || null;

        // Check if employee has an approved LateArrival permission today or for this shift
        const approvedPermRes = await client.query(`
            SELECT minutes_granted, reason FROM attendance_permissions
            WHERE user_id = $1
              AND (
                  shift_id = $2
                  OR effective_date = CURRENT_DATE
                  OR ($3::timestamptz IS NOT NULL AND effective_date = ($3::timestamptz AT TIME ZONE 'Africa/Cairo')::date)
              )
              AND permission_type = 'LateArrival'
              AND status = 'Approved'
            ORDER BY created_at DESC
            LIMIT 1
        `, [userId, shift?.shift_id || null, shift?.start_time || null]);
        const approvedPerm = approvedPermRes.rows[0] || null;
        const permittedLateMinutes = approvedPerm ? (approvedPerm.minutes_granted || 0) : 0;

        let shiftLinkType = shift ? 'Auto' : 'Unscheduled';
        let scheduledStart = shift?.start_time || null;
        let scheduledEnd = shift?.end_time || null;

        const punctuality = calculatePunctualityMetrics({
            clockIn: new Date(),
            shiftStartTime: shift?.start_time || null,
            config,
            permittedLateMinutes
        });
        const lateMinutes = punctuality.lateMinutes;
        const status = punctuality.status;

        const appendNotes = approvedPerm
            ? (data.notes ? `${data.notes} (إذن تأخير معتمد: ${permittedLateMinutes} د)` : `إذن تأخير معتمد: ${permittedLateMinutes} د`)
            : data.notes;

        const result = await client.query(`
            INSERT INTO attendance_logs (
                user_id, clock_in, shift_id, late_minutes, status, notes,
                shift_link_type, scheduled_start_snapshot, scheduled_end_snapshot
            )
            VALUES (
                $1,
                CURRENT_TIMESTAMP,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8
            ) RETURNING *
        `, [
            userId,
            shift?.shift_id || null,
            lateMinutes,
            status,
            appendNotes,
            shiftLinkType,
            scheduledStart,
            scheduledEnd
        ]);

        const insertedLog = result.rows[0];

        await logAction(client, {
            userId, action: 'ATTENDANCE_CLOCK_IN', resourceId: insertedLog.log_id,
            resourceTable: 'attendance_logs', ipAddress: req.ip,
            details: { notes: data.notes || null, shiftLinkType, lateMinutes, status }, required: true
        });

        await recordAttendanceAudit(client, {
            logId: insertedLog.log_id,
            userId,
            actorId: userId,
            actionType: 'CLOCK_IN',
            newState: insertedLog,
            reason: data.notes || 'Normal clock-in',
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null,
            isViolation: status === 'Late' || shiftLinkType === 'Unscheduled',
            violationDetails: status === 'Late' ? { lateMinutes, graceAllowed: config.gracePeriodLateMinutes } : (shiftLinkType === 'Unscheduled' ? { unscheduled: true } : null)
        });

        if (status === 'Late') {
            await triggerEventForRole(client, 'AttendanceLate', 'HR', {
                entityType: 'Attendance',
                entityId: insertedLog.log_id,
                variables: { employee_name: employeeName, late_minutes: lateMinutes }
            });

            await triggerEventForRole(client, 'AttendanceLate', 'Admin', {
                entityType: 'Attendance',
                entityId: insertedLog.log_id,
                variables: { employee_name: employeeName, late_minutes: lateMinutes }
            });
        }

        if (shiftLinkType === 'Unscheduled') {
            await triggerEventForRole(client, 'AttendanceUnscheduled', 'HR', {
                entityType: 'Attendance',
                entityId: insertedLog.log_id,
                variables: { employee_name: employeeName, clock_in: new Date().toISOString() }
            });
            await triggerEventForRole(client, 'AttendanceUnscheduled', 'Admin', {
                entityType: 'Attendance',
                entityId: insertedLog.log_id,
                variables: { employee_name: employeeName, clock_in: new Date().toISOString() }
            });
        }

        await client.query('COMMIT');
        res.status(201).json(insertedLog);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const clockOut = (db) => async (req, res, next) => {
    let client;
    try {
        const data = clockOutSchema.parse(req.body || {});
        const userId = getAuthenticatedUserId(req);
        if (!userId) return next(new AppError('Authenticated user id is missing', 401));

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [userId]);

        const isSupervisor = ['Admin', 'Developer', 'HR'].includes(req.user?.role);
        const allowForce = Boolean(req.body?.force && isSupervisor);

        if (!allowForce) {
            const openCashierShift = await client.query(`
                SELECT shift_id
                FROM cashier_shifts
                WHERE cashier_id = $1 AND status = 'Open'
                LIMIT 1
            `, [userId]);
            if (openCashierShift.rows.length) {
                await client.query('ROLLBACK');
                return next(new AppError(
                    'Close your cashier shift and reconcile the cash drawer before clocking out',
                    409,
                    true,
                    'OPEN_CASHIER_SHIFT'
                ));
            }

            const openReceptionShift = await client.query(`
                SELECT session_id
                FROM reception_shift_sessions
                WHERE user_id = $1 AND status = 'Open'
                LIMIT 1
            `, [userId]);
            if (openReceptionShift.rows.length) {
                await client.query('ROLLBACK');
                return next(new AppError(
                    'Transfer or complete your active reception tasks and close your reception shift before clocking out',
                    409,
                    true,
                    'OPEN_RECEPTION_SHIFT'
                ));
            }
        }

        const active = await client.query(
            'SELECT * FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1 FOR UPDATE',
            [userId]
        );

        if (active.rows.length === 0) {
            await client.query('COMMIT');
            return res.json({
                clocked_in: false,
                message: 'No active clock-in session found'
            });
        }
        const activeLog = active.rows[0];

        const employee = await client.query('SELECT full_name, role FROM users WHERE user_id = $1', [userId]);
        const employeeName = employee.rows[0]?.full_name || 'Staff';

        const config = await getAttendanceConfig(client);

        let earlyLeaveMinutes = 0;
        let shiftEndTime = activeLog.scheduled_end_snapshot;
        if (!shiftEndTime && activeLog.shift_id) {
            const shiftRes = await client.query('SELECT start_time, end_time FROM staff_shifts WHERE shift_id = $1', [activeLog.shift_id]);
            shiftEndTime = shiftRes.rows[0]?.end_time || null;
        }

        const isEmergency = Boolean(data.isEmergency);
        const emergencyReason = data.emergencyReason || data.notes || 'Emergency departure without prior approval';

        if (shiftEndTime) {
            const scheduledEndMs = new Date(shiftEndTime).getTime();
            const nowMs = Date.now();
            const rawEarlyMs = scheduledEndMs - nowMs;
            const rawEarlyMinutes = rawEarlyMs > 0 ? (rawEarlyMs / (60 * 1000)) : 0;

            if (rawEarlyMinutes > config.gracePeriodEarlyMinutes) {
                const permRes = await client.query(`
                    SELECT permission_id, minutes_granted, reason
                    FROM attendance_permissions
                    WHERE user_id = $1
                      AND (
                          shift_id = $2
                          OR effective_date = CURRENT_DATE
                          OR ($3::timestamptz IS NOT NULL AND effective_date = ($3::timestamptz AT TIME ZONE 'Africa/Cairo')::date)
                      )
                      AND permission_type = 'EarlyDeparture'
                      AND status = 'Approved'
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [userId, activeLog.shift_id || null, activeLog.scheduled_start_snapshot || null]);
                const approvedPerm = permRes.rows[0] || null;

                if (!approvedPerm && !allowForce && config.requireEarlyLeaveApproval && !isEmergency) {
                    await recordAttendanceAudit(client, {
                        logId: activeLog.log_id,
                        userId,
                        actorId: userId,
                        actionType: 'EARLY_DEPARTURE_BLOCKED',
                        previousState: activeLog,
                        reason: 'Unapproved early departure attempt blocked by system policy',
                        ipAddress: req.ip,
                        userAgent: req.get?.('user-agent') || null,
                        isViolation: true,
                        violationDetails: {
                            rawEarlyMinutes: Math.round(rawEarlyMinutes),
                            graceMinutes: config.gracePeriodEarlyMinutes,
                            shiftEndTime,
                            canSubmitEmergency: true
                        }
                    });

                    await triggerEventForRole(client, 'AttendanceEarlyDepartureAttempt', 'HR', {
                        entityType: 'Attendance',
                        entityId: activeLog.log_id,
                        variables: { employee_name: employeeName, early_minutes: Math.round(rawEarlyMinutes) }
                    });

                    await client.query('COMMIT');
                    return next(new AppError(
                        'Early departure requires prior approved management permission. Please submit an early departure request or submit an emergency departure with reason.',
                        403,
                        true,
                        'EARLY_DEPARTURE_PROHIBITED'
                    ));
                }

                const grantedMinutes = approvedPerm ? (approvedPerm.minutes_granted || 0) : 0;
                earlyLeaveMinutes = Math.max(0, Math.round(rawEarlyMinutes - grantedMinutes));
            }
        }

        const stale = new Date(activeLog.clock_in) < new Date(Date.now() - 24 * 60 * 60 * 1000);
        const capped = stale || new Date(activeLog.clock_in) < new Date(Date.now() - 16 * 60 * 60 * 1000);
        const effectiveNotes = isEmergency
            ? [data.notes, `[طوارئ] انصراف اضطراري غير معتمد: ${emergencyReason}`].filter(Boolean).join('\n')
            : data.notes;

        const result = await client.query(`
            UPDATE attendance_logs a
            SET clock_out = CASE
                    WHEN $3::boolean THEN GREATEST(
                        a.clock_in,
                        LEAST(
                            CURRENT_TIMESTAMP,
                            COALESCE((SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id), a.clock_in + interval '16 hours')
                        )
                    )
                    ELSE LEAST(CURRENT_TIMESTAMP, a.clock_in + interval '16 hours')
                END,
                early_leave_minutes = $5::int,
                break_end = CASE WHEN a.break_start IS NOT NULL AND a.break_end IS NULL THEN CURRENT_TIMESTAMP ELSE a.break_end END,
                total_break_minutes = CASE WHEN a.break_start IS NOT NULL AND a.break_end IS NULL
                    THEN COALESCE(a.total_break_minutes, 0) + GREATEST(0, ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a.break_start)) / 60)::int)
                    ELSE a.total_break_minutes END,
                notes = CASE
                    WHEN $3::boolean
                        THEN CONCAT_WS(E'\n', NULLIF(COALESCE($1, a.notes), ''), '[system] Stale attendance session automatically capped')
                    WHEN CURRENT_TIMESTAMP > a.clock_in + interval '16 hours'
                        THEN CONCAT_WS(E'\n', NULLIF(COALESCE($1, a.notes), ''), '[system] Session capped at the 16-hour limit')
                    ELSE COALESCE($1, a.notes)
                END,
                corrected_by = CASE WHEN $3::boolean OR CURRENT_TIMESTAMP > a.clock_in + interval '16 hours'
                    THEN $4 ELSE a.corrected_by END,
                corrected_at = CASE WHEN $3::boolean OR CURRENT_TIMESTAMP > a.clock_in + interval '16 hours'
                    THEN CURRENT_TIMESTAMP ELSE a.corrected_at END
            WHERE a.log_id = $2
            RETURNING a.*
        `, [effectiveNotes, activeLog.log_id, stale, userId, earlyLeaveMinutes]);

        const updatedLog = result.rows[0];

        await logAction(client, {
            userId, action: isEmergency ? 'ATTENDANCE_CLOCK_OUT_EMERGENCY' : 'ATTENDANCE_CLOCK_OUT', resourceId: updatedLog.log_id,
            resourceTable: 'attendance_logs', ipAddress: req.ip,
            details: { notes: effectiveNotes || null, staleSessionCapped: stale, sessionCapped: capped, earlyLeaveMinutes, isEmergency }, required: true
        });

        await recordAttendanceAudit(client, {
            logId: updatedLog.log_id,
            userId,
            actorId: userId,
            actionType: isEmergency ? 'EMERGENCY_UNAPPROVED_CLOCK_OUT' : 'CLOCK_OUT',
            previousState: activeLog,
            newState: updatedLog,
            reason: isEmergency ? `[طوارئ] ${emergencyReason}` : (data.notes || 'Normal clock-out'),
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null,
            isViolation: earlyLeaveMinutes > 0 || isEmergency,
            violationDetails: {
                earlyLeaveMinutes,
                isEmergency,
                emergencyReason: isEmergency ? emergencyReason : null
            }
        });

        if (isEmergency) {
            await triggerEventForRole(client, 'AttendanceEmergencyDeparture', 'HR', {
                entityType: 'Attendance',
                entityId: updatedLog.log_id,
                variables: { employee_name: employeeName, early_minutes: earlyLeaveMinutes, reason: emergencyReason }
            });

            await triggerEventForRole(client, 'AttendanceEmergencyDeparture', 'Admin', {
                entityType: 'Attendance',
                entityId: updatedLog.log_id,
                variables: { employee_name: employeeName, early_minutes: earlyLeaveMinutes, reason: emergencyReason }
            });
        }

        await client.query('COMMIT');
        res.json({ ...updatedLog, stale_session_capped: stale, session_capped: capped });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// Break Tracking

const breakStart = (db) => async (req, res, next) => {
    let client;
    try {
        const data = breakStartSchema.parse(req.body || {});
        const userId = getAuthenticatedUserId(req);
        if (!userId) return next(new AppError('Authenticated user id is missing', 401));

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [userId]);

        const active = await client.query(
            'SELECT * FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1 FOR UPDATE',
            [userId]
        );

        if (active.rows.length === 0) {
            await client.query('COMMIT');
            return next(new AppError('No active clock-in session found', 409));
        }
        const activeLog = active.rows[0];

        if (activeLog.break_start && !activeLog.break_end) {
            await client.query('COMMIT');
            return res.json({
                ...activeLog,
                break_already_started: true,
                message: 'Break already in progress'
            });
        }

        const isPaidBreak = data.isPaid !== false;
        const result = await client.query(`
            UPDATE attendance_logs
            SET break_start = CURRENT_TIMESTAMP,
                is_paid_break = $2,
                notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $3::text)
            WHERE log_id = $1
            RETURNING *
        `, [activeLog.log_id, isPaidBreak, data.notes ? `[Break Start] ${data.notes}` : null]);

        await logAction(client, {
            userId, action: 'ATTENDANCE_BREAK_START', resourceId: activeLog.log_id,
            resourceTable: 'attendance_logs', ipAddress: req.ip,
            details: { isPaid: isPaidBreak, notes: data.notes || null }, required: true
        });

        await recordAttendanceAudit(client, {
            logId: activeLog.log_id,
            userId,
            actorId: userId,
            actionType: 'BREAK_START',
            previousState: activeLog,
            newState: result.rows[0],
            reason: data.notes || 'Break started',
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const breakEnd = (db) => async (req, res, next) => {
    let client;
    try {
        const data = breakEndSchema.parse(req.body || {});
        const userId = getAuthenticatedUserId(req);
        if (!userId) return next(new AppError('Authenticated user id is missing', 401));

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [userId]);

        const active = await client.query(
            'SELECT * FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1 FOR UPDATE',
            [userId]
        );

        if (active.rows.length === 0) {
            await client.query('COMMIT');
            return next(new AppError('No active clock-in session found', 409));
        }
        const activeLog = active.rows[0];

        if (!activeLog.break_start || activeLog.break_end) {
            await client.query('COMMIT');
            return next(new AppError('No active break to end', 409));
        }

        const breakStartTime = new Date(activeLog.break_start).getTime();
        const breakEndTime = Date.now();
        const breakMinutes = Math.max(0, Math.round((breakEndTime - breakStartTime) / 60000));
        const totalBreakMinutes = (activeLog.total_break_minutes || 0) + breakMinutes;

        const result = await client.query(`
            UPDATE attendance_logs
            SET break_end = CURRENT_TIMESTAMP,
                total_break_minutes = $2,
                notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $3::text)
            WHERE log_id = $1
            RETURNING *
        `, [activeLog.log_id, totalBreakMinutes, data.notes ? `[Break End] ${data.notes}` : null]);

        await logAction(client, {
            userId, action: 'ATTENDANCE_BREAK_END', resourceId: activeLog.log_id,
            resourceTable: 'attendance_logs', ipAddress: req.ip,
            details: { breakMinutes, totalBreakMinutes, notes: data.notes || null }, required: true
        });

        await recordAttendanceAudit(client, {
            logId: activeLog.log_id,
            userId,
            actorId: userId,
            actionType: 'BREAK_END',
            previousState: activeLog,
            newState: result.rows[0],
            reason: data.notes || 'Break ended',
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateAttendance = (db) => async (req, res, next) => {
    let client;
    try {
        const data = updateAttendanceSchema.parse(req.body);
        const reviewerId = getAuthenticatedUserId(req);
        client = await db.connect();
        await client.query('BEGIN');
        const target = await client.query(
            'SELECT user_id FROM attendance_logs WHERE log_id = $1',
            [req.params.id]
        );
        if (!target.rows.length) throw new AppError('Attendance record not found', 404);
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [target.rows[0].user_id]);
        const existing = await client.query(
            'SELECT * FROM attendance_logs WHERE log_id = $1 FOR UPDATE',
            [req.params.id]
        );
        if (!existing.rows.length) throw new AppError('Attendance record not found', 404);

        const config = await getAttendanceConfig(client);

        // Fetch shift details if available
        let shiftStart = null;
        let shiftEnd = null;
        if (existing.rows[0].shift_id) {
            const sRes = await client.query('SELECT start_time, end_time FROM staff_shifts WHERE shift_id = $1', [existing.rows[0].shift_id]);
            shiftStart = sRes.rows[0]?.start_time || existing.rows[0].scheduled_start_snapshot;
            shiftEnd = sRes.rows[0]?.end_time || existing.rows[0].scheduled_end_snapshot;
        } else {
            shiftStart = existing.rows[0].scheduled_start_snapshot;
            shiftEnd = existing.rows[0].scheduled_end_snapshot;
        }

        // Check for any approved permissions
        const permRes = await client.query(`
            SELECT permission_type, minutes_granted FROM attendance_permissions
            WHERE user_id = $1
              AND (
                  shift_id = $2
                  OR effective_date = ($3::timestamptz AT TIME ZONE 'Africa/Cairo')::date
                  OR effective_date = CURRENT_DATE
              )
              AND status = 'Approved'
        `, [target.rows[0].user_id, existing.rows[0].shift_id || null, data.clockIn]);

        let latePermMin = 0;
        let earlyPermMin = 0;
        for (const p of permRes.rows) {
            if (p.permission_type === 'LateArrival') latePermMin = Math.max(latePermMin, p.minutes_granted || 0);
            if (p.permission_type === 'EarlyDeparture') earlyPermMin = Math.max(earlyPermMin, p.minutes_granted || 0);
        }

        const metrics = calculatePunctualityMetrics({
            clockIn: data.clockIn,
            clockOut: data.clockOut,
            shiftStartTime: shiftStart,
            shiftEndTime: shiftEnd,
            config,
            permittedLateMinutes: latePermMin,
            permittedEarlyMinutes: earlyPermMin
        });

        const effectiveStatus = (data.status === 'Absent' || data.status === 'Half-Day')
            ? data.status
            : (metrics.lateMinutes > 0 ? 'Late' : (data.status || metrics.status));

        const effectiveLate = (effectiveStatus === 'Absent') ? 0 : metrics.lateMinutes;
        const effectiveEarly = (effectiveStatus === 'Absent') ? 0 : metrics.earlyLeaveMinutes;

        const updated = await client.query(`
            UPDATE attendance_logs a
            SET clock_in = $2::timestamptz,
                clock_out = $3::timestamptz,
                status = $4,
                notes = $5,
                late_minutes = $6,
                early_leave_minutes = $7,
                corrected_by = $8,
                corrected_at = CURRENT_TIMESTAMP
            WHERE a.log_id = $1
            RETURNING a.*
        `, [req.params.id, data.clockIn, data.clockOut, effectiveStatus, data.notes || null, effectiveLate, effectiveEarly, reviewerId]);

        await logAction(client, {
            userId: reviewerId,
            action: 'ATTENDANCE_CORRECTED',
            resourceId: req.params.id,
            resourceTable: 'attendance_logs',
            ipAddress: req.ip,
            details: {
                previous: {
                    clockIn: existing.rows[0].clock_in,
                    clockOut: existing.rows[0].clock_out,
                    status: existing.rows[0].status
                },
                current: { clockIn: data.clockIn, clockOut: data.clockOut, status: data.status },
                notes: data.notes || null
            },
            required: true
        });

        await recordAttendanceAudit(client, {
            logId: req.params.id,
            userId: target.rows[0].user_id,
            actorId: reviewerId,
            actionType: 'ADMIN_CORRECTION',
            previousState: existing.rows[0],
            newState: updated.rows[0],
            reason: data.notes || 'Admin manual correction',
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null,
            isViolation: updated.rows[0].status === 'Late' || updated.rows[0].status === 'Absent'
        });

        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23P01') return next(new AppError('Attendance correction overlaps another attendance session for this employee. Please adjust timestamps.', 409));
        if (error?.code === '23505') return next(new AppError('Employee already has another open attendance session. Please close the active session first.', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const recordManualAttendance = (db) => async (req, res, next) => {
    let client;
    try {
        const data = manualAttendanceSchema.parse(req.body);
        const reviewerId = getAuthenticatedUserId(req);
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [data.userId]);

        const employee = await client.query(
            'SELECT user_id, full_name FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
            [data.userId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Eligible active employee not found', 404);

        const scheduledShift = await client.query(`
            SELECT shift_id, start_time, end_time
            FROM staff_shifts
            WHERE user_id = $1
              AND $2::timestamptz >= start_time - interval '4 hours'
              AND $2::timestamptz <= end_time + interval '4 hours'
            ORDER BY ABS(EXTRACT(EPOCH FROM ($2::timestamptz - start_time)))
            LIMIT 1
        `, [data.userId, data.clockIn]);
        const shift = scheduledShift.rows[0] || null;

        const config = await getAttendanceConfig(client);

        // Check for any approved permissions for this user/date
        const permRes = await client.query(`
            SELECT permission_type, minutes_granted FROM attendance_permissions
            WHERE user_id = $1
              AND (
                  shift_id = $2
                  OR effective_date = ($3::timestamptz AT TIME ZONE 'Africa/Cairo')::date
                  OR effective_date = CURRENT_DATE
              )
              AND status = 'Approved'
        `, [data.userId, shift?.shift_id || null, data.clockIn]);

        let latePermMin = 0;
        let earlyPermMin = 0;
        for (const p of permRes.rows) {
            if (p.permission_type === 'LateArrival') latePermMin = Math.max(latePermMin, p.minutes_granted || 0);
            if (p.permission_type === 'EarlyDeparture') earlyPermMin = Math.max(earlyPermMin, p.minutes_granted || 0);
        }

        const metrics = calculatePunctualityMetrics({
            clockIn: data.clockIn,
            clockOut: data.clockOut,
            shiftStartTime: shift?.start_time || null,
            shiftEndTime: shift?.end_time || null,
            config,
            permittedLateMinutes: latePermMin,
            permittedEarlyMinutes: earlyPermMin
        });

        const effectiveStatus = (data.status === 'Absent' || data.status === 'Half-Day')
            ? data.status
            : (metrics.lateMinutes > 0 ? 'Late' : (data.status || metrics.status));

        const effectiveLate = (effectiveStatus === 'Absent') ? 0 : metrics.lateMinutes;
        const effectiveEarly = (effectiveStatus === 'Absent') ? 0 : metrics.earlyLeaveMinutes;

        const result = await client.query(`
            INSERT INTO attendance_logs (
                user_id, clock_in, clock_out, shift_id, status, notes,
                late_minutes, early_leave_minutes, corrected_by, corrected_at,
                shift_link_type, scheduled_start_snapshot, scheduled_end_snapshot
            )
            VALUES (
                $1,
                $2::timestamptz,
                $3::timestamptz,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                CURRENT_TIMESTAMP,
                $10,
                $11,
                $12
            ) RETURNING *
        `, [
            data.userId,
            data.clockIn,
            data.clockOut || null,
            shift?.shift_id || null,
            effectiveStatus,
            data.notes,
            effectiveLate,
            effectiveEarly,
            reviewerId,
            shift ? 'Manual' : 'Unscheduled',
            shift?.start_time || null,
            shift?.end_time || null
        ]);

        const insertedLog = result.rows[0];

        await logAction(client, {
            userId: reviewerId,
            action: 'ATTENDANCE_MANUAL_RECORDED',
            resourceId: insertedLog.log_id,
            resourceTable: 'attendance_logs',
            ipAddress: req.ip,
            details: {
                targetUserId: data.userId,
                clockIn: data.clockIn,
                clockOut: data.clockOut || null,
                status: data.status,
                notes: data.notes
            },
            required: true
        });

        await recordAttendanceAudit(client, {
            logId: insertedLog.log_id,
            userId: data.userId,
            actorId: reviewerId,
            actionType: 'MANUAL_ENTRY',
            newState: insertedLog,
            reason: data.notes,
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null,
            isViolation: data.status === 'Late' || data.status === 'Absent'
        });

        await client.query('COMMIT');
        res.status(201).json(insertedLog);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23P01') return next(new AppError('Manual attendance record overlaps another attendance session for this employee. Please adjust timestamps.', 409));
        if (error?.code === '23505') return next(new AppError('Employee already has another open attendance session. Please close the active session first.', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getAttendanceSettings = (db) => async (req, res, next) => {
    try {
        const config = await getAttendanceConfig(db);
        res.json(config);
    } catch (error) {
        next(error);
    }
};

const updateAttendanceSettings = (db) => async (req, res, next) => {
    let client;
    try {
        const data = updateAttendanceSettingsSchema.parse(req.body);
        const reviewerId = getAuthenticatedUserId(req);
        client = await db.connect();
        await client.query('BEGIN');

        const exemptRolesVal = Array.isArray(data.exemptRolesFromLoginRestriction)
            ? data.exemptRolesFromLoginRestriction.filter(Boolean).join(',')
            : (data.exemptRolesFromLoginRestriction !== undefined ? String(data.exemptRolesFromLoginRestriction) : null);

        const mapFields = [
            { key: 'hr.attendance.grace_period_late_minutes', val: data.gracePeriodLateMinutes !== undefined ? String(data.gracePeriodLateMinutes) : null },
            { key: 'hr.attendance.grace_period_early_minutes', val: data.gracePeriodEarlyMinutes !== undefined ? String(data.gracePeriodEarlyMinutes) : null },
            { key: 'hr.attendance.deduct_full_delay_after_grace', val: data.deductFullDelayAfterGrace !== undefined ? String(data.deductFullDelayAfterGrace) : null },
            { key: 'hr.attendance.require_early_leave_approval', val: data.requireEarlyLeaveApproval !== undefined ? String(data.requireEarlyLeaveApproval) : null },
            { key: 'hr.attendance.enforce_shift_login_restriction', val: data.enforceShiftLoginRestriction !== undefined ? String(data.enforceShiftLoginRestriction) : null },
            { key: 'hr.attendance.login_buffer_before_minutes', val: data.loginBufferBeforeMinutes !== undefined ? String(data.loginBufferBeforeMinutes) : null },
            { key: 'hr.attendance.login_buffer_after_minutes', val: data.loginBufferAfterMinutes !== undefined ? String(data.loginBufferAfterMinutes) : null },
            { key: 'hr.attendance.exempt_roles_from_login_restriction', val: exemptRolesVal }
        ];

        for (const item of mapFields) {
            if (item.val !== null) {
                await client.query(`
                    INSERT INTO system_settings (setting_key, setting_value, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (setting_key) DO UPDATE
                    SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
                `, [item.key, item.val]);
            }
        }

        await logAction(client, {
            userId: reviewerId,
            action: 'ATTENDANCE_SETTINGS_UPDATED',
            resourceId: null,
            resourceTable: 'system_settings',
            ipAddress: req.ip,
            details: data,
            required: true
        });

        await client.query('COMMIT');
        invalidateAttendanceConfigCache();
        const updatedConfig = await getAttendanceConfig(db);
        res.json(updatedConfig);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getAttendancePermissions = (db) => async (req, res, next) => {
    try {
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const userId = canReviewAll ? req.query.userId : getAuthenticatedUserId(req);
        const { startDate, endDate, status, permissionType } = req.query;

        let query = `
            SELECT p.*,
                   u.full_name as employee_name, u.role as employee_role,
                   r.full_name as reviewer_name,
                   s.start_time as shift_start, s.end_time as shift_end
            FROM attendance_permissions p
            JOIN users u ON u.user_id = p.user_id
            LEFT JOIN users r ON r.user_id = p.reviewed_by
            LEFT JOIN staff_shifts s ON s.shift_id = p.shift_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (userId) {
            query += ` AND p.user_id = $${paramCount++}`;
            params.push(userId);
        }
        if (status && ['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status)) {
            query += ` AND p.status = $${paramCount++}`;
            params.push(status);
        }
        if (permissionType && ['EarlyDeparture', 'LateArrival', 'EmergencyAccess'].includes(permissionType)) {
            query += ` AND p.permission_type = $${paramCount++}`;
            params.push(permissionType);
        }
        if (startDate) {
            query += ` AND p.effective_date >= $${paramCount++}::date`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND p.effective_date <= $${paramCount++}::date`;
            params.push(endDate);
        }

        query += ` ORDER BY p.created_at DESC LIMIT 200`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createAttendancePermission = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createAttendancePermissionSchema.parse(req.body);
        const requesterId = getAuthenticatedUserId(req);
        const isSupervisor = ['Admin', 'Developer', 'HR'].includes(req.user.role);
        const targetUserId = (isSupervisor && data.userId) ? data.userId : requesterId;

        client = await db.connect();
        await client.query('BEGIN');

        const userRes = await client.query('SELECT full_name, role FROM users WHERE user_id = $1 AND is_active = TRUE', [targetUserId]);
        if (!userRes.rows.length) throw new AppError('Employee not found or inactive', 404);
        const employeeName = userRes.rows[0].full_name;

        const result = await client.query(`
            INSERT INTO attendance_permissions (
                user_id, shift_id, permission_type, effective_date,
                allowed_time, minutes_granted, reason, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending')
            RETURNING *
        `, [
            targetUserId,
            data.shiftId || null,
            data.permissionType,
            data.effectiveDate,
            data.allowedTime || null,
            data.minutesGranted || 0,
            data.reason
        ]);

        const inserted = result.rows[0];

        await logAction(client, {
            userId: requesterId,
            action: 'ATTENDANCE_PERMISSION_REQUESTED',
            resourceId: inserted.permission_id,
            resourceTable: 'attendance_permissions',
            ipAddress: req.ip,
            details: { targetUserId, permissionType: data.permissionType, effectiveDate: data.effectiveDate, onBehalf: targetUserId !== requesterId },
            required: true
        });

        await triggerEventForRole(client, 'AttendancePermissionFiled', 'HR', {
            entityType: 'AttendancePermission',
            entityId: inserted.permission_id,
            variables: { employee_name: employeeName, permission_type: data.permissionType }
        });

        await triggerEventForRole(client, 'AttendancePermissionFiled', 'Admin', {
            entityType: 'AttendancePermission',
            entityId: inserted.permission_id,
            variables: { employee_name: employeeName, permission_type: data.permissionType }
        });

        await client.query('COMMIT');
        res.status(201).json(inserted);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateAttendancePermissionStatus = (db) => async (req, res, next) => {
    let client;
    try {
        const data = updateAttendancePermissionStatusSchema.parse(req.body);
        const reviewerId = getAuthenticatedUserId(req);

        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query(`
            SELECT p.*, u.full_name as employee_name, u.role as employee_role
            FROM attendance_permissions p
            JOIN users u ON u.user_id = p.user_id
            WHERE p.permission_id = $1
            FOR UPDATE
        `, [req.params.id]);

        if (!existing.rows.length) throw new AppError('Permission request not found', 404);
        const current = existing.rows[0];

        if (current.user_id === reviewerId) {
            throw new AppError('You cannot review your own attendance permission request', 403);
        }
        if (current.status !== 'Pending') {
            throw new AppError('Attendance permission has already been reviewed', 409);
        }
        if (!isGlobalReviewer(req.user)) {
            await assertStaffSupervision(client, req.user, current.user_id, 'attendance', { lock: true });
        }

        const result = await client.query(`
            UPDATE attendance_permissions
            SET status = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP,
                review_notes = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE permission_id = $4
            RETURNING *
        `, [data.status, reviewerId, data.reviewNotes || null, req.params.id]);

        const updated = result.rows[0];

        await logAction(client, {
            userId: reviewerId,
            action: `ATTENDANCE_PERMISSION_${data.status.toUpperCase()}`,
            resourceId: updated.permission_id,
            resourceTable: 'attendance_permissions',
            ipAddress: req.ip,
            details: { previousStatus: current.status, newStatus: data.status, notes: data.reviewNotes },
            required: true
        });

        await recordAttendanceAudit(client, {
            userId: current.user_id,
            actorId: reviewerId,
            actionType: `PERMISSION_${data.status.toUpperCase()}`,
            previousState: current,
            newState: updated,
            reason: data.reviewNotes || `Permission ${data.status.toLowerCase()}`,
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent') || null
        });

        await triggerEvent(client, 'AttendancePermissionResolved', {
            staffId: current.user_id,
            staffRole: current.employee_role,
            entityType: 'AttendancePermission',
            entityId: updated.permission_id,
            variables: {
                employee_name: current.employee_name,
                permission_type: current.permission_type,
                status: data.status,
                effective_date: current.effective_date
            }
        });

        await client.query('COMMIT');
        res.json(updated);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getAttendanceAuditLedger = (db) => async (req, res, next) => {
    try {
        const { userId, startDate, endDate, actionType, isViolation } = req.query;
        const limit = Math.min(1000, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
        const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

        let query = `
            SELECT l.*,
                   u.full_name as employee_name, u.role as employee_role,
                   a.full_name as actor_name, a.role as actor_role
            FROM attendance_audit_ledger l
            JOIN users u ON u.user_id = l.user_id
            JOIN users a ON a.user_id = l.actor_user_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (userId) {
            query += ` AND l.user_id = $${paramCount++}`;
            params.push(userId);
        }
        if (startDate) {
            query += ` AND l.event_timestamp >= $${paramCount++}::date`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND l.event_timestamp < ($${paramCount}::date + interval '1 day')`;
            params.push(endDate);
            paramCount++;
        }
        if (actionType) {
            query += ` AND l.action_type = $${paramCount++}`;
            params.push(actionType);
        }
        if (isViolation !== undefined && isViolation !== '') {
            query += ` AND l.is_violation = $${paramCount++}::boolean`;
            params.push(String(isViolation).toLowerCase() === 'true');
        }

        query += ` ORDER BY l.event_timestamp DESC LIMIT $${paramCount++}::int OFFSET $${paramCount++}::int`;
        params.push(limit, offset);

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

// Leave Requests

const getLeaveRequests = (db) => async (req, res, next) => {
    try {
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const userId = canReviewAll ? req.query.userId : req.user.user_id;
        if (userId && !z.string().uuid().safeParse(userId).success) throw new AppError('Invalid employee id', 400);
        const pageLimit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
        let query = `
            SELECT l.*, u.full_name as employee_name, a.full_name as approved_by_name
            FROM leave_requests l
            JOIN users u ON l.user_id = u.user_id
            LEFT JOIN users a ON l.approved_by = a.user_id
            WHERE 1=1
        `;
        const params = [];

        if (userId) {
            query += ` AND l.user_id = $1`;
            params.push(userId);
        }

        params.push(pageLimit);
        query += ` ORDER BY l.created_at DESC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createLeaveRequest = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createLeaveRequestSchema.parse(req.body);
        const actorId = getAuthenticatedUserId(req);
        const isSupervisor = ['Developer', 'Admin', 'HR'].includes(req.user.role);

        let targetUserId = actorId;
        if (data.userId && data.userId !== actorId) {
            if (!isSupervisor) {
                throw new AppError('Only HR or Admin can submit leave on behalf of other staff', 403);
            }
            targetUserId = data.userId;
        }

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11702))', [targetUserId]);
        const employee = await client.query(
            'SELECT user_id, full_name FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
            [targetUserId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Leave requests are available to active employees only', 403);

        const conflict = await client.query(`
            SELECT request_id
            FROM leave_requests
            WHERE user_id = $1
              AND status IN ('Pending', 'Approved')
              AND start_date <= $3
              AND end_date >= $2
            LIMIT 1
        `, [targetUserId, data.startDate, data.endDate]);
        if (conflict.rows.length) throw new AppError('Leave dates overlap an existing pending or approved request', 409);

        // Paid leave types draw from an annual balance; reject requests that
        // would overdraw it (unpaid leave is exempt by design).
        if (LEAVE_TYPES_WITH_BALANCE.includes(data.leaveType)) {
            for (const segment of workingDaysByYear(data.startDate, data.endDate)) {
                const [balance] = await computeLeaveBalances(client, [targetUserId], segment.year);
                const current = balance?.balances.find((entry) => entry.leaveType === data.leaveType);
                if (current && segment.days > current.remainingDays) {
                    throw new AppError(
                        `Insufficient ${data.leaveType} leave balance for ${segment.year}: ${current.remainingDays} day(s) remaining, ${segment.days} requested. File an Unpaid leave request instead if appropriate.`,
                        409
                    );
                }
            }
        }

        const result = await client.query(`
            INSERT INTO leave_requests (user_id, start_date, end_date, leave_type, reason)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [targetUserId, data.startDate, data.endDate, data.leaveType, data.reason]);
        await logAction(client, {
            userId: actorId, action: 'LEAVE_REQUEST_CREATED', resourceId: result.rows[0].request_id,
            resourceTable: 'leave_requests', ipAddress: req.ip,
            details: { targetUserId, startDate: data.startDate, endDate: data.endDate, leaveType: data.leaveType, onBehalf: targetUserId !== actorId }, required: true
        });
        await client.query('COMMIT');

        // Reviewers only see pending requests if they are told about them.
        const leavePayload = {
            entityType: 'LeaveRequest',
            entityId: result.rows[0].request_id,
            variables: {
                employee_name: employee.rows[0].full_name,
                leave_type: data.leaveType,
                start_date: data.startDate,
                end_date: data.endDate,
            }
        };
        triggerEventForRole(db, 'LEAVE_REQUEST_SUBMITTED', 'HR', leavePayload);
        triggerEventForRole(db, 'LEAVE_REQUEST_SUBMITTED', 'Admin', leavePayload);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23P01') return next(new AppError('Leave dates overlap an existing pending or approved request', 409));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateLeaveStatus = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateLeaveStatusSchema.parse(req.body);
        const adminId = req.user.user_id;

        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query(`
            SELECT l.request_id, l.user_id, l.status, l.leave_type, l.start_date, l.end_date,
                   u.role AS requester_role, u.full_name AS requester_name
            FROM leave_requests l
            JOIN users u ON u.user_id = l.user_id
            WHERE l.request_id = $1
            FOR UPDATE OF l
        `, [id]);

        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Leave request not found', 404));
        }
        if (existing.rows[0].status !== 'Pending') {
            await client.query('ROLLBACK');
            return next(new AppError('Leave request not found or already reviewed', 409));
        }
        if (existing.rows[0].user_id === adminId) {
            await client.query('ROLLBACK');
            return next(new AppError('Leave requests must be reviewed by another authorized user', 403));
        }
        if (!isGlobalReviewer(req.user)) {
            await assertStaffSupervision(client, req.user, existing.rows[0].user_id, 'leave', { lock: true });
        }

        const result = await client.query(`
            UPDATE leave_requests 
            SET status = $1, approved_by = $2, review_notes = $4, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $3 RETURNING *
        `, [data.status, adminId, id, data.notes || null]);

        await logAction(client, {
            userId: adminId, action: 'LEAVE_REQUEST_STATUS_CHANGED', resourceId: id,
            resourceTable: 'leave_requests', ipAddress: req.ip,
            details: { previousStatus: 'Pending', newStatus: data.status, notes: data.notes || null }, required: true
        });
        await client.query('COMMIT');

        // The requester should learn the outcome without polling the list.
        if (existing.rows[0].requester_role) {
            triggerEvent(db, 'LEAVE_REQUEST_DECIDED', {
                staffId: existing.rows[0].user_id,
                staffRole: existing.rows[0].requester_role,
                entityType: 'LeaveRequest',
                entityId: id,
                variables: {
                    status: data.status,
                    leave_type: existing.rows[0].leave_type,
                    start_date: existing.rows[0].start_date,
                    end_date: existing.rows[0].end_date,
                    review_notes: data.notes || '',
                }
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const cancelLeaveRequest = (db) => async (req, res, next) => {
    let client;
    try {
        const data = cancelLeaveSchema.parse(req.body || {});
        const actorId = getAuthenticatedUserId(req);
        const isSupervisor = ['Admin', 'HR', 'Developer'].includes(req.user.role);

        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query(`
            SELECT l.*, u.role AS requester_role
            FROM leave_requests l
            JOIN users u ON u.user_id = l.user_id
            WHERE l.request_id = $1
            FOR UPDATE OF l
        `, [req.params.id]);
        if (!existing.rows.length) throw new AppError('Leave request not found', 404);

        const leave = existing.rows[0];
        if (String(leave.user_id) !== String(actorId) && !isSupervisor) {
            throw new AppError('You can only cancel your own leave request', 403);
        }
        if (!['Pending', 'Approved'].includes(leave.status)) {
            throw new AppError('Only pending or approved leave can be cancelled', 409);
        }
        if (leave.status === 'Approved' && !isSupervisor) {
            throw new AppError('Approved leave must be cancelled by HR or Admin', 403);
        }
        if (leave.status === 'Approved' && (!data.notes || data.notes.length < 3)) {
            throw new AppError('A reason is required to cancel approved leave', 400);
        }

        const result = await client.query(`
            UPDATE leave_requests
            SET status = 'Cancelled', review_notes = $2, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $1
            RETURNING *
        `, [req.params.id, data.notes || null]);
        await logAction(client, {
            userId: actorId,
            action: 'LEAVE_REQUEST_CANCELLED',
            resourceId: req.params.id,
            resourceTable: 'leave_requests',
            ipAddress: req.ip,
            details: { previousStatus: leave.status, notes: data.notes || null },
            required: true
        });
        await client.query('COMMIT');

        if (leave.requester_role) {
            triggerEvent(db, 'LEAVE_REQUEST_DECIDED', {
                staffId: leave.user_id,
                staffRole: leave.requester_role,
                entityType: 'LeaveRequest',
                entityId: req.params.id,
                variables: {
                    status: 'Cancelled',
                    leave_type: leave.leave_type,
                    start_date: leave.start_date,
                    end_date: leave.end_date,
                    review_notes: data.notes || ''
                }
            });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const upsertLeaveBalance = (db) => async (req, res, next) => {
    let client;
    try {
        const { userId } = req.params;
        if (!z.string().uuid().safeParse(userId).success) throw new AppError('Invalid employee id', 400);
        const data = updateLeaveBalanceSchema.parse(req.body);
        const actorId = getAuthenticatedUserId(req);
        const year = data.year || new Date().getFullYear();

        client = await db.connect();
        await client.query('BEGIN');
        const employee = await client.query(
            'SELECT user_id, full_name FROM users WHERE user_id = $1 AND role = ANY($2::user_role[])',
            [userId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 404);

        const result = await client.query(`
            INSERT INTO leave_balances (user_id, year, leave_type, entitlement_days, notes, created_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, year, leave_type)
            DO UPDATE SET
                entitlement_days = EXCLUDED.entitlement_days,
                notes = EXCLUDED.notes,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [userId, year, data.leaveType, data.entitlementDays, data.notes || null, actorId]);

        await logAction(client, {
            userId: actorId,
            action: 'LEAVE_BALANCE_UPDATED',
            resourceId: `${userId}:${year}:${data.leaveType}`,
            resourceTable: 'leave_balances',
            ipAddress: req.ip,
            details: {
                targetUserId: userId,
                year,
                leaveType: data.leaveType,
                entitlementDays: data.entitlementDays,
                notes: data.notes || null
            },
            required: true
        });

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// Staff Credentials (licenses & certifications with expiry tracking)

const getStaffCredentials = (db) => async (req, res, next) => {
    try {
        const canManage = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const { userId, expiringWithinDays, limit } = req.query;
        const targetUserId = canManage ? (req.params.staffId || userId) : getAuthenticatedUserId(req);
        const pageLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 200));
        const params = [];
        let query = `
            SELECT c.*, u.full_name AS employee_name, u.role AS employee_role
            FROM staff_credentials c
            JOIN users u ON u.user_id = c.user_id
            WHERE c.user_id = ANY($1::uuid[])
        `;
        const targetUsers = targetUserId
            ? [targetUserId]
            : (await db.query('SELECT user_id FROM users WHERE is_active = TRUE AND role = ANY($1::user_role[])', [EMPLOYEE_ROLES])).rows.map((row) => row.user_id);
        params.push(targetUsers);
        if (expiringWithinDays) {
            const days = Math.min(365, Math.max(1, Number.parseInt(expiringWithinDays, 10) || 30));
            params.push(days);
            query += ` AND c.expires_at <= (CURRENT_DATE + ($${params.length}::int * interval '1 day'))`;
        }
        params.push(pageLimit);
        query += ` ORDER BY c.expires_at ASC LIMIT $${params.length}::int`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createStaffCredential = (db) => async (req, res, next) => {
    let client;
    try {
        const payload = { ...req.body, userId: req.body?.userId || req.params.staffId };
        const data = createStaffCredentialSchema.parse(payload);
        client = await db.connect();
        await client.query('BEGIN');
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role = ANY($2::user_role[])',
            [data.userId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Eligible employee not found', 404);
        const result = await client.query(`
            INSERT INTO staff_credentials (
                user_id, credential_type, credential_number, issuing_authority,
                issued_date, expires_at, notes, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            data.userId, data.credentialType, data.credentialNumber, data.issuingAuthority,
            data.issuedDate ?? null, data.expiresAt, data.notes ?? null, getAuthenticatedUserId(req)
        ]);
        await logAction(client, {
            userId: getAuthenticatedUserId(req), action: 'STAFF_CREDENTIAL_CREATED', resourceId: result.rows[0].credential_id,
            resourceTable: 'staff_credentials', ipAddress: req.ip,
            details: { userId: data.userId, credentialType: data.credentialType, expiresAt: data.expiresAt }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateStaffCredential = (db) => async (req, res, next) => {
    let client;
    try {
        const data = updateStaffCredentialSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const existing = await client.query('SELECT * FROM staff_credentials WHERE credential_id = $1 FOR UPDATE', [req.params.id]);
        if (!existing.rows.length) throw new AppError('Credential not found', 404);
        const merged = {
            credentialType: data.credentialType ?? existing.rows[0].credential_type,
            credentialNumber: data.credentialNumber !== undefined ? data.credentialNumber : existing.rows[0].credential_number,
            issuingAuthority: data.issuingAuthority !== undefined ? data.issuingAuthority : existing.rows[0].issuing_authority,
            issuedDate: data.issuedDate !== undefined ? data.issuedDate : existing.rows[0].issued_date,
            expiresAt: data.expiresAt ?? existing.rows[0].expires_at,
            notes: data.notes !== undefined ? data.notes : existing.rows[0].notes
        };
        if (merged.issuedDate && merged.expiresAt < merged.issuedDate) {
            throw new AppError('Credential expiry must be on or after its issue date', 400);
        }
        const result = await client.query(`
            UPDATE staff_credentials
            SET credential_type = $2, credential_number = $3, issuing_authority = $4,
                issued_date = $5, expires_at = $6, notes = $7, updated_at = CURRENT_TIMESTAMP,
                last_expiry_notified_at = CASE WHEN $6::date <> $8::date THEN NULL ELSE last_expiry_notified_at END
            WHERE credential_id = $1
            RETURNING *
        `, [req.params.id, merged.credentialType, merged.credentialNumber, merged.issuingAuthority,
        merged.issuedDate, merged.expiresAt, merged.notes, existing.rows[0].expires_at]);
        await logAction(client, {
            userId: getAuthenticatedUserId(req), action: 'STAFF_CREDENTIAL_UPDATED', resourceId: req.params.id,
            resourceTable: 'staff_credentials', ipAddress: req.ip,
            details: { previous: { expiresAt: existing.rows[0].expires_at }, current: { expiresAt: merged.expiresAt } }, required: true
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const deleteStaffCredential = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query('DELETE FROM staff_credentials WHERE credential_id = $1 RETURNING credential_id', [req.params.id]);
        if (!result.rows.length) throw new AppError('Credential not found', 404);
        await logAction(client, {
            userId: getAuthenticatedUserId(req), action: 'STAFF_CREDENTIAL_DELETED', resourceId: req.params.id,
            resourceTable: 'staff_credentials', ipAddress: req.ip,
            details: {}, required: true
        });
        await client.query('COMMIT');
        res.status(204).send();
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

// Productivity

const getProductivityReport = (db) => async (req, res, next) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        // Bounded default window: an open-ended sweep from 1970 scans whole
        // tables for no analytical value.
        const { start, end } = ensureDateRange(
            req.query.startDate || monthAgo,
            req.query.endDate || today
        );

        // Aggregated productivity snapshot based on completed, attributable
        // work. Everyone in scope appears, including zero-activity staff —
        // absence of rows is indistinguishable from absence of work otherwise.
        // Each role row is enriched with attendance-based effort metrics so
        // the report shows output AND efficiency (output per worked hour,
        // attendance vs schedule), not raw counts alone.

        const receptionistQuery = `
            SELECT
                u.user_id,
                u.full_name,
                'Receptionist' as role,
                COUNT(DISTINCT rwi.work_item_id) as metric_count,
                'Reception Tasks Completed' as metric_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (rwi.completed_at - rwi.claimed_at)) / 60)
                    FILTER (WHERE rwi.completed_at IS NOT NULL AND rwi.claimed_at IS NOT NULL), 1) as avg_handling_minutes
            FROM users u
            LEFT JOIN reception_work_items rwi
              ON u.user_id = COALESCE(rwi.completed_by, rwi.claimed_by)
             AND rwi.status = 'Completed'
             AND rwi.completed_at >= $1::date
             AND rwi.completed_at < ($2::date + interval '1 day')
            WHERE u.role = 'Receptionist' AND u.is_active = TRUE
            GROUP BY u.user_id, u.full_name
            ORDER BY metric_count DESC, u.full_name ASC
        `;

        const technicianQuery = `
            SELECT
                u.user_id,
                u.full_name,
                'Technician' as role,
                COUNT(DISTINCT a.appointment_id) as metric_count,
                'Exams Completed' as metric_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60)
                    FILTER (WHERE a.end_time IS NOT NULL AND a.end_time > a.start_time), 1) as avg_exam_minutes
            FROM users u
            LEFT JOIN appointments a
              ON a.technician_id = u.user_id
             AND a.start_time >= $1::date
             AND a.start_time < ($2::date + interval '1 day')
             AND a.status = 'Completed'
            WHERE u.role = 'Technician' AND u.is_active = TRUE
            GROUP BY u.user_id, u.full_name
            ORDER BY metric_count DESC, u.full_name ASC
        `;

        const radiologistQuery = `
            SELECT
                u.user_id,
                u.full_name,
                'Radiologist' as role,
                COUNT(DISTINCT e.exam_id) as metric_count,
                'Reports Finalized' as metric_name,
                ROUND(AVG(EXTRACT(EPOCH FROM (e.approved_at - ap.end_time)) / 60)
                    FILTER (WHERE e.approved_at IS NOT NULL AND ap.end_time IS NOT NULL AND e.approved_at > ap.end_time), 1) as avg_turnaround_minutes
            FROM users u
            LEFT JOIN examinations e
              ON e.performing_radiologist_id = u.user_id
             AND e.approved_at >= $1::date
             AND e.approved_at < ($2::date + interval '1 day')
             AND e.report_status IN ('Finalized', 'Amended')
            LEFT JOIN appointments ap
              ON ap.appointment_id = e.appointment_id
            WHERE u.role = 'Radiologist' AND u.is_active = TRUE
            GROUP BY u.user_id, u.full_name
            ORDER BY metric_count DESC, u.full_name ASC
        `;

        const cashierQuery = `
            SELECT
                u.user_id,
                u.full_name,
                'Cashier' as role,
                COUNT(DISTINCT p.payment_id) as metric_count,
                'Payments Processed' as metric_name,
                COALESCE(SUM(p.amount), 0)::numeric as total_collected
            FROM users u
            LEFT JOIN payments p
              ON p.processed_by = u.user_id
             AND p.transaction_date >= $1::date
             AND p.transaction_date < ($2::date + interval '1 day')
             AND p.payment_status = 'Completed'
            WHERE u.role = 'Cashier' AND u.is_active = TRUE
            GROUP BY u.user_id, u.full_name
            ORDER BY metric_count DESC, u.full_name ASC
        `;

        // Effort metrics for every employee: actual worked hours and late
        // minutes from attendance, scheduled hours from the shift roster.
        // Hours are clipped to the reporting window so partial periods do
        // not inflate the effort side of the efficiency ratios.
        const effortQuery = `
            WITH bounds AS (
                SELECT ($1::date::timestamp) AS period_start,
                       (($2::date + 1)::timestamp) AS period_end
            ),
            att AS (
                SELECT a.user_id,
                       COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
                           LEAST(COALESCE(a.clock_out, b.period_end), b.period_end)
                           - GREATEST(a.clock_in, b.period_start)
                       )) / 3600)), 0)::numeric AS worked_hours,
                       COALESCE(SUM(a.late_minutes), 0)::numeric AS late_minutes
                FROM attendance_logs a
                CROSS JOIN bounds b
                WHERE a.clock_in < b.period_end
                  AND (a.clock_out IS NULL OR a.clock_out > b.period_start)
                  AND a.status <> 'Absent'
                GROUP BY a.user_id
            ),
            sch AS (
                SELECT s.user_id,
                       COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
                           LEAST(s.end_time, b.period_end) - GREATEST(s.start_time, b.period_start)
                       )) / 3600)), 0)::numeric AS scheduled_hours
                FROM staff_shifts s
                CROSS JOIN bounds b
                WHERE s.start_time < b.period_end
                  AND s.end_time > b.period_start
                GROUP BY s.user_id
            )
            SELECT COALESCE(att.user_id, sch.user_id) AS user_id,
                   COALESCE(att.worked_hours, 0) AS worked_hours,
                   COALESCE(att.late_minutes, 0) AS late_minutes,
                   COALESCE(sch.scheduled_hours, 0) AS scheduled_hours
            FROM att
            FULL OUTER JOIN sch ON sch.user_id = att.user_id
        `;

        const [recRes, techRes, radRes, cashRes, effortRes] = await Promise.all([
            db.query(receptionistQuery, [start, end]),
            db.query(technicianQuery, [start, end]),
            db.query(radiologistQuery, [start, end]),
            db.query(cashierQuery, [start, end]),
            db.query(effortQuery, [start, end])
        ]);

        const effortByUser = new Map(effortRes.rows.map((row) => [row.user_id, row]));
        const rows = [...recRes.rows, ...techRes.rows, ...radRes.rows, ...cashRes.rows].map((row) => {
            const effort = effortByUser.get(row.user_id) || {};
            const workedHours = Number(effort.worked_hours || 0);
            const scheduledHours = Number(effort.scheduled_hours || 0);
            const outputCount = Number(row.metric_count || 0);
            return {
                ...row,
                metric_count: outputCount,
                worked_hours: Number(workedHours.toFixed(1)),
                scheduled_hours: Number(scheduledHours.toFixed(1)),
                late_minutes: Math.round(Number(effort.late_minutes || 0)),
                output_per_hour: workedHours > 0 ? Number((outputCount / workedHours).toFixed(2)) : null,
                utilization_percent: scheduledHours > 0 ? Math.round((workedHours / scheduledHours) * 100) : null
            };
        });

        res.json(rows);
    } catch (error) {
        next(error);
    }
};


// Shift Requests (Swap & Modification)
const getShiftRequests = (db) => async (req, res, next) => {
    try {
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const { userId, status, requestType } = req.query;
        const effectiveUserId = canReviewAll ? userId : getAuthenticatedUserId(req);

        let query = `
            SELECT sr.*,
                   u.full_name as employee_name, u.role as employee_role,
                   tu.full_name as target_employee_name, tu.role as target_employee_role,
                   r.full_name as reviewer_name,
                   s.start_time as shift_start, s.end_time as shift_end,
                   ts.start_time as target_shift_start, ts.end_time as target_shift_end
            FROM staff_shift_requests sr
            JOIN users u ON sr.user_id = u.user_id
            LEFT JOIN users tu ON sr.target_user_id = tu.user_id
            LEFT JOIN users r ON sr.reviewed_by = r.user_id
            LEFT JOIN staff_shifts s ON sr.shift_id = s.shift_id
            LEFT JOIN staff_shifts ts ON sr.target_shift_id = ts.shift_id
            WHERE 1=1
        `;
        const params = [];
        let count = 1;

        if (effectiveUserId) {
            query += ` AND (sr.user_id = $${count} OR sr.target_user_id = $${count})`;
            params.push(effectiveUserId);
            count++;
        }
        if (status) {
            query += ` AND sr.status = $${count++}`;
            params.push(status);
        }
        if (requestType) {
            query += ` AND sr.request_type = $${count++}`;
            params.push(requestType);
        }

        query += ` ORDER BY sr.created_at DESC LIMIT 200`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createShiftRequest = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createShiftRequestSchema.parse(req.body);
        const requesterId = getAuthenticatedUserId(req);

        client = await db.connect();
        await client.query('BEGIN');

        const result = await client.query(`
            INSERT INTO staff_shift_requests (
                user_id, shift_id, target_user_id, target_shift_id,
                request_type, requested_start_time, requested_end_time,
                reason, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')
            RETURNING *
        `, [
            requesterId,
            data.shiftId || null,
            data.targetUserId || null,
            data.targetShiftId || null,
            data.requestType,
            data.requestedStartTime ? new Date(data.requestedStartTime).toISOString() : null,
            data.requestedEndTime ? new Date(data.requestedEndTime).toISOString() : null,
            data.reason
        ]);

        const inserted = result.rows[0];

        await logAction(client, {
            userId: requesterId,
            action: 'SHIFT_REQUEST_SUBMITTED',
            resourceId: inserted.request_id,
            resourceTable: 'staff_shift_requests',
            ipAddress: req.ip,
            details: { requestType: data.requestType, shiftId: data.shiftId, targetUserId: data.targetUserId },
            required: true
        });

        await client.query('COMMIT');

        const requestPayload = {
            entityType: 'ShiftRequest',
            entityId: inserted.request_id,
            variables: {
                employee_name: req.user?.full_name || req.user?.fullName || req.user?.name || 'Employee',
                request_type: data.requestType,
                shift_id: data.shiftId || '',
                target_user_id: data.targetUserId || '',
                reason: data.reason,
            }
        };
        triggerEventForRole(db, 'SHIFT_REQUEST_SUBMITTED', 'HR', requestPayload);
        triggerEventForRole(db, 'SHIFT_REQUEST_SUBMITTED', 'Admin', requestPayload);

        res.status(201).json(inserted);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

const updateShiftRequestStatus = (db) => async (req, res, next) => {
    let client;
    try {
        const data = updateShiftRequestStatusSchema.parse(req.body);
        const reviewerId = getAuthenticatedUserId(req);

        client = await db.connect();
        await client.query('BEGIN');

        const reqQuery = await client.query(`
            SELECT sr.*, requester.full_name AS requester_name, requester.role AS requester_role,
                   target_user.full_name AS target_user_name, target_user.role AS target_user_role
            FROM staff_shift_requests sr
            LEFT JOIN users requester ON requester.user_id = sr.user_id
            LEFT JOIN users target_user ON target_user.user_id = sr.target_user_id
            WHERE sr.request_id = $1
            FOR UPDATE OF sr
        `, [req.params.id]);

        if (!reqQuery.rows.length) throw new AppError('Shift request not found', 404);
        const shiftReq = reqQuery.rows[0];

        if (shiftReq.user_id === reviewerId && data.status !== 'Cancelled') {
            throw new AppError('You cannot approve or reject your own shift request', 403);
        }
        if (shiftReq.status !== 'Pending') {
            throw new AppError('Shift request has already been reviewed', 409);
        }
        if (!isGlobalReviewer(req.user)) {
            if (data.status === 'Cancelled') throw new AppError('Supervisors cannot cancel employee shift requests', 403);
            await assertStaffSupervision(client, req.user, shiftReq.user_id, 'shifts', { lock: true });
            if (shiftReq.target_user_id) {
                await assertStaffSupervision(client, req.user, shiftReq.target_user_id, 'shifts', { lock: true });
            }
        }

        // If Approved, apply the change to staff_shifts
        if (data.status === 'Approved') {
            if (shiftReq.request_type === 'Swap') {
                if (shiftReq.shift_id && shiftReq.target_shift_id) {
                    await client.query(`
                        UPDATE staff_shifts SET user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE shift_id = $2
                    `, [shiftReq.target_user_id, shiftReq.shift_id]);
                    await client.query(`
                        UPDATE staff_shifts SET user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE shift_id = $2
                    `, [shiftReq.user_id, shiftReq.target_shift_id]);
                } else if (shiftReq.shift_id && shiftReq.target_user_id) {
                    await client.query(`
                        UPDATE staff_shifts SET user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE shift_id = $2
                    `, [shiftReq.target_user_id, shiftReq.shift_id]);
                }
            } else if (shiftReq.request_type === 'Modification' && shiftReq.shift_id) {
                if (shiftReq.requested_start_time && shiftReq.requested_end_time) {
                    await client.query(`
                        UPDATE staff_shifts
                        SET start_time = $1, end_time = $2, updated_at = CURRENT_TIMESTAMP
                        WHERE shift_id = $3
                    `, [shiftReq.requested_start_time, shiftReq.requested_end_time, shiftReq.shift_id]);
                }
            }
        }

        const updateResult = await client.query(`
            UPDATE staff_shift_requests
            SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, review_notes = $3, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $4
            RETURNING *
        `, [data.status, reviewerId, data.reviewNotes || null, req.params.id]);

        const updated = updateResult.rows[0];

        await logAction(client, {
            userId: reviewerId,
            action: `SHIFT_REQUEST_${data.status.toUpperCase()}`,
            resourceId: updated.request_id,
            resourceTable: 'staff_shift_requests',
            ipAddress: req.ip,
            details: { previousStatus: shiftReq.status, newStatus: data.status, notes: data.reviewNotes },
            required: true
        });

        await client.query('COMMIT');

        const decisionPayload = {
            entityType: 'ShiftRequest',
            entityId: updated.request_id,
            variables: {
                employee_name: shiftReq.requester_name || 'Employee',
                status: data.status,
                request_type: shiftReq.request_type,
                review_notes: data.reviewNotes || '',
            }
        };
        triggerEvent(db, 'SHIFT_REQUEST_DECIDED', {
            staffId: shiftReq.user_id,
            staffRole: shiftReq.requester_role || 'Receptionist',
            ...decisionPayload,
        });
        if (shiftReq.target_user_id && shiftReq.target_user_id !== shiftReq.user_id) {
            triggerEvent(db, 'SHIFT_REQUEST_DECIDED', {
                staffId: shiftReq.target_user_id,
                staffRole: shiftReq.target_user_role || 'Receptionist',
                ...decisionPayload,
            });
        }

        res.json(updated);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// Staff Performance Evaluations
const getStaffEvaluations = (db) => async (req, res, next) => {
    try {
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const { userId } = req.query;
        const effectiveUserId = canReviewAll ? (req.params.staffId || userId) : getAuthenticatedUserId(req);

        let query = `
            SELECT e.*,
                   u.full_name as employee_name, u.role as employee_role,
                   ev.full_name as evaluator_name, ev.role as evaluator_role
            FROM staff_evaluations e
            JOIN users u ON e.user_id = u.user_id
            JOIN users ev ON e.evaluator_id = ev.user_id
            WHERE 1=1
        `;
        const params = [];
        if (effectiveUserId) {
            query += ` AND e.user_id = $1`;
            params.push(effectiveUserId);
        }
        query += ` ORDER BY e.created_at DESC LIMIT 100`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createStaffEvaluation = (db) => async (req, res, next) => {
    try {
        const payload = { ...req.body, userId: req.body?.userId || req.params.staffId };
        const data = createStaffEvaluationSchema.parse(payload);
        const evaluatorId = getAuthenticatedUserId(req);

        const result = await db.query(`
            INSERT INTO staff_evaluations (
                user_id, evaluator_id, evaluation_period, overall_rating,
                punctuality_score, clinical_quality_score, teamwork_score, productivity_score,
                strengths, areas_for_improvement, goals, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            data.userId,
            evaluatorId,
            data.evaluationPeriod || '2026-Q1',
            data.overallRating,
            data.punctualityScore || 5,
            data.clinicalQualityScore || 5,
            data.teamworkScore || 5,
            data.productivityScore || 5,
            data.strengths || null,
            data.areasForImprovement || null,
            data.goals || null,
            data.status || 'Finalized'
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

// ─── Live Attendance Dashboard ────────────────────────────────────────────────

const getLiveAttendanceSummary = (db) => async (req, res, next) => {
    try {
        const { department, branchId, date: targetDate } = req.query;
        const date = targetDate || new Date().toISOString().slice(0, 10);

        let deptFilter = '';
        const params = [date];
        if (department) {
            params.push(department);
            deptFilter = `AND u.department = $${params.length}`;
        }

        // Currently clocked in
        const clockedIn = await db.query(`
            SELECT al.*, u.full_name, u.role, u.department, u.branch_id,
                   s.start_time as shift_start, s.end_time as shift_end,
                   s.room_id
            FROM attendance_logs al
            JOIN users u ON u.user_id = al.user_id
            LEFT JOIN staff_shifts s ON s.shift_id = al.shift_id
            WHERE al.clock_out IS NULL
              AND al.clock_in >= $1::date
              AND al.clock_in < ($1::date + INTERVAL '1 day')
              ${deptFilter}
            ORDER BY al.clock_in ASC
        `, params);

        // Late arrivals today
        const lateToday = await db.query(`
            SELECT al.*, u.full_name, u.role, u.department
            FROM attendance_logs al
            JOIN users u ON u.user_id = al.user_id
            WHERE al.late_minutes > 0
              AND al.clock_in >= $1::date
              AND al.clock_in < ($1::date + INTERVAL '1 day')
              ${deptFilter}
            ORDER BY al.late_minutes DESC
        `, params);

        // Absent today (scheduled but no clock-in)
        const absentToday = await db.query(`
            SELECT s.*, u.full_name, u.role, u.department
            FROM staff_shifts s
            JOIN users u ON u.user_id = s.user_id
            WHERE s.start_time >= $1::date
              AND s.start_time < ($1::date + INTERVAL '1 day')
              ${deptFilter}
              AND NOT EXISTS (
                  SELECT 1 FROM attendance_logs al
                  WHERE al.user_id = u.user_id
                    AND al.clock_in >= $1::date
                    AND al.clock_in < ($1::date + INTERVAL '1 day')
              )
            ORDER BY s.start_time ASC
        `, params);

        // Overtime risks (worked > 10 hours)
        const overtime = await db.query(`
            SELECT al.*, u.full_name, u.role, u.department,
                   EXTRACT(EPOCH FROM (COALESCE(al.clock_out, NOW()) - al.clock_in))/3600 AS hours_worked
            FROM attendance_logs al
            JOIN users u ON u.user_id = al.user_id
            WHERE al.clock_in >= $1::date
              AND al.clock_in < ($1::date + INTERVAL '1 day')
              ${deptFilter}
              AND EXTRACT(EPOCH FROM (COALESCE(al.clock_out, NOW()) - al.clock_in))/3600 > 10
            ORDER BY hours_worked DESC
        `, params);

        // Shift coverage gaps (shifts with no assigned staff)
        const coverageGaps = await db.query(`
            SELECT s.*, r.name as room_name
            FROM staff_shifts s
            LEFT JOIN rooms r ON r.room_id = s.room_id
            WHERE s.start_time >= $1::date
              AND s.start_time < ($1::date + INTERVAL '1 day')
              AND s.user_id IS NULL
              ${deptFilter && `AND s.role = (SELECT role FROM users WHERE department = $2 LIMIT 1)`}
            ORDER BY s.start_time ASC
        `, params);

        res.json({
            date,
            clockedIn: clockedIn.rows,
            lateToday: lateToday.rows,
            absentToday: absentToday.rows,
            overtimeRisks: overtime.rows,
            coverageGaps: coverageGaps.rows,
            summary: {
                totalClockedIn: clockedIn.rows.length,
                totalLate: lateToday.rows.length,
                totalAbsent: absentToday.rows.length,
                totalOvertimeRisk: overtime.rows.length,
                totalCoverageGaps: coverageGaps.rows.length
            }
        });
    } catch (error) {
        next(error);
    }
};

// ─── Payroll Export ──────────────────────────────────────────────────────────

const getAttendancePayrollExport = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, department, userId, format = 'json' } = req.query;

        if (!startDate || !endDate) {
            throw new AppError('startDate and endDate are required', 400);
        }

        let deptFilter = '';
        const params = [startDate, endDate];
        if (department) {
            params.push(department);
            deptFilter = `AND u.department = $${params.length}`;
        }
        if (userId) {
            params.push(userId);
            deptFilter += ` AND u.user_id = $${params.length}`;
        }

        const result = await db.query(`
            SELECT
                al.log_id,
                u.user_id,
                u.employee_id,
                u.full_name,
                u.role,
                u.department,
                al.clock_in,
                al.clock_out,
                al.shift_id,
                s.start_time as shift_start,
                s.end_time as shift_end,
                al.status,
                al.late_minutes,
                al.early_leave_minutes,
                al.total_break_minutes,
                al.notes,
                CASE
                    WHEN al.clock_out IS NULL THEN EXTRACT(EPOCH FROM (NOW() - al.clock_in))/3600
                    ELSE EXTRACT(EPOCH FROM (al.clock_out - al.clock_in))/3600
                END as worked_hours,
                CASE
                    WHEN al.clock_out IS NULL AND EXTRACT(EPOCH FROM (NOW() - al.clock_in))/3600 > 8
                    THEN EXTRACT(EPOCH FROM (NOW() - al.clock_in))/3600 - 8
                    WHEN al.clock_out IS NOT NULL AND EXTRACT(EPOCH FROM (al.clock_out - al.clock_in))/3600 > 8
                    THEN EXTRACT(EPOCH FROM (al.clock_out - al.clock_in))/3600 - 8
                    ELSE 0
                END as overtime_hours
            FROM attendance_logs al
            JOIN users u ON u.user_id = al.user_id
            LEFT JOIN staff_shifts s ON s.shift_id = al.shift_id
            WHERE al.clock_in >= $1::date
              AND al.clock_in <= $2::date + INTERVAL '1 day'
              ${deptFilter}
            ORDER BY u.full_name, al.clock_in
        `, params);

        if (format === 'csv') {
            const headers = [
                'Log ID', 'User ID', 'Employee ID', 'Name', 'Role', 'Department',
                'Clock In', 'Clock Out', 'Shift ID', 'Shift Start', 'Shift End',
                'Status', 'Late Minutes', 'Early Leave Minutes', 'Break Minutes',
                'Notes', 'Worked Hours', 'Overtime Hours'
            ];
            const rows = result.rows.map(r => [
                r.log_id, r.user_id, r.employee_id || '', r.full_name, r.role, r.department || '',
                r.clock_in ? new Date(r.clock_in).toISOString() : '',
                r.clock_out ? new Date(r.clock_out).toISOString() : '',
                r.shift_id || '', r.shift_start || '', r.shift_end || '',
                r.status, r.late_minutes || 0, r.early_leave_minutes || 0,
                r.total_break_minutes || 0, r.notes || '',
                r.worked_hours ? Number(r.worked_hours).toFixed(2) : '',
                r.overtime_hours ? Number(r.overtime_hours).toFixed(2) : ''
            ]);
            const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="attendance-payroll-export-${startDate}-to-${endDate}.csv"`);
            return res.send('\uFEFF' + csv);
        }

        res.json({ rows: result.rows, total: result.rows.length });
    } catch (error) {
        next(error);
    }
};

// ─── Shift Templates CRUD ────────────────────────────────────────────────────

const shiftTemplateBaseSchema = z.object({
    name: z.string().trim().min(1).max(100),
    role: z.enum(['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing']),
    roomId: z.string().uuid().nullable().optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    recurrenceRule: z.object({
        freq: z.enum(['daily', 'weekly', 'monthly']),
        byday: z.array(z.number().int().min(0).max(6)).optional(),
        bymonthday: z.array(z.number().int().min(1).max(31)).optional(),
        until: z.string().datetime().optional()
    }),
    isActive: z.boolean().optional().default(true)
});

const shiftTemplateSchema = shiftTemplateBaseSchema.refine(data => data.endTime > data.startTime, {
    path: ['endTime'],
    message: 'End time must be after start time'
});

const updateShiftTemplateSchema = shiftTemplateBaseSchema.partial().refine(
    data => !data.startTime || !data.endTime || data.endTime > data.startTime,
    { path: ['endTime'], message: 'End time must be after start time' }
);

const getShiftTemplates = (db) => async (req, res, next) => {
    try {
        const { role, isActive } = req.query;
        let query = `
            SELECT st.*, u.full_name as created_by_name
            FROM shift_templates st
            LEFT JOIN users u ON u.user_id = st.created_by
            WHERE 1=1
        `;
        const params = [];
        if (role) {
            params.push(role);
            query += ` AND st.role = $${params.length}`;
        }
        if (isActive !== undefined) {
            params.push(isActive === 'true');
            query += ` AND st.is_active = $${params.length}`;
        }
        query += ` ORDER BY st.created_at DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createShiftTemplate = (db) => async (req, res, next) => {
    try {
        const data = shiftTemplateSchema.parse(req.body);
        const createdBy = getAuthenticatedUserId(req);

        const result = await db.query(`
            INSERT INTO shift_templates (name, role, room_id, start_time, end_time, recurrence_rule, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [data.name, data.role, data.roomId || null, data.startTime, data.endTime, JSON.stringify(data.recurrenceRule), createdBy]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateShiftTemplate = (db) => async (req, res, next) => {
    try {
        const data = updateShiftTemplateSchema.parse(req.body);
        const { id } = req.params;

        const setClause = [];
        const params = [id];
        let paramCount = 1;

        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                paramCount++;
                if (key === 'recurrenceRule') {
                    setClause.push(`${key} = $${paramCount}`);
                    params.push(JSON.stringify(value));
                } else {
                    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
                    setClause.push(`${snakeKey} = $${paramCount}`);
                    params.push(value);
                }
            }
        });

        if (setClause.length === 0) throw new AppError('No fields to update', 400);

        setClause.push(`updated_at = CURRENT_TIMESTAMP`);
        const result = await db.query(`
            UPDATE shift_templates SET ${setClause.join(', ')} WHERE template_id = $1 RETURNING *
        `, params);

        if (!result.rows.length) throw new AppError('Shift template not found', 404);
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const deleteShiftTemplate = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM shift_templates WHERE template_id = $1 RETURNING template_id', [id]);
        if (!result.rows.length) throw new AppError('Shift template not found', 404);
        res.json({ deleted: true, id: result.rows[0].template_id });
    } catch (error) {
        next(error);
    }
};

// ─── Generate Shifts from Templates ──────────────────────────────────────────

const generateShiftsFromTemplates = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, department } = req.body;
        if (!startDate || !endDate) throw new AppError('startDate and endDate are required', 400);

        const templates = await db.query(`
            SELECT * FROM shift_templates WHERE is_active = TRUE
        `);

        let created = 0;
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (const template of templates.rows) {
            const rule = template.recurrence_rule;
            let current = new Date(start);

            while (current <= end) {
                let shouldCreate = false;
                if (rule.freq === 'daily') shouldCreate = true;
                else if (rule.freq === 'weekly' && rule.byday?.includes(current.getDay())) shouldCreate = true;
                else if (rule.freq === 'monthly' && rule.bymonthday?.includes(current.getDate())) shouldCreate = true;

                if (shouldCreate) {
                    const shiftStart = new Date(current);
                    const [sh, sm] = template.start_time.split(':').map(Number);
                    shiftStart.setHours(sh, sm, 0, 0);

                    const shiftEnd = new Date(current);
                    const [eh, em] = template.end_time.split(':').map(Number);
                    shiftEnd.setHours(eh, em, 0, 0);

                    // Check if shift already exists for this user/date
                    const existing = await db.query(`
                        SELECT 1 FROM staff_shifts
                        WHERE role = $1 AND start_time = $2 AND room_id IS NOT DISTINCT FROM $3
                    `, [template.role, shiftStart.toISOString(), template.room_id]);

                    if (!existing.rows.length) {
                        await db.query(`
                            INSERT INTO staff_shifts (role, room_id, start_time, end_time, created_by)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [template.role, template.room_id, shiftStart.toISOString(), shiftEnd.toISOString(), template.created_by]);
                        created++;
                    }
                }
                current.setDate(current.getDate() + 1);
            }
        }

        res.json({ created, message: `Generated ${created} shifts from templates` });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getEmployeeProfiles, updateEmployeeProfile,
    getShiftRequests, createShiftRequest, updateShiftRequestStatus,
    getStaffEvaluations, createStaffEvaluation,
    getShifts, createShift, updateShift, deleteShift,
    getAttendance, clockIn, clockOut, breakStart, breakEnd, updateAttendance, recordManualAttendance,
    ensureActiveAttendanceClockIn,
    getAttendanceSettings, updateAttendanceSettings,
    getAttendancePermissions, createAttendancePermission, updateAttendancePermissionStatus,
    getAttendanceAuditLedger,
    getLiveAttendanceSummary,
    getAttendancePayrollExport,
    getShiftTemplates, createShiftTemplate, updateShiftTemplate, deleteShiftTemplate,
    generateShiftsFromTemplates,
    getLeaveRequests, createLeaveRequest, updateLeaveStatus, cancelLeaveRequest,
    getLeaveBalances, upsertLeaveBalance,
    getStaffCredentials, createStaffCredential, updateStaffCredential, deleteStaffCredential,
    getProductivityReport,
    _hrInternals: { workingDays, workingDaysByYear, getLeaveEntitlement }
};
