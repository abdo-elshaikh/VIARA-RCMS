const bcrypt = require('bcrypt');
const { AppError } = require('../middleware/errorHandler');
const AuthService = require('../services/authService');
const PasskeyService = require('../services/passkeyService');
const { logAction } = require('../services/auditService');

const setRefreshCookie = (res, refreshToken) => res.cookie('refreshToken', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/auth', maxAge: 7 * 24 * 60 * 60 * 1000
});

const permissionsFor = async (db, role) => {
    const result = role === 'Developer'
        ? await db.query('SELECT name FROM permissions ORDER BY name')
        : await db.query(`SELECT p.name FROM role_permissions rp JOIN permissions p ON p.permission_id = rp.permission_id WHERE rp.role_name = $1 ORDER BY p.name`, [role]);
    return result.rows.map(row => row.name);
};

const listPasskeys = db => async (req, res, next) => {
    try {
        const rows = await PasskeyService.activeCredentials(db, req.user.user_id);
        res.json({ passkeys: rows.map(row => ({ id: row.passkey_id, label: row.label, deviceType: row.device_type, backedUp: row.backed_up, transports: row.transports, createdAt: row.created_at, lastUsedAt: row.last_used_at })) });
    } catch (error) { next(error); }
};

const registrationOptions = db => async (req, res, next) => {
    try {
        const result = await db.query('SELECT user_id, email, full_name, password_hash FROM users WHERE user_id = $1 AND is_active = TRUE', [req.user.user_id]);
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(req.body.currentPassword, user.password_hash))) return next(new AppError('Current password is incorrect', 400, true, 'CURRENT_PASSWORD_INVALID'));
        res.json(await PasskeyService.registrationOptions(db, user));
    } catch (error) { next(error); }
};

const registrationVerify = db => async (req, res, next) => {
    try {
        const result = await PasskeyService.verifyRegistration(db, req.user.user_id, req.body.ceremonyId, req.body.response);
        if (!result.verified || !result.registrationInfo) return next(new AppError('Passkey registration could not be verified', 400, true, 'PASSKEY_REGISTRATION_FAILED'));
        const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
        const inserted = await db.query(`INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING passkey_id`, [req.user.user_id, credential.id, Buffer.from(credential.publicKey), credential.counter, credential.transports || [], credentialDeviceType || null, Boolean(credentialBackedUp), req.body.label]);
        await logAction(db, { userId: req.user.user_id, action: 'PASSKEY_ENROLLED', resourceId: inserted.rows[0].passkey_id, resourceTable: 'user_passkeys', ipAddress: req.ip, details: { deviceType: credentialDeviceType || null } });
        res.status(201).json({ id: inserted.rows[0].passkey_id, message: 'Passkey registered' });
    } catch (error) {
        if (error.code === '23505') return next(new AppError('This passkey is already registered', 409, true, 'PASSKEY_DUPLICATE'));
        next(error);
    }
};

const authenticationOptions = db => async (req, res, next) => {
    try {
        const result = await db.query('SELECT user_id, email, full_name FROM users WHERE email = $1 AND is_active = TRUE AND (locked_until IS NULL OR locked_until <= NOW())', [req.body.email]);
        res.json(await PasskeyService.authenticationOptions(db, result.rows[0] || null));
    } catch (error) { next(error); }
};

const authenticationVerify = db => async (req, res, next) => {
    try {
        const { verification, user } = await PasskeyService.verifyAuthentication(db, req.body.ceremonyId, req.body.response);
        if (!verification.verified) return next(new AppError('Passkey authentication failed', 401, true, 'PASSKEY_AUTH_FAILED'));
        await db.query('UPDATE user_passkeys SET counter = $1, last_used_at = NOW(), updated_at = NOW() WHERE passkey_id = $2 AND revoked_at IS NULL', [verification.authenticationInfo.newCounter, user.passkey_id]);
        const { token, refreshToken } = await AuthService.generateTokens(db, { user_id: user.user_id, role: user.role, email: user.email, full_name: user.full_name, must_change_password: user.must_change_password }, user.user_id, false, { ipAddress: req.ip, userAgent: req.get('user-agent') });
        setRefreshCookie(res, refreshToken);
        await logAction(db, { userId: user.user_id, action: 'LOGIN_SUCCESS_PASSKEY', resourceId: user.passkey_id, resourceTable: 'user_passkeys', ipAddress: req.ip, details: { role: user.role } });
        res.json({ message: 'Login Successful', token, user: { id: user.user_id, name: user.full_name, role: user.role, mustChangePassword: user.must_change_password, permissions: await permissionsFor(db, user.role) } });
    } catch (error) {
        if (error instanceof AppError) return next(error);
        next(new AppError('Passkey authentication failed', 401, true, 'PASSKEY_AUTH_FAILED'));
    }
};

const renamePasskey = db => async (req, res, next) => {
    try {
        const result = await db.query('UPDATE user_passkeys SET label = $1, updated_at = NOW() WHERE passkey_id::text = $2 AND user_id = $3 AND revoked_at IS NULL RETURNING passkey_id', [req.body.label, req.params.id, req.user.user_id]);
        if (!result.rows.length) return next(new AppError('Passkey not found', 404));
        res.json({ message: 'Passkey renamed' });
    } catch (error) { next(error); }
};

const revokePasskey = db => async (req, res, next) => {
    let client;
    try {
        client = await db.connect(); await client.query('BEGIN');
        const result = await client.query(`SELECT p.passkey_id, u.password_hash FROM user_passkeys p JOIN users u ON u.user_id = p.user_id WHERE p.user_id = $1 AND p.revoked_at IS NULL FOR UPDATE OF p`, [req.user.user_id]);
        const target = result.rows.find(row => String(row.passkey_id) === req.params.id);
        if (!target) throw new AppError('Passkey not found', 404);
        if (result.rows.length === 1 && !(req.body.currentPassword && await bcrypt.compare(req.body.currentPassword, target.password_hash))) throw new AppError('Current password is required to remove your final passkey', 400, true, 'CURRENT_PASSWORD_REQUIRED');
        await client.query('UPDATE user_passkeys SET revoked_at = NOW(), updated_at = NOW() WHERE passkey_id = $1', [target.passkey_id]);
        await logAction(client, { userId: req.user.user_id, action: 'PASSKEY_REVOKED', resourceId: target.passkey_id, resourceTable: 'user_passkeys', ipAddress: req.ip, details: {}, required: true });
        await client.query('COMMIT'); res.status(204).send();
    } catch (error) { if (client) await client.query('ROLLBACK').catch(() => {}); next(error); }
    finally { if (client) client.release(); }
};

module.exports = { authenticationOptions, authenticationVerify, listPasskeys, registrationOptions, registrationVerify, renamePasskey, revokePasskey };
