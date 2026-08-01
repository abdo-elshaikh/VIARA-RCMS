const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function runMigration() {
    try {
        console.log('Running migration 031: Create api_tokens table...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_tokens (
                token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                token_hash VARCHAR(255) NOT NULL UNIQUE,
                prefix VARCHAR(15) NOT NULL,
                last_used_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens(prefix);
        `);

        console.log('Migration 031 completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
