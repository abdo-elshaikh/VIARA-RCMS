const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function runMigration() {
    try {
        console.log('Running migration 027_financial_management.sql...');
        const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/027_financial_management.sql'), 'utf8');
        await pool.query(sql);
        console.log('✅ Migration 027 completed successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
