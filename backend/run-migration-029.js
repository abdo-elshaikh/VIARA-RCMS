const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function runMigration() {
    try {
        console.log('Running migration 029_crm_marketing.sql...');
        const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/029_crm_marketing.sql'), 'utf8');
        await pool.query(sql);
        console.log('✅ Migration 029 completed successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
