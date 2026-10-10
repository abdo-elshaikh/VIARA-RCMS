const EMERGENCY_ACCESS_ROLES = Object.freeze(['Radiologist', 'Technician', 'Nurse']);
// Emergency elevation is read-only by design. VIEW_APPOINTMENTS is included so a
// break-glass clinician sees the full schedule (appointmentController visibility
// already expects it) without granting any write or management capability.
const EMERGENCY_ACCESS_PERMISSIONS = Object.freeze([
    'VIEW_PATIENTS',
    'VIEW_APPOINTMENTS',
    'VIEW_EXAMS',
    'VIEW_REPORTS',
    'VIEW_PACS_IMAGES'
]);

const getEmergencyAccessDurationMinutes = () => {
    const configured = Number.parseInt(process.env.BREAK_GLASS_DURATION_MINUTES || '60', 10);
    if (!Number.isFinite(configured)) return 60;
    return Math.min(Math.max(configured, 15), 120);
};

const stripEmergencyClaims = (user = {}) => {
    const {
        iat,
        exp,
        nbf,
        jti,
        elevatedPermissions,
        breakGlassExpiry,
        emergencyAccessId,
        ...baseClaims
    } = user;
    return baseClaims;
};

const expireGrantIfNeeded = async (db, grantId) => {
    if (!grantId) return;
    await db.query(`
        UPDATE emergency_access_logs
        SET status = 'Expired'
        WHERE grant_id = $1
          AND status = 'Active'
          AND expires_at <= NOW()
    `, [grantId]);
};

const getActiveEmergencyGrant = async (db, user = {}) => {
    const grantId = user.emergencyAccessId;
    const userId = user.user_id || user.userId;
    if (!grantId || !userId || !Array.isArray(user.elevatedPermissions)) return null;

    const tokenExpiry = Number(user.breakGlassExpiry);
    if (!Number.isFinite(tokenExpiry) || tokenExpiry <= Date.now()) {
        await expireGrantIfNeeded(db, grantId);
        return null;
    }

    const result = await db.query(`
        SELECT grant_id, user_id, permissions, granted_at, expires_at, status, session_id
        FROM emergency_access_logs
        WHERE grant_id = $1
          AND user_id = $2
        LIMIT 1
    `, [grantId, userId]);
    const grant = result.rows[0];
    if (!grant || grant.status !== 'Active' || new Date(grant.expires_at).getTime() <= Date.now()) {
        await expireGrantIfNeeded(db, grantId);
        return null;
    }
    // Strict session binding: a grant is only usable from the session it was
    // issued for. Legacy NULL-session grants never match a session-bound token.
    if (String(grant.session_id || '') !== String(user.session_id || '')) return null;

    const tokenPermissions = new Set(user.elevatedPermissions);
    const allowedPermissions = new Set(EMERGENCY_ACCESS_PERMISSIONS);
    const permissions = (Array.isArray(grant.permissions) ? grant.permissions : [])
        .filter(permission => tokenPermissions.has(permission) && allowedPermissions.has(permission));
    if (!permissions.length) return null;

    await db.query(`
        UPDATE emergency_access_logs
        SET last_used_at = NOW()
        WHERE grant_id = $1 AND status = 'Active'
    `, [grantId]);

    return { ...grant, permissions };
};

const getGrantedEmergencyPermissions = async (db, user, requiredPermissions = []) => {
    if (!Array.isArray(requiredPermissions) || !requiredPermissions.length) return [];
    const grant = await getActiveEmergencyGrant(db, user);
    if (!grant) return [];
    const granted = new Set(grant.permissions);
    return requiredPermissions.filter(permission => granted.has(permission));
};

const findActiveEmergencyGrant = async (db, { userId, sessionId } = {}) => {
    if (!userId) return null;

    await db.query(`
        UPDATE emergency_access_logs
        SET status = 'Expired'
        WHERE user_id = $1
          AND status = 'Active'
          AND expires_at <= NOW()
    `, [userId]);

    const params = [userId];
    // Strict session binding on lookup as well: a session-bound request only
    // matches its own grant, so legacy NULL-session grants cannot float across
    // sessions — they simply stay orphaned until natural expiry.
    const sessionClause = sessionId
        ? 'AND session_id = $2'
        : 'AND session_id IS NULL';
    if (sessionId) params.push(sessionId);

    const result = await db.query(`
        SELECT grant_id, user_id, permissions, granted_at, expires_at, status, session_id
        FROM emergency_access_logs
        WHERE user_id = $1
          AND status = 'Active'
          AND expires_at > NOW()
          ${sessionClause}
        ORDER BY granted_at DESC
        LIMIT 1
    `, params);
    const grant = result.rows[0];
    if (!grant) return null;
    const allowed = new Set(EMERGENCY_ACCESS_PERMISSIONS);
    const permissions = (Array.isArray(grant.permissions) ? grant.permissions : [])
        .filter(permission => allowed.has(permission));
    return permissions.length ? { ...grant, permissions } : null;
};

const attachActiveEmergencyClaims = async (db, user = {}) => {
    const baseClaims = stripEmergencyClaims(user);
    const grant = await findActiveEmergencyGrant(db, {
        userId: baseClaims.user_id || baseClaims.userId,
        sessionId: baseClaims.session_id
    });
    if (!grant) return baseClaims;

    return {
        ...baseClaims,
        emergencyAccessId: grant.grant_id,
        elevatedPermissions: grant.permissions,
        breakGlassExpiry: new Date(grant.expires_at).getTime()
    };
};

module.exports = {
    EMERGENCY_ACCESS_ROLES,
    EMERGENCY_ACCESS_PERMISSIONS,
    getEmergencyAccessDurationMinutes,
    stripEmergencyClaims,
    expireGrantIfNeeded,
    getActiveEmergencyGrant,
    getGrantedEmergencyPermissions,
    findActiveEmergencyGrant,
    attachActiveEmergencyClaims
};
