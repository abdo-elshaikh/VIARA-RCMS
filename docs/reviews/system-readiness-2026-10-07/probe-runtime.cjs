const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const report = {};
const dotenv = require(path.join(root, 'backend/node_modules/dotenv'));
const parse = name => fs.existsSync(path.join(root, name)) ? dotenv.parse(fs.readFileSync(path.join(root, name))) : {};
const env = parse('.env');
const required = ['JWT_SECRET', 'ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY', 'BLIND_INDEX_KEY', 'POSTGRES_PASSWORD', 'ORTHANC_PASSWORD', 'PACS_WEBHOOK_SECRET'];
report.environment = {
    source: '.env (values withheld)',
    mode: env.NODE_ENV || 'unset',
    missingSecrets: required.filter(k => !env[k]),
    placeholderSecrets: required.filter(k => /REPLACE_ME|CHANGE_ME|^test$|^password$/i.test(env[k] || '')),
    duplicateEncryptionKeys: Boolean(env.ENCRYPTION_KEY && env.ENCRYPTION_KEY === env.BACKUP_ENCRYPTION_KEY),
    blindIndexEqualsEncryption: Boolean(env.BLIND_INDEX_KEY && env.BLIND_INDEX_KEY === env.ENCRYPTION_KEY),
    insecureStaffOrigin: Boolean(env.CLIENT_URL && !env.CLIENT_URL.startsWith('https://')),
    insecurePortalOrigin: Boolean(env.PORTAL_CLIENT_URL && !env.PORTAL_CLIENT_URL.startsWith('https://')),
    resetOriginConfigured: Boolean(env.APP_URL),
    performanceBypassEnabled: env.PERF_TEST === 'true',
    dicomBoundToAllInterfaces: env.PACS_DICOM_BIND === '0.0.0.0',
};
for (const [name, args] of [['docker-compose', ['compose', 'config', '--quiet']], ['docker-services', ['ps', '--format', '{{.Names}} {{.Status}}']]]) {
    const result = spawnSync('docker', args, { cwd: root, timeout: 8000, encoding: 'utf8', windowsHide: true });
    report[name] = { exitCode: result.status, timedOut: result.error?.code === 'ETIMEDOUT', error: result.error?.code || null, stdout: result.stdout?.trim(), stderr: result.stderr?.trim() };
}
async function main() {
    report.http = [];
    for (const [port, route] of [[3000, '/health/live'], [3000, '/health/ready'], [3000, '/api/patients'], [5173, '/'], [5174, '/']]) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(3000) });
            report.http.push({ port, route, status: response.status, securityHeaders: ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options'].filter(h => response.headers.has(h)) });
            await response.body?.cancel();
        } catch (error) { report.http.push({ port, route, error: error.cause?.code || error.name }); }
    }
    fs.writeFileSync(path.join(__dirname, 'runtime.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
