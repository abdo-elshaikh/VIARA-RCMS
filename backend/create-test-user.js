const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function createTestUser() {
    try {
        console.log('Creating test user...');
        const password = await bcrypt.hash('password123', 10);

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
        console.log('Password: password123');
        console.log('Role:', result.rows[0].role);
        console.log('User ID:', result.rows[0].user_id);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

createTestUser();
