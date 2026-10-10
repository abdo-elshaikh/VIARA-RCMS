const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getActiveEmergencyGrant } = require('../services/emergencyAccessService');
const { requireActiveAttendance } = require('./attendanceWorkGate');
const pacsOidcTokenService = require('../services/pacsOidcTokenService');

const JWT_SECRET = process.env.JWT_SECRET;
let authDatabase;

const getJwtSecret = () => process.env.JWT_SECRET || JWT_SECRET;

const configureAuthDatabase = (db) => {
    authDatabase = db;
};

const enforcePasswordChange = async (req, res, next) => {
    const checkPath = String(req.originalUrl || req.path || req.url || '').split('?')[0];
    const whitelistedPaths = new Set(['/api/profile', '/api/profile/password', '/api/auth/logout', '/api/auth/refresh', '/api/auth/change-password']);
    const whitelistedPrefixes = ['/api/auth/sessions'];

    const isWhitelisted = whitelistedPaths.has(checkPath)
        || whitelistedPrefixes.some(path => checkPath === path || checkPath.startsWith(`${path}/`));

    if (req.user.must_change_password && !isWhitelisted) {
        return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    return requireActiveAttendance(authDatabase, req, res, next);
};

const authenticatePersonalAccessToken = async (req, res, next, token) => {
    if (!authDatabase) return res.status(503).json({ error: 'Authentication service unavailable' });

    // 1. Fast O(1) indexed SHA-256 hash lookup (sub-millisecond)
    const sha256Hash = crypto.createHash('sha256').update(token).digest('hex');
    let result = await authDatabase.query(`
        SELECT at.token_id, at.token_hash, at.access_level,
               u.user_id, u.role, u.email, u.full_name, u.must_change_password
        FROM api_tokens at
        JOIN users u ON u.user_id = at.user_id AND u.is_active = TRUE
        WHERE at.token_hash = $1
    `, [sha256Hash]);

    let matched = result.rows[0] || null;

    // 2. Backwards compatibility fallback for legacy bcrypt tokens
    if (!matched) {
        const prefix = `${token.substring(0, 15)}...`;
        const legacyResult = await authDatabase.query(`
            SELECT at.token_id, at.token_hash, at.access_level,
                   u.user_id, u.role, u.email, u.full_name, u.must_change_password
            FROM api_tokens at
            JOIN users u ON u.user_id = at.user_id AND u.is_active = TRUE
            WHERE at.prefix = $1
        `, [prefix]);

        for (const candidate of legacyResult.rows) {
            if (candidate.token_hash.startsWith('$2') && await bcrypt.compare(token, candidate.token_hash)) {
                matched = candidate;
                // Upgrade to SHA-256 opportunistically
                authDatabase.query('UPDATE api_tokens SET token_hash = $1 WHERE token_id = $2', [sha256Hash, candidate.token_id]).catch(() => {});
                break;
            }
        }
    }

    if (!matched) return res.status(403).json({ error: 'Invalid Token' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && matched.access_level !== 'read_write') {
        return res.status(403).json({ error: 'Token is read-only', code: 'TOKEN_READ_ONLY' });
    }

    await authDatabase.query('UPDATE api_tokens SET last_used_at = NOW() WHERE token_id = $1', [matched.token_id]);
    req.user = {
        user_id: matched.user_id,
        role: matched.role,
        email: matched.email,
        full_name: matched.full_name,
        must_change_password: matched.must_change_password
    };
    req.authType = 'personal_access_token';
    req.authTokenId = matched.token_id;
    return enforcePasswordChange(req, res, next);
};

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const [scheme, token] = authHeader?.split(' ') || [];
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Access Denied: No Token Provided' });
    }

    if (token.startsWith('VIARA_live_')) {
        try {
            return await authenticatePersonalAccessToken(req, res, next, token);
        } catch (error) {
            return next(error);
        }
    }

    try {
        const user = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        // A pacs-viewer cookie token is a narrowly-scoped credential minted only
        // for the OHIF DICOMweb proxy. It must never be replayable as a Bearer
        // credential on any other endpoint.
        if (user.scope === 'pacs-viewer') {
            return res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' });
        }

        // Refresh-token revocation alone cannot invalidate an issued JWT.
        if (!authDatabase) return res.status(503).json({ error: 'Authentication service unavailable' });
        if (!user.session_id) return res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' });
        {
            let tableName, idColumn, idValue;
            if (user.user_id) {
                tableName = 'users';
                idColumn = 'user_id';
                idValue = user.user_id;
            } else if (user.patientId || user.patient_id || (user.role === 'Patient' && user.userId)) {
                tableName = 'patients';
                idColumn = 'patient_id';
                idValue = user.patientId || user.patient_id || user.userId;
            } else if (user.doctorId || user.doctor_id) {
                tableName = 'referring_doctors';
                idColumn = 'doctor_id';
                idValue = user.doctorId || user.doctor_id;
            }

            if (!tableName) return res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' });
            if (tableName) {
                const accountFields = tableName === 'users'
                    ? 'is_active, role, must_change_password'
                    : tableName === 'patients'
                        ? "(patient_status = 'Active') AS is_active, 'Patient' AS role, FALSE AS must_change_password"
                        : "(is_active AND portal_is_active) AS is_active, 'Doctor' AS role, FALSE AS must_change_password";
                const sessionRes = await authDatabase.query(
                    `SELECT current_session_id, ${accountFields} FROM ${tableName} WHERE ${idColumn} = $1`,
                    [idValue]
                );
                const owner = sessionRes.rows[0];
                if (!owner || !owner.is_active || owner.role !== user.role) {
                    return res.status(401).json({ error: 'Account access changed. Please sign in again.', code: 'INVALID_ACCESS_TOKEN' });
                }
                if (owner.current_session_id !== user.session_id) {
                    return res.status(401).json({ error: 'Logged out. Account accessed from another device.', code: 'CONCURRENT_LOGIN' });
                }
                user.must_change_password = owner.must_change_password;
            }
        }

        if (user.emergencyAccessId && authDatabase) {
            const emergencyGrant = await getActiveEmergencyGrant(authDatabase, user);
            if (!emergencyGrant) {
                delete user.emergencyAccessId;
                delete user.elevatedPermissions;
                delete user.breakGlassExpiry;
            } else {
                user.elevatedPermissions = emergencyGrant.permissions;
                user.breakGlassExpiry = new Date(emergencyGrant.expires_at).getTime();
                req.emergencyAccessVerified = {
                    grantId: emergencyGrant.grant_id,
                    permissions: emergencyGrant.permissions
                };
            }
        }

        req.user = user;
        req.authType = 'jwt';
        return enforcePasswordChange(req, res, next);
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
        }
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
            return res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' });
        }
        return next(error);
    }
};

const authorizeRole = (roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Access Denied: User not authenticated' });
    }
    if (req.user.role === 'Developer' || (Array.isArray(roles) && roles.includes(req.user.role))) {
        return next();
    }
    return res.status(403).json({ error: 'Access Denied: Insufficient Permissions' });
};

const authorizeStaffIdentity = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Access Denied: User not authenticated' });
    }
    if (req.user.user_id && req.user.role !== 'Patient' && req.user.role !== 'Doctor') {
        return next();
    }
    return res.status(403).json({ error: 'Access Denied: Staff identity required' });
};

/**
 * Auth guard for the OHIF DICOMweb proxy. The browser-originated iframe requests
 * cannot attach the SPA's Bearer header, so we accept EITHER:
 *   - an Authorization: Bearer <regular-jwt>  → delegate to authenticateToken, or
 *   - an Authorization: Bearer <pacs-viewer-jwt>  → validated here directly (the
 *     fallback viewer passes its session token as a URL param → Bearer header), or
 *   - the httpOnly `pacs_viewer_token` cookie minted by createViewerSession.
 * The pacs-viewer JWT must carry `scope === 'pacs-viewer'`; it is rejected by
 * authenticateToken intentionally so is handled here explicitly.
 */
const acceptViewerSession = async (decoded, req, res, next, authType) => {
    if (!authDatabase) return res.status(503).json({ error: 'Authentication service unavailable' });
    if (!decoded.session_id || !decoded.user_id) {
        return res.status(401).json({ error: 'Viewer session must be renewed', code: 'INVALID_VIEWER_SESSION' });
    }
    const { rows } = await authDatabase.query(
        'SELECT role, current_session_id, is_active, must_change_password FROM users WHERE user_id = $1',
        [decoded.user_id]
    );
    const owner = rows[0];
    if (!owner?.is_active || owner.must_change_password || owner.current_session_id !== decoded.session_id || owner.role !== decoded.role) {
        return res.status(401).json({ error: 'Viewer session revoked', code: 'VIEWER_SESSION_REVOKED' });
    }
    req.user = decoded;
    req.authType = authType;
    return next();
};

const authenticateDicomWeb = async (req, res, next) => {
    if (req.headers.authorization) {
        const [scheme, token, extra] = req.headers.authorization.trim().split(/\s+/);
        if (scheme?.toLowerCase() !== 'bearer' || !token || extra || token.length > 16384) {
            return authenticateToken(req, res, next);
        }
        let viaraJwt = false;
        try {
            const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
            viaraJwt = true;
            if (decoded.scope === 'pacs-viewer') {
                return await acceptViewerSession(decoded, req, res, next, 'pacs_viewer_bearer');
            }
        } catch {
            // Non-VIARA JWTs may be validated by the configured PACS OIDC provider.
        }
        if (viaraJwt || token.startsWith('VIARA_live_')) {
            return authenticateToken(req, res, next);
        }
        if (pacsOidcTokenService.isConfigured()) {
            try {
                const { userId } = await pacsOidcTokenService.verifyPacsOidcToken(token);
                if (!authDatabase) return res.status(503).json({ error: 'Authentication service unavailable' });
                const { rows } = await authDatabase.query(
                    `SELECT user_id, role, email, full_name, must_change_password
                     FROM users
                     WHERE user_id = $1 AND is_active = TRUE`,
                    [userId]
                );
                const owner = rows[0];
                if (!owner || owner.must_change_password) {
                    return res.status(401).json({ error: 'PACS OIDC user is inactive or requires a password change', code: 'PACS_OIDC_USER_UNAVAILABLE' });
                }
                req.user = {
                    user_id: owner.user_id,
                    role: owner.role,
                    email: owner.email,
                    full_name: owner.full_name,
                    must_change_password: owner.must_change_password
                };
                req.authType = 'pacs_oidc';
                return next();
            } catch (error) {
                if (error.code === 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE') {
                    return res.status(503).json({ error: 'PACS identity provider is unavailable', code: error.code });
                }
                if (error.code === 'PACS_OIDC_CONFIGURATION') {
                    return res.status(503).json({ error: 'PACS identity provider is not configured correctly', code: error.code });
                }
                if (error.code === 'PACS_OIDC_INVALID_TOKEN' || error.name === 'JsonWebTokenError'
                    || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
                    return res.status(401).json({ error: 'Invalid PACS identity token', code: 'INVALID_PACS_OIDC_TOKEN' });
                }
                return next(error);
            }
        }
        return authenticateToken(req, res, next);
    }

    const queryToken = req.query?.token || req.query?.access_token;
    if (queryToken) {
        try {
            const decoded = jwt.verify(queryToken, getJwtSecret(), { algorithms: ['HS256'] });
            if (decoded.scope === 'pacs-viewer') {
                return await acceptViewerSession(decoded, req, res, next, 'pacs_viewer_query');
            }
        } catch {
            // Not a pacs-viewer JWT — fall through to authenticateToken
        }
        req.headers = req.headers || {};
        req.headers.authorization = `Bearer ${queryToken}`;
        return authenticateToken(req, res, next);
    }

    const match = /(?:^|;\s*)pacs_viewer_token=([^;]+)/.exec(req.headers.cookie || '');
    if (!match) {
        return res.status(401).json({ error: 'Access Denied: No Token Provided' });
    }

    try {
        const decoded = jwt.verify(decodeURIComponent(match[1]), getJwtSecret(), { algorithms: ['HS256'] });
        if (decoded.scope !== 'pacs-viewer') {
            return res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' });
        }
        return await acceptViewerSession(decoded, req, res, next, 'pacs_viewer_cookie');
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
        }
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
            return res.status(401).json({ error: 'Invalid Token', code: 'INVALID_ACCESS_TOKEN' });
        }
        return next(error);
    }
};

module.exports = {
    authenticateToken,
    authenticateDicomWeb,
    authorizeRole,
    authorizeStaffIdentity,
    configureAuthDatabase,
    JWT_SECRET,
    getJwtSecret
};
