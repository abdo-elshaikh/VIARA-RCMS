const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const {
    updateProfileSchema,
    createShiftSchema, updateShiftSchema,
    clockInSchema, clockOutSchema,
    createLeaveRequestSchema, updateLeaveStatusSchema
} = require('../schemas/hrSchema');

// ─── Employee Profiles ────────────────────────────────────────────────────────

const getEmployeeProfiles = (db) => async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'Developer' || req.user.role === 'Admin' || req.user.role === 'HR';
        
        let query = `
            SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                   p.employee_id, p.department, p.job_title, p.hire_date, p.employment_status
        `;
        
        if (isAdmin) {
            query += `, p.salary `;
        }
        
        query += `
            FROM users u
            LEFT JOIN employee_profiles p ON u.user_id = p.user_id
            WHERE u.role != 'Referring_Doctor'
            ORDER BY u.created_at DESC
        `;
        
        const result = await db.query(query);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const updateEmployeeProfile = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateProfileSchema.parse(req.body);
        
        // Upsert logic for employee_profiles
        const existing = await db.query('SELECT * FROM employee_profiles WHERE user_id = $1', [id]);
        
        if (existing.rows.length === 0) {
            // Insert
            const result = await db.query(`
                INSERT INTO employee_profiles (user_id, employee_id, department, job_title, hire_date, employment_status, salary)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
            `, [id, data.employeeId, data.department, data.jobTitle, data.hireDate, data.employmentStatus, data.salary]);
            res.json(result.rows[0]);
        } else {
            // Update
            const keys = Object.keys(data);
            if (keys.length === 0) return res.status(400).json({ message: 'No data provided' });
            
            const setClauses = keys.map((k, i) => {
                const dbKey = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                return `${dbKey} = $${i + 1}`;
            });
            const values = Object.values(data);
            values.push(id);
            
            const result = await db.query(`
                UPDATE employee_profiles 
                SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $${values.length} RETURNING *
            `, values);
            
            res.json(result.rows[0]);
        }
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

// ─── Staff Shifts ─────────────────────────────────────────────────────────────

const getShifts = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, userId } = req.query;
        let query = `
            SELECT s.*, u.full_name as employee_name, u.role
            FROM staff_shifts s
            JOIN users u ON s.user_id = u.user_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND s.start_time >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND s.end_time <= $${paramCount++}`;
            params.push(endDate);
        }
        if (userId) {
            query += ` AND s.user_id = $${paramCount++}`;
            params.push(userId);
        }

        query += ` ORDER BY s.start_time ASC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createShift = (db) => async (req, res, next) => {
    try {
        const data = createShiftSchema.parse(req.body);
        const conflict = await db.query(`
            SELECT shift_id
            FROM staff_shifts
            WHERE user_id = $1
              AND start_time < $3
              AND end_time > $2
            LIMIT 1
        `, [data.userId, data.startTime, data.endTime]);
        if (conflict.rows.length) return next(new AppError('Employee already has an overlapping shift', 409));

        const result = await db.query(`
            INSERT INTO staff_shifts (user_id, start_time, end_time, notes)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [data.userId, data.startTime, data.endTime, data.notes]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const deleteShift = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM staff_shifts WHERE shift_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return next(new AppError('Shift not found', 404));
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// ─── Attendance ───────────────────────────────────────────────────────────────

const getAuthenticatedUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id;

const getAttendance = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, userId } = req.query;
        let query = `
            SELECT a.*, u.full_name as employee_name, u.role
            FROM attendance_logs a
            JOIN users u ON a.user_id = u.user_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (startDate) {
            query += ` AND a.clock_in >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND (a.clock_out <= $${paramCount} OR a.clock_out IS NULL)`;
            params.push(endDate);
            paramCount++;
        }
        if (userId) {
            query += ` AND a.user_id = $${paramCount++}`;
            params.push(userId);
        }

        query += ` ORDER BY a.clock_in DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const clockIn = (db) => async (req, res, next) => {
    try {
        const data = clockInSchema.parse(req.body || {});
        const userId = getAuthenticatedUserId(req);
        if (!userId) return next(new AppError('Authenticated user id is missing', 401));

        // Check if already clocked in
        const existing = await db.query('SELECT * FROM attendance_logs WHERE user_id = $1 AND clock_out IS NULL', [userId]);
        if (existing.rows.length > 0) {
            return res.json({
                ...existing.rows[0],
                already_clocked_in: true,
                message: 'Already clocked in'
            });
        }

        const result = await db.query(`
            INSERT INTO attendance_logs (user_id, clock_in, notes)
            VALUES ($1, CURRENT_TIMESTAMP, $2) RETURNING *
        `, [userId, data.notes]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const clockOut = (db) => async (req, res, next) => {
    try {
        const data = clockOutSchema.parse(req.body || {});
        const userId = getAuthenticatedUserId(req);
        if (!userId) return next(new AppError('Authenticated user id is missing', 401));

        const result = await db.query(`
            UPDATE attendance_logs 
            SET clock_out = CURRENT_TIMESTAMP, notes = COALESCE($1, notes)
            WHERE user_id = $2 AND clock_out IS NULL RETURNING *
        `, [data.notes, userId]);
        
        if (result.rows.length === 0) {
            return res.json({
                clocked_in: false,
                message: 'No active clock-in session found'
            });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

// ─── Leave Requests ───────────────────────────────────────────────────────────

const getLeaveRequests = (db) => async (req, res, next) => {
    try {
        const canReviewAll = ['Developer', 'Admin', 'HR'].includes(req.user.role);
        const userId = canReviewAll ? req.query.userId : req.user.user_id;
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
        
        query += ` ORDER BY l.created_at DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createLeaveRequest = (db) => async (req, res, next) => {
    try {
        const data = createLeaveRequestSchema.parse(req.body);
        const userId = req.user.user_id;

        const conflict = await db.query(`
            SELECT request_id
            FROM leave_requests
            WHERE user_id = $1
              AND status IN ('Pending', 'Approved')
              AND start_date <= $3
              AND end_date >= $2
            LIMIT 1
        `, [userId, data.startDate, data.endDate]);
        if (conflict.rows.length) return next(new AppError('Leave dates overlap an existing pending or approved request', 409));

        const result = await db.query(`
            INSERT INTO leave_requests (user_id, start_date, end_date, leave_type, reason)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [userId, data.startDate, data.endDate, data.leaveType, data.reason]);
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateLeaveStatus = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateLeaveStatusSchema.parse(req.body);
        const adminId = req.user.user_id;

        const result = await db.query(`
            UPDATE leave_requests 
            SET status = $1, approved_by = $2, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $3 AND status = 'Pending' RETURNING *
        `, [data.status, adminId, id]);
        
        if (result.rows.length === 0) return next(new AppError('Leave request not found or already reviewed', 409));
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

// ─── Productivity ─────────────────────────────────────────────────────────────

const getProductivityReport = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate || '1970-01-01';
        const end = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

        // Very basic aggregated productivity snapshot
        // We count how many invoices Receptionists created
        // How many exams Technicians completed
        
        const receptionistQuery = `
            SELECT u.user_id, u.full_name, 'Receptionist' as role, COUNT(i.invoice_id) as metric_count, 'Invoices Generated' as metric_name
            FROM users u
            JOIN invoices i ON u.user_id = i.generated_by
            WHERE u.role IN ('Receptionist', 'Admin')
            AND i.generated_at >= $1::date AND i.generated_at <= $2::date
            GROUP BY u.user_id, u.full_name
        `;
        
        const technicianQuery = `
            SELECT u.user_id, u.full_name, 'Technician' as role, COUNT(e.exam_id) as metric_count, 'Exams Completed' as metric_name
            FROM users u
            JOIN examinations e ON u.user_id = e.technician_id
            WHERE u.role IN ('Technician', 'Admin')
            AND e.completed_at >= $1::date AND e.completed_at <= $2::date
            GROUP BY u.user_id, u.full_name
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
    getAttendance, clockIn, clockOut,
    getLeaveRequests, createLeaveRequest, updateLeaveStatus,
    getProductivityReport
};
