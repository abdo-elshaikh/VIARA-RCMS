// Run Phase 13 advanced inventory migration
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
        console.log('Running Phase 13 - Advanced Inventory migration (025)...');

        const sql = fs.readFileSync(
            path.join(__dirname, '../database/migrations/025_advanced_inventory.sql'),
            'utf8'
        );

        await pool.query(sql);

        console.log('✅ Migration 025_advanced_inventory completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
