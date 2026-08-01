// Run Phase 11 doctor portal migration
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const dotenvPath = path.join(__dirname, '.env');
require('dotenv').config({ path: dotenvPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function runMigration() {
    try {
        console.log('Running Phase 11 - Doctor Portal migration (023)...');

        const sql = fs.readFileSync(
            path.join(__dirname, '../database/migrations/023_doctor_portal.sql'),
            'utf8'
        );

        await pool.query(sql);

        console.log('✅ Migration 023_doctor_portal completed successfully!');
        console.log('Tables/columns created:');
        console.log('  - referring_doctors: portal_password_hash, portal_is_active, portal_last_login');
        console.log('  - doctor_portal_messages');
        console.log('  - doctor_portal_audit');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
