const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms'
});

async function runMigration() {
    try {
        console.log('Running migration 033: Add reception permissions...');

        await pool.query('BEGIN');

        // Insert new permissions
        const newPermissions = [
            { name: 'PRINT_LABELS', module: 'Reception', description: 'Allows printing patient stickers and labels' },
            { name: 'PRINT_RECEIPTS', module: 'Reception', description: 'Allows printing test result receipts' },
            { name: 'BYPASS_WAITLIST', module: 'Reception', description: 'Allows bypassing the waitlist to move patients to exams' },
            { name: 'OVERRIDE_PRICING', module: 'Billing', description: 'Allows overriding pricing and applying custom discounts' }
        ];

        for (const p of newPermissions) {
            await pool.query(`
                INSERT INTO permissions (name, module, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (name) DO NOTHING
            `, [p.name, p.module, p.description]);
        }

        // Grant to Receptionist and Admin
        const roles = ['Receptionist', 'Admin'];
        
        for (const p of newPermissions) {
            for (const role of roles) {
                await pool.query(`
                    INSERT INTO role_permissions (role_name, permission_id)
                    SELECT $1, permission_id FROM permissions WHERE name = $2
                    ON CONFLICT DO NOTHING
                `, [role, p.name]);
            }
        }

        await pool.query('COMMIT');
        console.log('Migration 033 completed successfully.');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
