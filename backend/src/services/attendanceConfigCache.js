// The application creates its PostgreSQL pool in server.js. Keep this service
// dependency-injected so importing controllers never attempts to load a second,
// non-existent database module during startup.
let pool = null;
let notificationPool = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let attendanceConfigCache = null;
let cacheTimestamp = 0;

const DEFAULT_CONFIG = {
    gracePeriodLateMinutes: 15,
    gracePeriodEarlyMinutes: 10,
    deductFullDelayAfterGrace: true,
    requireEarlyLeaveApproval: true,
    enforceShiftLoginRestriction: false,
    loginBufferBeforeMinutes: 30,
    loginBufferAfterMinutes: 30,
    exemptRolesFromLoginRestriction: 'Admin,Developer,HR,Doctor,Radiologist,Physician'
};

const resolveDb = (clientOrDb) => {
    const db = clientOrDb || pool;
    if (!db || typeof db.query !== 'function') {
        throw new Error('Attendance config database pool has not been configured');
    }
    return db;
};

const loadConfigFromDb = async (clientOrDb) => {
    try {
        const db = resolveDb(clientOrDb);
        const res = await db.query(`
            SELECT setting_key, setting_value FROM system_settings
            WHERE setting_key LIKE 'hr.attendance.%'
        `);
        const map = {};
        for (const row of res.rows) {
            map[row.setting_key] = row.setting_value;
        }
        return {
            gracePeriodLateMinutes: Number.parseInt(map['hr.attendance.grace_period_late_minutes'] ?? '15', 10) || 0,
            gracePeriodEarlyMinutes: Number.parseInt(map['hr.attendance.grace_period_early_minutes'] ?? '10', 10) || 0,
            deductFullDelayAfterGrace: (map['hr.attendance.deduct_full_delay_after_grace'] ?? 'true').toLowerCase() === 'true',
            requireEarlyLeaveApproval: (map['hr.attendance.require_early_leave_approval'] ?? 'true').toLowerCase() === 'true',
            enforceShiftLoginRestriction: (map['hr.attendance.enforce_shift_login_restriction'] ?? 'false').toLowerCase() === 'true',
            loginBufferBeforeMinutes: Number.parseInt(map['hr.attendance.login_buffer_before_minutes'] ?? '30', 10) || 30,
            loginBufferAfterMinutes: Number.parseInt(map['hr.attendance.login_buffer_after_minutes'] ?? '30', 10) || 30,
            exemptRolesFromLoginRestriction: map['hr.attendance.exempt_roles_from_login_restriction'] || 'Admin,Developer,HR,Doctor,Radiologist,Physician'
        };
    } catch (err) {
        console.error('[AttendanceConfigCache] Failed to load config:', err.message);
        return { ...DEFAULT_CONFIG };
    }
};

const getAttendanceConfig = async (clientOrDb) => {
    const now = Date.now();
    if (attendanceConfigCache && (now - cacheTimestamp < CACHE_TTL_MS)) {
        return attendanceConfigCache;
    }
    attendanceConfigCache = await loadConfigFromDb(clientOrDb);
    cacheTimestamp = now;
    return attendanceConfigCache;
};

const invalidateAttendanceConfigCache = () => {
    attendanceConfigCache = null;
    cacheTimestamp = 0;
};

const handleSettingsNotification = (msg) => {
        if (msg.channel === 'system_settings_changed') {
            try {
                const payload = JSON.parse(msg.payload);
                if (payload.setting_key?.startsWith('hr.attendance.')) {
                    invalidateAttendanceConfigCache();
                }
            } catch (e) {
                // ignore parse errors
            }
        }
};

const setAttendanceConfigPool = (dbPool) => {
    pool = resolveDb(dbPool);
    if (notificationPool === pool || typeof pool.on !== 'function') return;
    notificationPool = pool;
    pool.on('notification', handleSettingsNotification);
};

// Also export a function to manually trigger invalidation from settings update
const notifySettingsChanged = async (settingKey) => {
    if (settingKey?.startsWith('hr.attendance.')) {
        invalidateAttendanceConfigCache();
        try {
            const db = resolveDb();
            await db.query(`SELECT pg_notify('system_settings_changed', $1)`, [JSON.stringify({ setting_key: settingKey })]);
        } catch (e) {
            // ignore notification errors
        }
    }
};

module.exports = {
    getAttendanceConfig,
    setAttendanceConfigPool,
    invalidateAttendanceConfigCache,
    notifySettingsChanged,
    DEFAULT_CONFIG
};
