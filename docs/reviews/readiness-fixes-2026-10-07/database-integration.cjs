const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const requireBackend = require('node:module').createRequire(path.join(root, 'backend/package.json'));
const env = { ...process.env, ...requireBackend('dotenv').parse(fs.readFileSync(path.join(root, '.env'))) };
const base = new URL(env.DATABASE_URL);
if (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(base.hostname)) throw Error('Only the local development cluster is allowed');
const { Pool } = requireBackend('pg');
const name = `viara_fix_${crypto.randomBytes(5).toString('hex')}_release_test`;
const restoreName = `${name}_restore_release_test`;
const admin = new Pool({ connectionString: base.toString(), max: 1 });
const created = [];
const log = fs.openSync(path.join(__dirname, 'database-integration.log'), 'w');
const bin = 'C:/Program Files/PostgreSQL/18/bin/';
const dbUrl = db => { const url = new URL(base); url.pathname = '/' + db; return url.toString(); };
const run = (exe, args, childEnv) => {
    const r = spawnSync(exe, args, { cwd: root, env: childEnv, stdio: ['ignore', log, log], timeout: 180000 });
    if (r.status !== 0) throw Error(`Isolated command failed: ${path.basename(exe)} (see log)`);
};
async function main() {
    const start = Date.now(); const temp = path.join(__dirname, 'synthetic-restore.dump.tmp');
    const encrypted = path.join(__dirname, 'synthetic-restore.dump.enc.tmp');
    const decrypted = path.join(__dirname, 'synthetic-restore.verified.tmp');
    try {
        await admin.query(`CREATE DATABASE "${name}"`); created.push(name);
        const testEnv = { ...env, NODE_ENV: 'test', DATABASE_URL: dbUrl(name), VIARA_RELEASE_TEST_DATABASE_URL: dbUrl(name), RATE_LIMIT_STORE: 'memory' };
        run(process.execPath, ['database/migrate.js', '--fresh'], testEnv);
        run(process.execPath, ['database/migrate.js'], testEnv);
        run(process.execPath, ['scripts/verify-release-database.cjs'], testEnv);
        Object.assign(process.env, testEnv);
        const backup = requireBackend('./src/services/postgresBackupService');
        run(bin + 'pg_dump.exe', ['--format=custom', '--no-owner', '--no-privileges', '--file=' + temp], backup.buildPgEnvironment(dbUrl(name)));
        await backup.encryptBackup(temp, encrypted); await backup.decryptBackup(encrypted, decrypted);
        await admin.query(`CREATE DATABASE "${restoreName}"`); created.push(restoreName);
        const restoreStart = Date.now();
        run(bin + 'pg_restore.exe', ['--no-owner', '--no-privileges', '--dbname=' + restoreName, decrypted], backup.buildPgEnvironment(dbUrl(restoreName)));
        const restored = new Pool({ connectionString: dbUrl(restoreName), max: 1 });
        try {
            const result = await restored.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE password_reset_token IS NULL AND current_session_id IS NULL)::int AS cleared FROM users WHERE email LIKE 'release-%@example.test'`);
            if (result.rows[0].total !== 1 || result.rows[0].cleared !== 1) throw Error('Restored state does not match expected committed state');
        } finally { await restored.end(); }
        const result = { success: true, freshMigrations: true, idempotency: true, concurrencyAndSessionRevocation: true, encryptedSqlRestore: true, restoredSyntheticUsers: 1, postgresMajor: 18, restoreSeconds: (Date.now() - restoreStart) / 1000, totalSeconds: (Date.now() - start) / 1000, scope: 'Disposable SQL database only; no PACS or live data restored' };
        fs.writeFileSync(path.join(__dirname, 'database-integration.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    } finally {
        for (const file of [temp, encrypted, decrypted]) if (fs.existsSync(file)) fs.unlinkSync(file);
        for (const db of created.reverse()) await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`);
        await admin.end(); fs.closeSync(log);
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
