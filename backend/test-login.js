const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function checkLogin() {
    try {
        const email = 'patient@rcms.com';
        const password = process.env.TEST_USER_PASSWORD;
        if (!password) {
            console.error('❌ TEST_USER_PASSWORD not set. Aborting test-login check.');
            process.exit(1);
        }
        
        console.log(`Checking login for: ${email}`);
        
        const result = await pool.query("SELECT * FROM patients WHERE email = $1", [email]);
        
        if (result.rows.length === 0) {
            console.log('❌ Result rows length is 0 (Email not found)');
            return;
        }

        console.log('✅ Patient found:', result.rows[0].patient_id);
        const patient = result.rows[0];

        if (!patient.password_hash) {
            console.log('❌ No password hash');
            return;
        }

        const match = await bcrypt.compare(password, patient.password_hash);
        if (!match) {
            console.log('❌ Password does not match. Hash in DB:', patient.password_hash);
        } else {
            console.log('✅ Password matches!');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkLogin();
