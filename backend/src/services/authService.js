const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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
        const token = jwt.sign(
            userPayload,
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '1h' } 
        );

        const refreshToken = crypto.randomBytes(40).toString('hex');
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

        const userCol = this.resolveRefreshOwner(ownerTypeOrIsPatient);
        
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
