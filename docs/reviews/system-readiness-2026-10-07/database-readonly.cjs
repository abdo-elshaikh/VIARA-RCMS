const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const { Pool } = require(path.join(root, 'backend/node_modules/pg'));
const dotenv = require(path.join(root, 'backend/node_modules/dotenv'));
const config = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
const connectionString = config.DATABASE_URL || `postgresql://${encodeURIComponent(config.POSTGRES_USER || 'VIARA')}:${encodeURIComponent(config.POSTGRES_PASSWORD)}@127.0.0.1:${config.POSTGRES_PORT || 5432}/${encodeURIComponent(config.POSTGRES_DB || 'VIARA')}`;
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
const manifest = file => [...fs.readFileSync(path.join(root, file), 'utf8').split('const MIGRATION_FILES = [')[1].split('];')[0].matchAll(/'([^']+\.sql)'/g)].map(m => m[1]);
async function main() {
    const source = manifest('database/migrate.js');
    const bundle = manifest('viara-production-package/database/migrate.js');
    const sqlFiles = fs.readdirSync(path.join(root, 'database/migrations')).filter(n => n.endsWith('.sql'));
    const result = { sourceManifestCount: source.length, bundleManifestCount: bundle.length, unregisteredMigrations: sqlFiles.filter(n => !source.includes(n)), missingBundleMigrations: source.filter(n => !fs.existsSync(path.join(root, 'viara-production-package/database/migrations', n))), manifestsEqual: JSON.stringify(source) === JSON.stringify(bundle) };
    let client;
    try {
        try {
            client = await pool.connect();
            result.configurationSource = 'root .env';
        } catch (error) {
            result.rootConfigurationError = { code: error.code, message: String(error.message) };
            const alternate = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env')));
            if (!alternate.DATABASE_URL || alternate.DATABASE_URL === connectionString) throw error;
            result.configurationSource = 'backend/.env fallback, read only';
            const alternatePool = new Pool({ connectionString: alternate.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
            client = await alternatePool.connect();
            result.alternatePool = alternatePool;
        }
        await client.query('BEGIN READ ONLY');
        const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('password_reset_token','password_reset_expires')");
        result.liveResetColumns = columns.rows.map(r => r.column_name);
        const migrations = await client.query('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
        result.liveAppliedCount = migrations.rows.length;
        result.liveAppliedNotInManifest = migrations.rows.map(r => r.filename).filter(n => !source.includes(n));
        result.pendingRegisteredMigrations = source.filter(n => !migrations.rows.some(r => r.filename === n));
        result.checksumMismatches = migrations.rows.filter(r => {
            const file = path.join(root, 'database/migrations', r.filename);
            return r.checksum && fs.existsSync(file) && crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex') !== r.checksum;
        }).map(r => r.filename);
        result.databaseSizeMiB = Number((await client.query('SELECT pg_database_size(current_database())/1024/1024 AS mib')).rows[0].mib);
        result.maxConnections = (await client.query('SHOW max_connections')).rows[0].max_connections;
        result.connectionCounts = (await client.query('SELECT state, count(*)::int AS count FROM pg_stat_activity GROUP BY state')).rows;
        await client.query('ROLLBACK');
    } catch (error) { result.databaseError = { code: error.code, message: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') }; }
    finally { client?.release(); await pool.end(); if (result.alternatePool) { await result.alternatePool.end(); delete result.alternatePool; } }
    fs.writeFileSync(path.join(__dirname, 'database-readonly.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
