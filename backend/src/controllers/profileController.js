const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');

const SALT_ROUNDS = 12;

const mapProfile = (row) => ({
    id: row.user_id,
    fullName: row.full_name,
    name: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    is2FAEnabled: row.is_2fa_enabled || false,
    phone: row.phone || '',
    department: row.department || '',
    jobTitle: row.job_title || '',
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preferences: row.preferences || {}
});

const getProfile = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const result = await db.query(`
            SELECT user_id, full_name, email, role, is_active, is_2fa_enabled, phone, department, job_title, bio, avatar_url, preferences, created_at, updated_at
            FROM users
            WHERE user_id = $1 AND is_active = TRUE
        `, [userId]);

        if (result.rows.length === 0) {
            return next(new AppError('Profile not found', 404));
        }

        res.json(mapProfile(result.rows[0]));
    } catch (error) {
        next(error);
    }
};

const updateProfile = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const data = req.body;

        const result = await db.query(`
            UPDATE users
            SET full_name = COALESCE($1, full_name),
                email = COALESCE($2, email),
                phone = $3,
                department = $4,
                job_title = $5,
                bio = $6,
                avatar_url = $7,
                preferences = COALESCE($8, preferences),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $9 AND is_active = TRUE
            RETURNING user_id, full_name, email, role, is_active, is_2fa_enabled, phone, department, job_title, bio, avatar_url, preferences, created_at, updated_at
        `, [
            data.fullName,
            data.email,
            data.phone || null,
            data.department || null,
            data.jobTitle || null,
            data.bio || null,
            data.avatarUrl || null,
            data.preferences ? JSON.stringify(data.preferences) : null,
            userId
        ]);

        if (result.rows.length === 0) {
            return next(new AppError('Profile not found', 404));
        }

        res.json(mapProfile(result.rows[0]));
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('Email already exists', 409));
        }
        next(error);
    }
};

const changePassword = (db) => async (req, res, next) => {
    let client;
    try {
        const userId = req.user.user_id;
        const { currentPassword, newPassword } = req.body;

        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT password_hash FROM users WHERE user_id = $1 AND is_active = TRUE FOR UPDATE',
            [userId]
        );

        if (result.rows.length === 0) {
            throw new AppError('Profile not found', 404);
        }

        const matches = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!matches) {
            throw new AppError('Current password is incorrect', 400);
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await client.query(
            'UPDATE users SET password_hash = $1, current_session_id = NULL, must_change_password = FALSE, failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [passwordHash, userId]
        );
        await client.query(`
            UPDATE refresh_tokens
            SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'password_changed'
            WHERE user_id = $1 AND revoked = FALSE
        `, [userId]);
        await logAction(client, {
            userId, action: 'PASSWORD_CHANGED', resourceId: userId,
            resourceTable: 'users', ipAddress: req.ip, details: {}, required: true
        });
        await client.query('COMMIT');

        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth'
        });

        res.json({
            message: 'Password changed successfully',
            logoutRequired: true
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const getPreferences = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const result = await db.query(`
            SELECT u.preferences,
                   COALESCE((
                       SELECT setting_value
                       FROM system_settings
                       WHERE setting_key = 'admin.session_timeout_mins'
                       LIMIT 1
                   ), '30') AS organization_session_timeout
            FROM users u
            WHERE u.user_id = $1
        `, [userId]);
        
        if (result.rows.length === 0) return next(new AppError('User not found', 404));
        const preferences = result.rows[0].preferences || {};
        const organizationSessionTimeout = Number(result.rows[0].organization_session_timeout) || 30;
        res.json({ ...preferences, organizationSessionTimeout });
    } catch (error) {
        next(error);
    }
};

const updatePreferences = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const preferences = req.body;

        const result = await db.query(
            'UPDATE users SET preferences = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING preferences',
            [JSON.stringify(preferences), userId]
        );

        if (result.rows.length === 0) return next(new AppError('User not found', 404));
        res.json(result.rows[0].preferences);
    } catch (error) {
        next(error);
    }
};

const getRefreshTokenHash = (req) => {
    const match = req.headers.cookie?.match(/(?:^|;\s*)refreshToken=([^;]+)/);
    return match ? crypto.createHash('sha256').update(match[1]).digest('hex') : null;
};

const getSessions = (db) => async (req, res, next) => {
    try {
        const currentHash = getRefreshTokenHash(req);
        const result = await db.query(`
            SELECT token_id, created_at, last_used_at, expires_at, ip_address, user_agent,
                   CASE WHEN $2::text IS NOT NULL AND token_hash = $2::text THEN TRUE ELSE FALSE END AS is_current
            FROM refresh_tokens
            WHERE user_id = $1
              AND revoked = FALSE
              AND expires_at > NOW()
            ORDER BY COALESCE(last_used_at, created_at) DESC
        `, [req.user.user_id, currentHash]);

        res.json({ sessions: result.rows.map(row => ({
            id: row.token_id,
            createdAt: row.created_at,
            lastActiveAt: row.last_used_at || row.created_at,
            expiresAt: row.expires_at,
            ipAddress: row.ip_address || null,
            userAgent: row.user_agent || null,
            isCurrent: row.is_current
        })) });
    } catch (error) {
        next(error);
    }
};

const revokeSession = (db) => async (req, res, next) => {
    let client;
    try {
        const currentHash = getRefreshTokenHash(req);
        client = await db.connect();
        await client.query('BEGIN');

        const session = await client.query(`
            SELECT token_id, token_hash
            FROM refresh_tokens
            WHERE token_id::text = $1 AND user_id = $2 AND revoked = FALSE AND expires_at > NOW()
            FOR UPDATE
        `, [req.params.id, req.user.user_id]);
        if (!session.rows.length) throw new AppError('Active session not found', 404);
        if (currentHash && session.rows[0].token_hash === currentHash) {
            throw new AppError('Use sign out to close the current session', 409);
        }

        await client.query(`
            UPDATE refresh_tokens
            SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'user_revoked_session'
            WHERE token_id = $1
        `, [session.rows[0].token_id]);
        await logAction(client, {
            userId: req.user.user_id,
            action: 'SESSION_REVOKED',
            resourceId: session.rows[0].token_id,
            resourceTable: 'refresh_tokens',
            ipAddress: req.ip,
            details: {},
            required: true
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

const exportPersonalData = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const [profileResult, activityResult, tokenResult] = await Promise.all([
            db.query(`
                SELECT user_id, full_name, email, role, is_active, is_2fa_enabled,
                       phone, department, job_title, bio, preferences, created_at, updated_at
                FROM users WHERE user_id = $1
            `, [userId]),
            db.query(`
                SELECT action, resource_table, resource_id, details, ip_address, timestamp
                FROM system_logs WHERE user_id = $1 ORDER BY timestamp DESC
            `, [userId]),
            db.query(`
                SELECT name, prefix, access_level, last_used_at, created_at
                FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC
            `, [userId])
        ]);
        if (!profileResult.rows.length) return next(new AppError('Profile not found', 404));

        await logAction(db, {
            userId,
            action: 'PERSONAL_DATA_EXPORTED',
            resourceId: userId,
            resourceTable: 'users',
            ipAddress: req.ip,
            details: { format: 'json' },
            required: true
        });

        res.json({
            generatedAt: new Date().toISOString(),
            formatVersion: 1,
            profile: profileResult.rows[0],
            securityActivity: activityResult.rows,
            apiTokenMetadata: tokenResult.rows
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    getPreferences,
    updatePreferences,
    getSessions,
    revokeSession,
    exportPersonalData
};
