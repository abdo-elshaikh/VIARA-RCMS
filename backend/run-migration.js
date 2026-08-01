// Quick script to run SQL migration
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function runMigration() {
    try {
        console.log('Running user_role enum migration...');

        const sql = fs.readFileSync(
            path.join(__dirname, '../database/migrations/007_fix_user_roles_enum.sql'),
            'utf8'
        );

        await pool.query(sql);

        console.log('✅ Migration completed successfully!');
        console.log('Available roles:');

        const result = await pool.query(`
            SELECT enumlabel as role 
            FROM pg_enum 
            WHERE enumtypid = 'user_role'::regtype 
            ORDER BY enumlabel
        `);

        result.rows.forEach(row => console.log(`  - ${row.role}`));

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await pool.end();
    }
}

runMigration();
