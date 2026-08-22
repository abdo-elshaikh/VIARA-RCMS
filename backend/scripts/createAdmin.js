const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/VIARA'
});

async function createAdmin() {
    try {
        const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const email = process.env.ADMIN_EMAIL || 'superadmin@VIARA.com';

        // Check if exists
        const check = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (check.rows.length > 0) {
            console.log('User exists. Updating password...');
            await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
        } else {
            console.log('Creating new Super Admin...');
            await pool.query(
                `INSERT INTO users (full_name, email, password_hash, role, is_active) 
                 VALUES ('Super Admin', $1, $2, 'Admin', TRUE)`,
                [email, hash]
            );
        }

        console.log(`Success! Login with: ${email} / ${password}`);
        if (!process.env.ADMIN_PASSWORD) {
            console.log('Store this generated password now; it will not be shown again.');
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

createAdmin();
