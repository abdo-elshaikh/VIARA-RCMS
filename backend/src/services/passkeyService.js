const crypto = require('crypto');
const {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} = require('@simplewebauthn/server');
const { getWebAuthnConfig } = require('../config/webauthn');
const { AppError } = require('../middleware/errorHandler');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ceremonyHash = value => crypto.createHash('sha256').update(value).digest('hex');
const unavailableCredentialId = () => crypto.randomBytes(32).toString('base64url');

const createChallenge = async (db, purpose, userId, challenge) => {
    const ceremonyId = crypto.randomUUID();
    await db.query(`
        INSERT INTO webauthn_challenges (challenge_id_hash, challenge, purpose, user_id, expires_at)
        VALUES ($1, $2, $3, $4, $5)
    `, [ceremonyHash(ceremonyId), challenge, purpose, userId || null, new Date(Date.now() + CHALLENGE_TTL_MS)]);
    return ceremonyId;
};

const consumeChallenge = async (db, ceremonyId, purpose, userId = null) => {
    const result = await db.query(`
        UPDATE webauthn_challenges
        SET consumed_at = NOW()
        WHERE challenge_id_hash = $1 AND purpose = $2 AND consumed_at IS NULL
          AND expires_at > NOW() AND ($3::uuid IS NULL OR user_id = $3::uuid)
        RETURNING challenge, user_id
    `, [ceremonyHash(ceremonyId), purpose, userId]);
    if (!result.rows.length) throw new AppError('Passkey request expired or already used', 400, true, 'PASSKEY_CEREMONY_INVALID');
    return result.rows[0];
};

const activeCredentials = async (db, userId) => {
    const result = await db.query(`
        SELECT passkey_id, credential_id, public_key, counter, transports, device_type, backed_up,
               label, created_at, updated_at, last_used_at
        FROM user_passkeys WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC
    `, [userId]);
    return result.rows;
};

const registrationOptions = async (db, user) => {
    const config = getWebAuthnConfig();
    const credentials = await activeCredentials(db, user.user_id);
    const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpID,
        userName: user.email,
        userDisplayName: user.full_name,
        userID: Buffer.from(String(user.user_id)),
        attestationType: 'none',
        excludeCredentials: credentials.map(item => ({ id: item.credential_id, transports: item.transports })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'required'
        }
    });
    return { options, ceremonyId: await createChallenge(db, 'registration', user.user_id, options.challenge) };
};

const authenticationOptions = async (db, user) => {
    const config = getWebAuthnConfig();
    const credentials = user ? await activeCredentials(db, user.user_id) : [];
    // An empty allowCredentials list enables discoverable credentials and can offer a
    // passkey belonging to another email. Use an unmatchable ID for unknown/unconfigured
    // accounts while preserving the same public response shape.
    const allowCredentials = credentials.length
        ? credentials.map(item => ({ id: item.credential_id, transports: item.transports }))
        : [{ id: unavailableCredentialId(), transports: ['internal'] }];
    const options = await generateAuthenticationOptions({
        rpID: config.rpID,
        userVerification: 'required',
        allowCredentials
    });
    return { options, ceremonyId: await createChallenge(db, 'authentication', user?.user_id, options.challenge) };
};

const verifyRegistration = async (db, userId, ceremonyId, response) => {
    const challenge = await consumeChallenge(db, ceremonyId, 'registration', userId);
    const config = getWebAuthnConfig();
    return verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: true
    });
};

const verifyAuthentication = async (db, ceremonyId, response) => {
    const challenge = await consumeChallenge(db, ceremonyId, 'authentication');
    if (!challenge.user_id) throw new AppError('Passkey authentication failed', 401, true, 'PASSKEY_AUTH_FAILED');
    const result = await db.query(`
        SELECT p.*, u.email, u.full_name, u.role, u.is_active, u.locked_until, u.must_change_password
        FROM user_passkeys p JOIN users u ON u.user_id = p.user_id
        WHERE p.credential_id = $1 AND p.user_id = $2 AND p.revoked_at IS NULL
    `, [response.id, challenge.user_id]);
    if (!result.rows.length) {
        const owner = await db.query(`
            SELECT 1 FROM user_passkeys
            WHERE credential_id = $1 AND user_id <> $2 AND revoked_at IS NULL
        `, [response.id, challenge.user_id]);
        if (owner.rows.length) {
            throw new AppError(
                'This passkey belongs to a different staff account',
                401,
                true,
                'PASSKEY_ACCOUNT_MISMATCH'
            );
        }
        throw new AppError('Passkey authentication failed', 401, true, 'PASSKEY_AUTH_FAILED');
    }
    const row = result.rows[0];
    if (!row.is_active || (row.locked_until && new Date(row.locked_until) > new Date())) {
        throw new AppError('Passkey authentication failed', 401, true, 'PASSKEY_AUTH_FAILED');
    }
    const config = getWebAuthnConfig();
    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: true,
        credential: {
            id: row.credential_id,
            publicKey: row.public_key,
            counter: Number(row.counter),
            transports: row.transports
        }
    });
    return { verification, user: row };
};

module.exports = {
    activeCredentials,
    authenticationOptions,
    registrationOptions,
    verifyAuthentication,
    verifyRegistration
};
