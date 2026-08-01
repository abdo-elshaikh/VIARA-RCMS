const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

// Need the same crypto logic as backend/src/utils/crypto.js
const algorithm = 'aes-256-gcm';
const password = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_dev_env!';
const key = crypto.scryptSync(password, 'salt', 32);

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

async function setupDemoPatient() {
    try {
        console.log('Setting up demo patient credentials...');
        const pass = await bcrypt.hash('password123', 10);
        const demoEmail = 'patient@rcms.com';
        let patientId;
        let mrn = 'PAT-DEMO';

        // Find the first patient
        const result = await pool.query('SELECT patient_id, mrn FROM patients LIMIT 1');
        
        if (result.rows.length === 0) {
            console.log('⚠️ No patients found. Creating a brand new demo patient...');
            // Create a new patient
            const insertResult = await pool.query(
                `INSERT INTO patients (
                    mrn, first_name_enc, last_name_enc, date_of_birth_enc, 
                    gender, email, password_hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING patient_id`,
                [
                    mrn,
                    encrypt('Demo'),
                    encrypt('Patient'),
                    encrypt('1990-01-01'),
                    'Other',
                    demoEmail,
                    pass
                ]
            );
            patientId = insertResult.rows[0].patient_id;
        } else {
            patientId = result.rows[0].patient_id;
            mrn = result.rows[0].mrn;
            console.log('✅ Existing patient found. Updating with demo email and password...');
            
            // Update the patient with email and password
            await pool.query(
                `UPDATE patients 
                 SET email = $1, password_hash = $2 
                 WHERE patient_id = $3`,
                [demoEmail, pass, patientId]
            );
        }

        console.log('✅ Demo patient credentials set up successfully!');
        console.log('---');
        console.log(`MRN: ${mrn}`);
        console.log(`Email: ${demoEmail}`);
        console.log(`Password: password123`);
        console.log('---');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

setupDemoPatient();
