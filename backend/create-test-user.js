const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
const testPasswordPlain = process.env.TEST_USER_PASSWORD;

if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set. Aborting to avoid using unsafe defaults.');
    process.exit(1);
}
if (!testPasswordPlain) {
    console.error('❌ TEST_USER_PASSWORD is not set. Provide a secure password via environment variable.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: dbUrl
});

async function createTestUser() {
    try {
        console.log('Creating test user...');
        const password = await bcrypt.hash(testPasswordPlain, 10);

        // Delete existing test user if exists
        await pool.query(`DELETE FROM users WHERE email = 'admin@rcms.com'`);

        // Create new admin user
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role, is_active) 
             VALUES ('Admin User', 'admin@rcms.com', $1, 'Admin', TRUE)
             RETURNING user_id, email, role`,
            [password]
        );

        console.log('✅ Test user created successfully!');
        console.log('Email: admin@rcms.com');
        console.log('Role:', result.rows[0].role);
        console.log('User ID:', result.rows[0].user_id);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

createTestUser();
