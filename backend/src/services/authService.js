const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const realtimeService = require('./realtimeService');

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

class AuthService {
    /**
     * Resolves the column name for the token owner based on the owner type.
     */
    static resolveRefreshOwner(ownerTypeOrIsPatient) {
        if (ownerTypeOrIsPatient === true || ownerTypeOrIsPatient === 'patient') {
            return 'patient_id';
        }
        if (ownerTypeOrIsPatient === 'doctor') {
            return 'doctor_id';
        }
        return 'user_id';
    }

    /**
     * Generates a JWT and a Refresh Token, saving the Refresh Token to the database.
     * @param {Object} db - The database pool or client
     * @param {Object} userPayload - The payload to encode in the JWT
     * @param {string|number} ownerId - The ID of the user/patient/doctor
     * @param {boolean|string} ownerTypeOrIsPatient - The type of owner
     * @returns {Promise<{token: string, refreshToken: string}>}
     */
    static async generateTokens(db, userPayload, ownerId, ownerTypeOrIsPatient = false, session = {}) {
        const sessionId = crypto.randomUUID();

        // 1. Force logout the old session via realtime WebSockets
        if (ownerTypeOrIsPatient === false || ownerTypeOrIsPatient === 'staff') {
            realtimeService.sendToUser(ownerId, 'FORCE_LOGOUT', { message: 'Logged in from another device' });
        } else if (ownerTypeOrIsPatient === true || ownerTypeOrIsPatient === 'patient') {
            realtimeService.sendToPatient(ownerId, 'FORCE_LOGOUT', { message: 'Logged in from another device' });
        } else if (ownerTypeOrIsPatient === 'doctor') {
            realtimeService.sendToDoctor(ownerId, 'FORCE_LOGOUT', { message: 'Logged in from another device' });
        }

        // 2. Update current_session_id in the database
        const userCol = this.resolveRefreshOwner(ownerTypeOrIsPatient);
        const tableName = userCol === 'patient_id' ? 'patients' : userCol === 'doctor_id' ? 'referring_doctors' : 'users';
        await db.query(`UPDATE ${tableName} SET current_session_id = $1 WHERE ${userCol} = $2`, [sessionId, ownerId]);

        // 3. Generate JWT with the new session_id
        const enrichedPayload = { ...userPayload, session_id: sessionId };
        const token = jwt.sign(
            enrichedPayload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '1h' } 
        );

        const refreshToken = crypto.randomBytes(40).toString('hex');
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

        await db.query(`
            INSERT INTO refresh_tokens (${userCol}, token_hash, expires_at, ip_address, user_agent, last_used_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
            ownerId,
            refreshHash,
            expiresAt,
            session.ipAddress || null,
            session.userAgent ? String(session.userAgent).slice(0, 500) : null
        ]);

        return { token, refreshToken };
    }
}

module.exports = AuthService;
