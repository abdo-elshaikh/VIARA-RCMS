const path = require('path');
const { Pool } = require(path.resolve(__dirname, '../backend/node_modules/pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/viara_db' });

(async () => {
    const res = await pool.query(`
        SELECT patient_id, mrn, patient_status, (password_hash IS NOT NULL) as has_pw
        FROM patients
        LIMIT 10
    `);
    console.log('Patients:', res.rows);
    await pool.end();
})().catch(console.error);
