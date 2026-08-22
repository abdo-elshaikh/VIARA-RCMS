const crypto = require('node:crypto');
const fs = require('node:fs');

const applyTrackedMigration = async (pool, { version, filePath, verifyApplied }) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('VIARA_schema_migrations'))");
        await client.query(`
            CREATE TABLE IF NOT EXISTS tracked_schema_migrations (
                version VARCHAR(80) PRIMARY KEY,
                checksum VARCHAR(64) NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const existing = await client.query(
            'SELECT checksum FROM tracked_schema_migrations WHERE version = $1 FOR UPDATE',
            [version]
        );
        if (existing.rows.length) {
            if (existing.rows[0].checksum !== checksum) {
                if (typeof verifyApplied === 'function') {
                    const verified = await verifyApplied(client);
                    if (verified) {
                        await client.query(
                            'UPDATE tracked_schema_migrations SET checksum = $2, applied_at = applied_at WHERE version = $1',
                            [version, checksum]
                        );
                        await client.query('COMMIT');
                        return { version, applied: false, repairedChecksum: true };
                    }
                }
                throw new Error(`Migration ${version} was modified after it was applied`);
            }
            await client.query('COMMIT');
            return { version, applied: false };
        }

        await client.query(sql);
        await client.query(
            'INSERT INTO tracked_schema_migrations (version, checksum) VALUES ($1, $2)',
            [version, checksum]
        );
        await client.query('COMMIT');
        return { version, applied: true };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { applyTrackedMigration };
