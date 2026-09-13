const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { AppError } = require('../middleware/errorHandler');
const { logSecurityEvent } = require('../services/securityEventService');
const { triggerEventForRole } = require('../services/notificationJobService');

const SALT_ROUNDS = 10;
const WRITE_TOKEN_PERMISSION = 'MANAGE_DATABASE_CONFIG';

// Generate a random token
// Format: VIARA_[env]_[random32]
const generateTokenString = () => {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `VIARA_live_${randomHex}`;
};

const roleHasPermission = async (db, role, permission) => {
    if (!role || !permission) return false;
    if (role === 'Developer') return true;

    const result = await db.query(`
        SELECT 1
        FROM role_permissions rp
        JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE rp.role_name = $1 AND p.name = $2
        LIMIT 1
    `, [role, permission]);

    return result.rows.length > 0;
};

const getTokens = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const result = await db.query(`
            SELECT token_id as id, name, prefix, access_level as "accessLevel", last_used_at as "lastUsed", created_at as created
            FROM api_tokens
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createToken = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const { name, accessLevel = 'read' } = req.body;

        const normalizedName = typeof name === 'string' ? name.trim() : '';
        if (!normalizedName) return next(new AppError('Token name is required', 400));
        if (normalizedName.length > 100) return next(new AppError('Token name must be 100 characters or fewer', 400));
        if (!['read', 'read_write'].includes(accessLevel)) return next(new AppError('Invalid token access level', 400));

        if (accessLevel === 'read_write') {
            const canCreateWriteToken = await roleHasPermission(db, req.user?.role, WRITE_TOKEN_PERMISSION);
            if (!canCreateWriteToken) {
                await logSecurityEvent(db, {
                    eventType: 'API_TOKEN_WRITE_SCOPE_DENIED',
                    severity: 'warning',
                    userId,
                    ipAddress: req.ip,
                    userAgent: req.get('user-agent'),
                    details: { tokenName: normalizedName, requestedAccessLevel: accessLevel }
                });
                triggerEventForRole(db, 'API_TOKEN_WRITE_SCOPE_DENIED', 'Admin', { priority: 'Warning' }).catch(() => {});
                return next(new AppError('Write API tokens require developer authorization', 403));
            }
        }

        // Generate new token
        const rawToken = generateTokenString();
        const prefix = rawToken.substring(0, 15) + '...'; // VIARA_live_xx...

        // Hash it for storage using SHA-256 for fast indexed O(1) verification
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        const result = await db.query(`
            INSERT INTO api_tokens (user_id, name, token_hash, prefix, access_level)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING token_id as id, name, prefix, access_level as "accessLevel", created_at as created
        `, [userId, normalizedName, hashedToken, prefix, accessLevel]);

        await logSecurityEvent(db, {
            eventType: 'API_TOKEN_CREATED',
            severity: 'info',
            userId: userId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            details: { tokenName: normalizedName, tokenId: result.rows[0].id, accessLevel }
        });

        // We only return the raw token ONCE upon creation
        res.status(201).json({
            token: result.rows[0],
            rawToken: rawToken
        });
    } catch (error) {
        next(error);
    }
};

const revokeToken = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const { id } = req.params;

        const result = await db.query(`
            DELETE FROM api_tokens
            WHERE token_id::text = $1 AND user_id = $2
            RETURNING token_id, name
        `, [id, userId]);

        if (result.rows.length === 0) {
            return next(new AppError('Token not found or unauthorized', 404));
        }

        await logSecurityEvent(db, {
            eventType: 'API_TOKEN_REVOKED',
            severity: 'info',
            userId: userId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            details: { tokenName: result.rows[0].name, tokenId: result.rows[0].token_id }
        });

        res.json({ message: 'Token successfully revoked' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTokens,
    createToken,
    revokeToken
};
