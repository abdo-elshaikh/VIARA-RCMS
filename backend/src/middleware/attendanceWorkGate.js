const WORK_ROLES = new Set(['Receptionist', 'Nurse', 'Technician']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SELF_SERVICE_PATHS = new Set([
    '/api/hr/attendance/clock-in',
    '/api/hr/attendance/clock-out',
    '/api/hr/attendance/break-start',
    '/api/hr/attendance/break-end',
    '/api/hr/attendance/permissions',
    '/api/hr/attendance-permissions',
    '/api/hr/shifts/requests',
    '/api/hr/leave',
    '/api/realtime/session',
]);

const requireActiveAttendance = async (db, req, res, next) => {
    if (!WORK_ROLES.has(req.user?.role) || SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) {
        return next();
    }

    const path = String(req.originalUrl || req.path || req.url || '').split('?')[0].replace(/\/$/, '');
    if (path === '/api/profile' || path.startsWith('/api/profile/') ||
        path === '/api/auth' || path.startsWith('/api/auth/') ||
        SELF_SERVICE_PATHS.has(path)) {
        return next();
    }

    if (!db || !req.user.user_id) {
        return res.status(503).json({ error: 'Attendance verification unavailable', code: 'ATTENDANCE_VERIFICATION_UNAVAILABLE' });
    }

    const { rows } = await db.query(`
        SELECT 1 FROM attendance_logs
        WHERE user_id = $1 AND clock_out IS NULL
          AND clock_in <= CURRENT_TIMESTAMP
          AND clock_in >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        LIMIT 1
    `, [req.user.user_id]);

    if (!rows.length) {
        return res.status(403).json({
            error: 'Clock in before performing work',
            message: 'Clock in before performing work',
            code: 'ATTENDANCE_CLOCK_IN_REQUIRED'
        });
    }
    return next();
};

module.exports = { requireActiveAttendance };
