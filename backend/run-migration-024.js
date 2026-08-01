// Run Phase 12 notifications migration
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
        console.log('Running Phase 12 - Notifications migration (024)...');

        const sql = fs.readFileSync(
            path.join(__dirname, '../database/migrations/024_notifications_expanded.sql'),
            'utf8'
        );

        await pool.query(sql);

        console.log('✅ Migration 024_notifications_expanded completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
