const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const {
    updateProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema, updateAttendanceSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema
} = require('../schemas/hrSchema');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMPLOYEE_ROLES = Object.freeze([
    'Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse',
    'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'
]);

const toNullable = (value) => value === undefined ? null : value;

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
        let query = `
            SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                   p.employee_id, p.department, p.job_title, p.hire_date,
                   p.termination_date, p.employment_status
        `;
        
        query += `
            FROM users u
            LEFT JOIN employee_profiles p ON u.user_id = p.user_id
            WHERE u.role = ANY($1::user_role[])
            ORDER BY u.created_at DESC
        `;
        
        const result = await db.query(query, [EMPLOYEE_ROLES]);
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
            if (!result.rows.length) throw new AppError('Eligible employee not found', 404);
            await logAction(client, {
                userId: req.user.user_id, action: 'EMPLOYEE_PROFILE_CREATED', resourceId: id,
                resourceTable: 'employee_profiles', ipAddress: req.ip,
                details: { changedFields: keys }, required: true
            });
        } else {
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
        if (startDate && endDate && new Date(startDate) >= new Date(endDate)) throw new AppError('Shift query end date must be after start date', 400);
        if (userId && !z.string().uuid().safeParse(userId).success) throw new AppError('Invalid employee id', 400);
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const effectiveUserId = canReviewAll ? userId : getAuthenticatedUserId(req);
        const pageLimit = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 500));
        let query = `
            SELECT s.*, u.full_name as employee_name, u.role
            FROM staff_shifts s
            JOIN users u ON s.user_id = u.user_id
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
        }

        query += ` ORDER BY s.start_time ASC LIMIT $${paramCount}::int`;
        params.push(pageLimit);
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createShift = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createShiftSchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11701))', [data.userId]);
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
            [data.userId, EMPLOYEE_ROLES]
        );
        if (!employee.rows.length) throw new AppError('Active eligible employee not found', 400);

        const conflict = await client.query(`
            SELECT shift_id FROM staff_shifts
            WHERE user_id = $1 AND start_time < $3 AND end_time > $2
            LIMIT 1
        `, [data.userId, data.startTime, data.endTime]);
        if (conflict.rows.length) throw new AppError('Employee already has an overlapping shift', 409);

        const result = await client.query(`
            INSERT INTO staff_shifts (user_id, start_time, end_time, notes)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [data.userId, data.startTime, data.endTime, data.notes]);
        await logAction(client, {
            userId: req.user.user_id, action: 'SHIFT_CREATED', resourceId: result.rows[0].shift_id,
            resourceTable: 'staff_shifts', ipAddress: req.ip,
            details: { userId: data.userId, startTime: data.startTime, endTime: data.endTime }, required: true
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
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

// Attendance

const getAuthenticatedUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id;

const getAttendance = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, activeOnly } = req.query;
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const userId = canReviewAll ? req.query.userId : getAuthenticatedUserId(req);
        const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
        if (startDate || endDate) ensureDateRange(startDate, endDate);
        let query = `
            SELECT a.*, u.full_name as employee_name, u.role
            FROM attendance_logs a
            JOIN users u ON a.user_id = u.user_id
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
            INSERT INTO attendance_logs (user_id, clock_in, shift_id, late_minutes, status, notes)
            VALUES (
                $1,
                CURRENT_TIMESTAMP,
                $2,
                CASE WHEN $3::timestamptz IS NULL THEN 0 ELSE GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $3::timestamptz)) / 60) END,
                CASE WHEN $3::timestamptz IS NOT NULL AND CURRENT_TIMESTAMP > $3::timestamptz THEN 'Late' ELSE 'Present' END,
                $4
            ) RETURNING *
        `, [userId, shift?.shift_id || null, shift?.start_time || null, data.notes]);
        await logAction(client, {
            userId, action: 'ATTENDANCE_CLOCK_IN', resourceId: result.rows[0].log_id,
            resourceTable: 'attendance_logs', ipAddress: req.ip,
            details: { notes: data.notes || null }, required: true
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

const clockOut = (db) => async (req, res, next) => {
    let client;
    try {
        const data = clockOutSchema.parse(req.body || {});
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
            return res.json({
                clocked_in: false,
                message: 'No active clock-in session found'
            });
        }
        const stale = new Date(active.rows[0].clock_in) < new Date(Date.now() - 24 * 60 * 60 * 1000);
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
                    ELSE CURRENT_TIMESTAMP
                END,
                early_leave_minutes = CASE
                    WHEN a.shift_id IS NULL THEN 0
                    ELSE GREATEST(0, EXTRACT(EPOCH FROM (
                        (SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id)
                        - CASE WHEN $3::boolean
                            THEN LEAST(CURRENT_TIMESTAMP, (SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id))
                            ELSE CURRENT_TIMESTAMP
                          END
                    )) / 60)
                END,
                notes = CASE WHEN $3::boolean
                    THEN CONCAT_WS(E'\n', NULLIF(COALESCE($1, a.notes), ''), '[system] Stale attendance session automatically capped')
                    ELSE COALESCE($1, a.notes)
                END,
                corrected_by = CASE WHEN $3::boolean THEN $4 ELSE a.corrected_by END,
                corrected_at = CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE a.corrected_at END
            WHERE a.log_id = $2
            RETURNING a.*
        `, [data.notes, active.rows[0].log_id, stale, userId]);
        await logAction(client, {
            userId, action: 'ATTENDANCE_CLOCK_OUT', resourceId: result.rows[0].log_id,
            resourceTable: 'attendance_logs', ipAddress: req.ip,
            details: { notes: data.notes || null, staleSessionCapped: stale }, required: true
        });
        await client.query('COMMIT');
        res.json({ ...result.rows[0], stale_session_capped: stale });
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

        const updated = await client.query(`
            UPDATE attendance_logs a
            SET clock_in = $2::timestamptz,
                clock_out = $3::timestamptz,
                status = CASE
                    WHEN $4 IN ('Absent', 'Half-Day') THEN $4
                    WHEN a.shift_id IS NOT NULL
                     AND $2::timestamptz > (SELECT s.start_time FROM staff_shifts s WHERE s.shift_id = a.shift_id)
                        THEN 'Late'
                    ELSE 'Present'
                END,
                notes = $5,
                late_minutes = CASE
                    WHEN $4 = 'Absent' THEN 0
                    WHEN a.shift_id IS NULL THEN CASE WHEN $4 = 'Late' THEN a.late_minutes ELSE 0 END
                    ELSE GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - (SELECT s.start_time FROM staff_shifts s WHERE s.shift_id = a.shift_id))) / 60)
                END,
                early_leave_minutes = CASE
                    WHEN a.shift_id IS NULL OR $3::timestamptz IS NULL THEN 0
                    ELSE GREATEST(0, EXTRACT(EPOCH FROM ((SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id) - $3::timestamptz)) / 60)
                END,
                corrected_by = $6,
                corrected_at = CURRENT_TIMESTAMP
            WHERE a.log_id = $1
            RETURNING a.*
        `, [req.params.id, data.clockIn, data.clockOut, data.status, data.notes || null, reviewerId]);

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
        await client.query('COMMIT');
        res.json(updated.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        if (error?.code === '23P01') return next(new AppError('Attendance correction overlaps another attendance record', 409));
        if (error?.code === '23505') return next(new AppError('Employee already has another open attendance session', 409));
        next(error);
    } finally {
        if (client) client.release();
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
        const userId = req.user.user_id;
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11702))', [userId]);
        const employee = await client.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND is_active = TRUE AND role = ANY($2::user_role[])',
            [userId, EMPLOYEE_ROLES]
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
        `, [userId, data.startDate, data.endDate]);
        if (conflict.rows.length) throw new AppError('Leave dates overlap an existing pending or approved request', 409);

        const result = await client.query(`
            INSERT INTO leave_requests (user_id, start_date, end_date, leave_type, reason)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [userId, data.startDate, data.endDate, data.leaveType, data.reason]);
        await logAction(client, {
            userId: userId, action: 'LEAVE_REQUEST_CREATED', resourceId: result.rows[0].request_id,
            resourceTable: 'leave_requests', ipAddress: req.ip,
            details: { startDate: data.startDate, endDate: data.endDate, leaveType: data.leaveType }, required: true
        });
        await client.query('COMMIT');
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
            SELECT request_id, user_id, status
            FROM leave_requests
            WHERE request_id = $1
            FOR UPDATE
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
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// Productivity

const getProductivityReport = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const { start, end } = ensureDateRange(startDate, endDate);

        // Very basic aggregated productivity snapshot
        // We count how many invoices Receptionists created
        // How many exams Technicians completed
        
        const receptionistQuery = `
            SELECT u.user_id, u.full_name, 'Receptionist' as role, COUNT(i.invoice_id) as metric_count, 'Invoices Generated' as metric_name
            FROM users u
            JOIN invoices i ON u.user_id = i.generated_by
            WHERE u.role = 'Receptionist'
            AND i.invoice_status <> 'Voided'
            AND i.generated_at >= $1::date AND i.generated_at < ($2::date + interval '1 day')
            GROUP BY u.user_id, u.full_name
            ORDER BY metric_count DESC, u.full_name ASC
        `;

        const technicianQuery = `
            SELECT u.user_id, u.full_name, 'Technician' as role, COUNT(e.exam_id) as metric_count, 'Exams Completed' as metric_name
            FROM users u
            JOIN examinations e ON u.user_id = e.technician_id
            WHERE u.role = 'Technician'
            AND e.completed_at >= $1::date AND e.completed_at < ($2::date + interval '1 day')
            GROUP BY u.user_id, u.full_name
            ORDER BY metric_count DESC, u.full_name ASC
        `;

        const [recRes, techRes] = await Promise.all([
            db.query(receptionistQuery, [start, end]),
            db.query(technicianQuery, [start, end])
        ]);

        res.json([...recRes.rows, ...techRes.rows]);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getEmployeeProfiles, updateEmployeeProfile,
    getShifts, createShift, deleteShift,
    getAttendance, clockIn, clockOut, updateAttendance,
    getLeaveRequests, createLeaveRequest, updateLeaveStatus,
    getProductivityReport
};
