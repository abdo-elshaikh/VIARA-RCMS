const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://rcms:***REMOVED***@localhost:5432/rcms'
});

const PACS_MIGRATIONS = [
    '052_pacs_imaging.sql',
    '053_modality_dicom_config.sql',
    '055_pacs_permissions.sql',
    '056_pacs_quarantine_legacy_schema.sql',
    '064_pacs_ai_analysis_jobs.sql'
];

const run = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const file of PACS_MIGRATIONS) {
            const filePath = path.resolve(__dirname, '../database/migrations', file);
            const sql = fs.readFileSync(filePath, 'utf8');
            console.log(`Applying ${file}`);
            await client.query(sql);
        }
        await client.query('COMMIT');
        console.log('PACS migrations applied successfully.');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('PACS migration failed:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
};

run();
