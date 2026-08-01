const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    console.log('Starting migration 030: Add preferences to users...');
    try {
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
        `);
        console.log('✅ Migration 030 completed successfully.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await pool.end();
    }
}

run();
