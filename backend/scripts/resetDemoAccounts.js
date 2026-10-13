const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Support loading .env from backend or project root
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL && process.env.POSTGRES_PASSWORD) {
    const port = process.env.POSTGRES_PORT || '5433';
    process.env.DATABASE_URL = `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'VIARA')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@127.0.0.1:${port}/${encodeURIComponent(process.env.POSTGRES_DB || 'VIARA')}`;
}

const password = process.env.TEST_USER_PASSWORD || 'ViaraAdmin@2026';

const demoAccounts = [
    { fullName: 'Abdelrahman Elsharif', email: 'admin@viara.com', role: 'Admin', isOrgAdmin: true },
    { fullName: 'Platform Engineer', email: 'developer@viara.com', role: 'Developer', isOrgAdmin: true },
    { fullName: 'Dr. Alice Morgan', email: 'alice@viara.com', role: 'Radiologist', isOrgAdmin: false },
    { fullName: 'Mohamed Ali', email: 'tech@viara.com', role: 'Technician', isOrgAdmin: false },
    { fullName: 'Sarah Mahmoud', email: 'nurse@viara.com', role: 'Nurse', isOrgAdmin: false },
    { fullName: 'Fatima Ahmed', email: 'reception@viara.com', role: 'Receptionist', isOrgAdmin: false },
    { fullName: 'Omar Khaled', email: 'cashier@viara.com', role: 'Cashier', isOrgAdmin: false },
    { fullName: 'Karim Mostafa', email: 'accountant@viara.com', role: 'Accountant', isOrgAdmin: false },
    { fullName: 'Hoda Ibrahim', email: 'hr@viara.com', role: 'HR', isOrgAdmin: false },
    { fullName: 'Insurance Specialist', email: 'insurance@viara.com', role: 'Insurance_Staff', isOrgAdmin: false }
];

const run = async () => {
    if (!password) throw new Error('TEST_USER_PASSWORD is required to reset demo account passwords');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const orgRes = await pool.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
        const defaultOrgId = orgRes.rows[0]?.id || '00000000-0000-4000-8000-000000000000';

        const branchRes = await pool.query('SELECT id FROM branches WHERE is_main = TRUE LIMIT 1');
        const defaultBranchId = branchRes.rows[0]?.id || '00000000-0000-4000-8000-000000000001';

        // Grant Developer permissions if permissions table exists
        await pool.query(`
            INSERT INTO role_permissions (role_name, permission_id)
            SELECT 'Developer'::user_role, permission_id
            FROM permissions
            ON CONFLICT DO NOTHING
        `).catch(() => { });

        const passwordHash = await bcrypt.hash(password, 12);

        for (const account of demoAccounts) {
            const { fullName, email, role, isOrgAdmin } = account;
            const existing = await pool.query(
                'SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
                [email]
            );

            let userId;
            if (existing.rows.length) {
                userId = existing.rows[0].user_id;
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
                        organization_id = COALESCE(organization_id, $5),
                        is_org_admin = $6,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $7
                `, [fullName, email.toLowerCase(), passwordHash, role, defaultOrgId, isOrgAdmin, userId]);
            } else {
                const inserted = await pool.query(`
                    INSERT INTO users (
                        full_name, email, password_hash, role, is_active,
                        failed_login_attempts, locked_until, must_change_password,
                        organization_id, is_org_admin
                    )
                    VALUES ($1, $2, $3, $4, TRUE, 0, NULL, FALSE, $5, $6)
                    RETURNING user_id
                `, [fullName, email.toLowerCase(), passwordHash, role, defaultOrgId, isOrgAdmin]);
                userId = inserted.rows[0].user_id;
            }

            // Ensure active membership on the main branch
            await pool.query(`
                INSERT INTO user_branch_memberships (
                    id, user_id, branch_id, role, is_active, is_default, created_at, updated_at
                )
                VALUES (
                    gen_random_uuid(), $1, $2, $3, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (user_id, branch_id) DO UPDATE SET
                    role = EXCLUDED.role,
                    is_active = TRUE,
                    is_default = TRUE,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, defaultBranchId, role]);
        }

        console.log(`Successfully reset and activated ${demoAccounts.length} demo accounts.`);
    } finally {
        await pool.end();
    }
};

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
