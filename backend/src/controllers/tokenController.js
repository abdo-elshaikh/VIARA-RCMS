const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { AppError } = require('../middleware/errorHandler');
const { logSecurityEvent } = require('../services/securityEventService');

const SALT_ROUNDS = 10;

// Generate a random token
// Format: rcms_[env]_[random32]
const generateTokenString = () => {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `rcms_live_${randomHex}`;
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
        
        // Generate new token
        const rawToken = generateTokenString();
        const prefix = rawToken.substring(0, 15) + '...'; // rcms_live_xx...
        
        // Hash it for storage
        const hashedToken = await bcrypt.hash(rawToken, SALT_ROUNDS);
        
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
            details: { tokenName: normalizedName, tokenId: result.rows[0].id }
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
