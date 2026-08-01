const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { runMigrations, runSeeds } = require('../database/migrate');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function resetDb() {
    console.log('🔄 Initiating full database reset...');
    try {
        await runMigrations(pool, { fresh: true });
        await runSeeds(pool);
        console.log('✅ Database reset and seeded successfully.');
    } catch (err) {
        console.error('❌ Reset failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

resetDb();
