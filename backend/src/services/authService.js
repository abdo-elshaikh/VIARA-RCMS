const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const realtimeService = require('./realtimeService');

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

class AuthService {
    static resolveRefreshOwner(ownerTypeOrIsPatient) {
        if (ownerTypeOrIsPatient === true || ownerTypeOrIsPatient === 'patient') return 'patient_id';
        if (ownerTypeOrIsPatient === 'doctor') return 'doctor_id';
        return 'user_id';
    }

    static async generateTokens(db, userPayload, ownerId, ownerTypeOrIsPatient = false, session = {}) {
        const sessionId = crypto.randomUUID();
        const userCol = this.resolveRefreshOwner(ownerTypeOrIsPatient);
        const tableName = userCol === 'patient_id' ? 'patients' : userCol === 'doctor_id' ? 'referring_doctors' : 'users';
        const ownsTransaction = typeof db.connect === 'function';
        const client = ownsTransaction ? await db.connect() : db;

        try {
            // Updating the owner row locks it, serializing simultaneous login/refresh
            // operations for this account until the whole session switch commits.
            if (ownsTransaction) await client.query('BEGIN');
            // Lock the account row first, matching refresh's lock order.
            const owner = await client.query(
                `SELECT ${userCol} FROM ${tableName} WHERE ${userCol} = $1 FOR UPDATE`,
                [ownerId]
            );
            if (!owner.rows.length) throw new Error('Cannot create a session for a missing account');

            await client.query(`
                UPDATE ${userCol === 'user_id' ? 'users' : tableName}
                SET current_session_id = $1 WHERE ${userCol} = $2
            `, [sessionId, ownerId]);

            await client.query(`
                UPDATE refresh_tokens
                SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'new_login'
                WHERE ${userCol} = $1
            `, [ownerId]);

            if (userCol === 'user_id') {
                await client.query(
                    `UPDATE emergency_access_logs SET status = 'Expired' WHERE user_id = $1 AND status = 'Active'`,
                    [ownerId]
                );
            }

            const refreshToken = crypto.randomBytes(40).toString('hex');
            const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
            await client.query(`
                INSERT INTO refresh_tokens (${userCol}, session_id, token_hash, expires_at, ip_address, user_agent, last_used_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [
                ownerId,
                sessionId,
                refreshHash,
                expiresAt,
                session.ipAddress || null,
                session.userAgent ? String(session.userAgent).slice(0, 500) : null
            ]);

            if (ownsTransaction) await client.query('COMMIT');

            // Notify existing connections only after the new session is durable.
            const notice = {
                message: 'Logged in from another device',
                logoutInSeconds: 10
            };
            if (ownerTypeOrIsPatient === false || ownerTypeOrIsPatient === 'staff') {
                realtimeService.sendToUser(ownerId, 'FORCE_LOGOUT', { ...notice, exceptSessionId: sessionId });
            } else if (ownerTypeOrIsPatient === true || ownerTypeOrIsPatient === 'patient') {
                realtimeService.sendToPatient(ownerId, 'FORCE_LOGOUT', { ...notice, exceptSessionId: sessionId });
            } else if (ownerTypeOrIsPatient === 'doctor') {
                realtimeService.sendToDoctor(ownerId, 'FORCE_LOGOUT', { ...notice, exceptSessionId: sessionId });
            }

            const token = jwt.sign(
                { ...userPayload, session_id: sessionId },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRY || '1h' }
            );
            return { token, refreshToken };
        } catch (error) {
            if (ownsTransaction) {
                try { await client.query('ROLLBACK'); } catch (_) { /* keep original error */ }
            }
            throw error;
        } finally {
            if (ownsTransaction) client.release();
        }
    }
}

module.exports = AuthService;
