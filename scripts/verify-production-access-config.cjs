'use strict';
// Offline configuration checks: no daemon, live database, or existing .env is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(root, 'scratch/production-access-check-'));
const template = path.join(root, 'viara-production-package/.env.example');
const secrets = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY', 'BLIND_INDEX_KEY', 'METRICS_TOKEN', 'REDIS_PASSWORD', 'ORTHANC_PASSWORD', 'PACS_WEBHOOK_SECRET'];
const env = { ...process.env };
for (const key of secrets) delete env[key];
let checks = 0;
const run = (command, args) => spawnSync(command, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
const verifyInitializer = (binary, args, output) => {
  const r = run(binary, args);
  assert.equal(r.status, 0, r.stderr);
  const bytes = fs.readFileSync(output);
  assert(!bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'env has a UTF8 BOM'); checks++;
  const content = bytes.toString('utf8');
  const values = secrets.map(key => {
    const match = content.match(new RegExp(`^${key}=([a-f0-9]{64})\\r?$`, 'm'));
    assert(match, `${key} was not generated correctly`); checks++;
    return match[1];
  });
  assert.equal(new Set(values).size, secrets.length, 'cryptographic keys must be independent'); checks++;
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const repeated = run(binary, args);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'), hash, 'existing environment changed'); checks++;
  for (const value of values) assert(!`${r.stdout}${r.stderr}${repeated.stdout}${repeated.stderr}`.includes(value), 'secret was logged'); checks++;
  return content;
};
try {
  let content;
  if (process.platform === 'win32') {
    content = verifyInitializer('powershell.exe', ['-NoProfile', '-File', path.join(root, 'viara-production-package/scripts/initialize-env.ps1'), '-TemplatePath', template, '-OutputPath', path.join(temp, 'windows.env')], path.join(temp, 'windows.env'));
  }
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const linuxOutput = path.join(temp, 'linux.env');
  const linuxContent = verifyInitializer(bash, ['viara-production-package/scripts/initialize-env.sh', 'viara-production-package/.env.example', path.relative(root, linuxOutput).replaceAll('\\', '/')], linuxOutput);
  content ||= linuxContent;
  // Synthetic digests validate interpolation only; no images are pulled or run.
  content = content.replace(/^([A-Z0-9_]*IMAGE)=.*$/gm, (_, key) => `${key}=example.invalid/viara/test@sha256:${'a'.repeat(64)}`);
  const envFile = path.join(temp, 'compose.env');
  fs.writeFileSync(envFile, content);
  const args = ['compose', '--env-file', envFile, '-f', path.join(root, 'viara-production-package/docker-compose.yml'), '--profile', 'caddy-ssl', 'config', '--format', 'json'];
  const compiled = run('docker', args);
  assert.equal(compiled.status, 0, 'Compose did not accept the complete synthetic environment'); checks++;
  const config = JSON.parse(compiled.stdout);
  for (const name of ['frontend', 'portal', 'backend', 'postgres', 'ohif', 'orthanc']) {
    for (const binding of config.services[name].ports || []) {
      assert.equal(binding.host_ip, '127.0.0.1', `${name} has a public default listener`); checks++;
    }
  }
  assert.equal(config.services.backend.environment.TRUST_PROXY, 'loopback,172.28.0.5,172.28.0.10,172.28.0.11'); checks++;
  assert(config.services.caddy.depends_on.portal, 'public gateway must wait for portal readiness'); checks++;
  const images = [...content.matchAll(/^([A-Z0-9_]*IMAGE)=/gm)].map(match => match[1]);
  for (const key of [...secrets, ...images]) {
    fs.writeFileSync(envFile, content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=`));
    const missing = run('docker', args);
    assert.notEqual(missing.status, 0, `Compose accepted an empty ${key}`);
    assert(missing.stderr.includes(key), `Compose failure did not identify ${key}`); checks++;
  }
  fs.writeFileSync(envFile, content);
  console.log(JSON.stringify({ checks, compose: 'valid; all required secrets fail closed when empty', initializers: process.platform === 'win32' ? 'PowerShell 5.1 and Bash passed; existing keys preserved' : 'Bash passed; existing keys preserved', productionServicesStarted: false }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
