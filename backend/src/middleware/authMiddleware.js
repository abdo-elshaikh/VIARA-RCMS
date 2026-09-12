const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getActiveEmergencyGrant } = require('../services/emergencyAccessService');

const JWT_SECRET = process.env.JWT_SECRET;
let authDatabase;

const getJwtSecret = () => process.env.JWT_SECRET || JWT_SECRET;

const configureAuthDatabase = (db) => {
    authDatabase = db;
};

const enforcePasswordChange = (req, res, next) => {
    const checkPath = String(req.originalUrl || req.path || req.url || '').split('?')[0];
    const whitelistedPaths = new Set(['/api/profile', '/api/profile/password', '/api/auth/logout', '/api/auth/refresh', '/api/auth/change-password']);
    const whitelistedPrefixes = ['/api/auth/sessions'];

    const isWhitelisted = whitelistedPaths.has(checkPath)
        || whitelistedPrefixes.some(path => checkPath === path || checkPath.startsWith(`${path}/`));

    if (req.user.must_change_password && !isWhitelisted) {
        return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    return next();
};

const authenticatePersonalAccessToken = async (req, res, next, token) => {
    if (!authDatabase) return res.status(503).json({ error: 'Authentication service unavailable' });
    const prefix = `${token.substring(0, 15)}...`;
    const result = await authDatabase.query(`
        SELECT at.token_id, at.token_hash, at.access_level,
               u.user_id, u.role, u.email, u.full_name, u.must_change_password
        FROM api_tokens at
        JOIN users u ON u.user_id = at.user_id AND u.is_active = TRUE
        WHERE at.prefix = $1
    `, [prefix]);

    let matched;
    for (const candidate of result.rows) {
        if (await bcrypt.compare(token, candidate.token_hash)) {
            matched = candidate;
            break;
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

        // Single Active Session Verification
        if (user.session_id && authDatabase) {
            let tableName, idColumn, idValue;
            if (user.user_id) {
                tableName = 'users';
                idColumn = 'user_id';
                idValue = user.user_id;
            } else if (user.patientId || user.patient_id) {
                tableName = 'patients';
                idColumn = 'patient_id';
                idValue = user.patientId || user.patient_id;
            } else if (user.doctorId || user.doctor_id) {
                tableName = 'referring_doctors';
                idColumn = 'doctor_id';
                idValue = user.doctorId || user.doctor_id;
            }

            if (tableName) {
                const sessionRes = await authDatabase.query(
                    `SELECT current_session_id FROM ${tableName} WHERE ${idColumn} = $1`,
                    [idValue]
                );
                if (sessionRes.rows.length > 0 && sessionRes.rows[0].current_session_id !== user.session_id) {
                    return res.status(401).json({ error: 'Logged out. Account accessed from another device.', code: 'CONCURRENT_LOGIN' });
                }
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
const authenticateDicomWeb = async (req, res, next) => {
    if (req.headers.authorization) {
        // Peek at the token: if it's a pacs-viewer scoped JWT, handle it here;
        // otherwise fall through to the standard authenticateToken path.
        const [, token] = req.headers.authorization.split(' ');
        if (token) {
            try {
                const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
                if (decoded.scope === 'pacs-viewer') {
                    req.user = decoded;
                    req.authType = 'pacs_viewer_bearer';
                    return next();
                }
            } catch {
                // Not a valid pacs-viewer JWT — fall through to authenticateToken
                // which will handle regular JWTs and PATs.
            }
        }
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
        req.user = decoded;
        req.authType = 'pacs_viewer_cookie';
        return next();
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
