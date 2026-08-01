const bcrypt = require('bcrypt');
const logger = require('../config/logger');

const SALT_ROUNDS = 10;
const MIN_DEVELOPER_PASSWORD_LENGTH = 12;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const validateDeveloperPassword = (password) => {
    if (!password) return;

    const checks = [
        [password.length >= MIN_DEVELOPER_PASSWORD_LENGTH, `at least ${MIN_DEVELOPER_PASSWORD_LENGTH} characters`],
        [/[A-Z]/.test(password), 'an uppercase letter'],
        [/[a-z]/.test(password), 'a lowercase letter'],
        [/[0-9]/.test(password), 'a number'],
        [/[^A-Za-z0-9]/.test(password), 'a symbol']
    ];

    const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
    if (missing.length) {
        throw new Error(`DEVELOPER_PASSWORD must include ${missing.join(', ')}.`);
    }
};

const grantDeveloperPermissions = async (db) => {
    await db.query(`
        INSERT INTO role_permissions (role_name, permission_id)
        SELECT 'Developer'::user_role, permission_id
        FROM permissions
        ON CONFLICT DO NOTHING
    `);
};

const upsertDeveloperUser = async (db, { email, password, fullName, mustChangePassword = true }) => {
    validateDeveloperPassword(password);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await db.query(`
        INSERT INTO users (
            full_name,
            email,
            password_hash,
            role,
            is_active,
            must_change_password,
            failed_login_attempts,
            locked_until
        )
        VALUES ($1, $2, $3, 'Developer'::user_role, TRUE, $4, 0, NULL)
        ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            password_hash = EXCLUDED.password_hash,
            role = 'Developer'::user_role,
            is_active = TRUE,
            must_change_password = EXCLUDED.must_change_password,
            failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
        RETURNING user_id, email, role
    `, [fullName || 'System Developer', email, passwordHash, mustChangePassword]);

    await grantDeveloperPermissions(db);
    return result.rows[0];
};

const promoteExistingDeveloperUser = async (db, email) => {
    const result = await db.query(`
        UPDATE users
        SET role = 'Developer'::user_role,
            is_active = TRUE,
            updated_at = NOW()
        WHERE LOWER(email) = $1
          AND is_active = TRUE
        RETURNING user_id, email, role
    `, [email]);

    if (!result.rows.length) return null;
    await grantDeveloperPermissions(db);
    return result.rows[0];
};

const seedDeveloperUser = async (db) => {
    const email = normalizeEmail(process.env.DEVELOPER_EMAIL);
    const password = String(process.env.DEVELOPER_PASSWORD || '');
    const fullName = String(process.env.DEVELOPER_FULL_NAME || 'System Developer').trim();
    const mustChangePassword = process.env.DEVELOPER_FORCE_PASSWORD_CHANGE !== 'false';

    if (!email) {
        return { promoted: false, created: false, reason: 'missing_email' };
    }

    if (password) {
        const user = await upsertDeveloperUser(db, { email, password, fullName, mustChangePassword });
        logger.info('Developer user bootstrapped from DEVELOPER_EMAIL.', {
            userId: user.user_id,
            email: user.email,
            createdOrUpdated: true
        });
        return { promoted: true, created: true, userId: user.user_id };
    }

    const user = await promoteExistingDeveloperUser(db, email);
    if (!user) {
        logger.warn('DEVELOPER_EMAIL did not match an active user and DEVELOPER_PASSWORD was not set; no Developer user was promoted.', { email });
        return { promoted: false, created: false, reason: 'user_not_found' };
    }

    logger.info('Developer user promoted from DEVELOPER_EMAIL.', {
        userId: user.user_id,
        email: user.email
    });
    return { promoted: true, created: false, userId: user.user_id };
};

module.exports = {
    MIN_DEVELOPER_PASSWORD_LENGTH,
    grantDeveloperPermissions,
    normalizeEmail,
    promoteExistingDeveloperUser,
    seedDeveloperUser,
    upsertDeveloperUser,
    validateDeveloperPassword
};
