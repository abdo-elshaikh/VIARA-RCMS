const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const backendRequire = require('node:module').createRequire(path.join(root, 'backend/package.json'));
const { Pool } = backendRequire('pg');
const log = fs.openSync(path.join(__dirname, 'docker-integration.log'), 'w');
const owned = [];
const command = (exe, args, env, capture = false) => {
    const r = spawnSync(exe, args, { cwd: root, env: env || process.env, encoding: capture ? 'utf8' : undefined, stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', log, log], timeout: 240000, windowsHide: true });
    if (r.status !== 0) throw Error(`${path.basename(exe)} failed; see isolated integration log`);
    return r.stdout?.trim();
};
async function main() {
    const started = Date.now(), suffix = crypto.randomBytes(5).toString('hex'), password = crypto.randomBytes(24).toString('hex');
    try {
        const pg = command('docker', ['run', '--detach', '--name', 'viara-fix-pg-' + suffix, '--label', 'viara.task=readiness-fixes', '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=VIARA', '-e', 'POSTGRES_PASSWORD=' + password, '-e', 'POSTGRES_DB=VIARA_release_test', 'postgres:15-alpine'], null, true); owned.push(pg);
        const redis = command('docker', ['run', '--detach', '--name', 'viara-fix-redis-' + suffix, '--label', 'viara.task=readiness-fixes', '-p', '127.0.0.1::6379', 'redis:7-alpine'], null, true); owned.push(redis);
        const port = (id, service) => JSON.parse(command('docker', ['inspect', id], null, true))[0].NetworkSettings.Ports[service][0].HostPort;
        const databaseUrl = `postgresql://VIARA:${password}@127.0.0.1:${port(pg, '5432/tcp')}/VIARA_release_test`;
        const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
        try {
            let ready = false;
            for (let i = 0; i < 40; i++) { try { await pool.query('SELECT 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); } }
            if (!ready) throw Error('Temporary PostgreSQL did not become ready');
        } finally { await pool.end(); }
        const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, VIARA_RELEASE_TEST_DATABASE_URL: databaseUrl, VIARA_RELEASE_TEST_REDIS_URL: `redis://127.0.0.1:${port(redis, '6379/tcp')}/15`, RATE_LIMIT_STORE: 'memory' };
        command(process.execPath, ['database/migrate.js', '--fresh'], env);
        command(process.execPath, ['database/migrate.js'], env);
        command(process.execPath, ['scripts/verify-release-database.cjs'], env);
        command(process.execPath, ['scripts/verify-release-redis.cjs'], env);
        const result = { success: true, postgresMajor: 15, redisMajor: 7, freshMigrations: true, idempotency: true, tokenConcurrency: true, sessionRevocation: true, sharedReplicaQuotas: true, quotaExpiry: true, durationSeconds: (Date.now() - started) / 1000 };
        fs.writeFileSync(path.join(__dirname, 'docker-integration.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    } finally {
        for (const id of owned.reverse()) command('docker', ['rm', '--force', '--volumes', id]);
        fs.closeSync(log);
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
