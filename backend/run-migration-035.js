const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function runMigration() {
    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

    try {
        console.log('Starting migration 035 - Add Branch Settings...');
        await pool.query('BEGIN');

        // Add new columns to center_settings table
        await pool.query(`
            ALTER TABLE center_settings
            ADD COLUMN IF NOT EXISTS branch_name VARCHAR(200),
            ADD COLUMN IF NOT EXISTS logo_url TEXT,
            ADD COLUMN IF NOT EXISTS contact_person VARCHAR(200),
            ADD COLUMN IF NOT EXISTS other_details TEXT;
        `);

        console.log('Successfully added branch_name, logo_url, contact_person, and other_details to center_settings.');
        
        await pool.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
