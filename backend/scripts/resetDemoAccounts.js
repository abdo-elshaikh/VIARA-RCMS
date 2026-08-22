const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL && process.env.POSTGRES_PASSWORD) {
    process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'VIARA')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:${process.env.POSTGRES_PORT || '5432'}/${encodeURIComponent(process.env.POSTGRES_DB || 'VIARA')}`;
}

const password = process.env.TEST_USER_PASSWORD || 'Password123!';
const demoAccounts = [
    ['Dr. Alice Smith', 'alice@viara.com', 'Radiologist'],
    ['Lead Technician', 'tech@viara.com', 'Technician'],
    ['Front Desk', 'reception@viara.com', 'Receptionist'],
    ['System Admin', 'admin@viara.com', 'Admin'],
    ['System Developer', 'developer@viara.com', 'Developer']
];

const run = async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        for (const [fullName, email, role] of demoAccounts) {
            const existing = await pool.query(
                'SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
                [email]
            );

            if (existing.rows.length) {
                await pool.query(`
                    UPDATE users SET
                        full_name = $1,
                        email = $2,
                        password_hash = $3,
                        role = $4,
                        is_active = TRUE,
                        failed_login_attempts = 0,
                        locked_until = NULL,
                        must_change_password = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $5
                `, [fullName, email, passwordHash, role, existing.rows[0].user_id]);
            } else {
                await pool.query(`
                    INSERT INTO users (
                        full_name, email, password_hash, role, is_active,
                        failed_login_attempts, locked_until, must_change_password
                    )
                    VALUES ($1, $2, $3, $4, TRUE, 0, NULL, FALSE)
                `, [fullName, email, passwordHash, role]);
            }
        }
        console.log(`Reset ${demoAccounts.length} demo account passwords.`);
    } finally {
        await pool.end();
    }
};

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
