const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function runMigration() {
    try {
        console.log('Running migration 032: Add tracking columns to refresh_tokens...');

        await pool.query(`
            ALTER TABLE refresh_tokens 
            ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
            ADD COLUMN IF NOT EXISTS user_agent TEXT,
            ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(255);
        `);

        console.log('Migration 032 completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
