const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

    try {
        console.log('Starting migration 036 - Add Marketing user role...');

        try {
            await pool.query(`ALTER TYPE user_role ADD VALUE 'Marketing';`);
            console.log('Added Marketing to user_role enum.');
        } catch (err) {
            console.log('Note: ' + err.message);
        }

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
