'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const yauzl = require('../../../backend/node_modules/yauzl');
const root = path.resolve(__dirname, '../../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const docker = args => cp.execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const inspect = name => JSON.parse(docker(['inspect', name]))[0];
const envOf = item => Object.fromEntries((item.Config.Env || []).map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
function runtime() {
  const backend = inspect('VIARA_backend'), ohif = inspect('VIARA_ohif'), orthanc = inspect('VIARA_orthanc');
  const env = envOf(backend);
  let databaseUser = null; try { databaseUser = new URL(env.DATABASE_URL).username; } catch {}
  let reviewedImage = null; try { reviewedImage = docker(['image', 'inspect', 'viara-backend:multibranch-final-20261014', '--format', '{{.Id}}']).trim(); } catch {}
  const config = JSON.parse(docker(['exec', 'VIARA_orthanc', 'cat', '/etc/orthanc/orthanc.json']));
  return {
    capturedAtUtc: new Date().toISOString(), readOnly: true,
    backend: { status: backend.State.Status, health: backend.State.Health?.Status, restarting: backend.State.Restarting,
      restartCount: backend.RestartCount, image: backend.Image, reviewedImage, matchesReviewedImage: backend.Image === reviewedImage,
      mode: env.NODE_ENV, databaseUser, separateBackupUrlConfigured: Boolean(env.BACKUP_DATABASE_URL),
      separateRestoreUrlConfigured: Boolean(env.RESTORE_DATABASE_URL),
      keyFormat: Object.fromEntries(['ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY'].map(k => [k, { present: Boolean(env[k]), hex256: /^[a-f0-9]{64}$/i.test(env[k] || '') }]))
    },
    ohif: { status: ohif.State.Status, health: ohif.State.Health?.Status, image: ohif.Image },
    orthanc: { status: orthanc.State.Status, health: orthanc.State.Health?.Status, image: orthanc.Image, portBindings: orthanc.HostConfig.PortBindings,
      flags: Object.fromEntries(['AuthenticationEnabled','DicomAlwaysAllowStore','DicomAlwaysAllowFind','DicomAlwaysAllowMove','DicomAlwaysAllowGet','DicomAlwaysAllowFindWorklist','DicomCheckModalityHost'].map(k => [k, config[k] ?? null])) }
  };
}
function compose() {
  const base = { ...process.env };
  const text = fs.readFileSync(path.join(root, 'viara-production-package/docker-compose.yml'), 'utf8');
  const required = [...text.matchAll(/\$\{([A-Z0-9_]+):\?/g)].map(m => m[1]);
  for (const key of required) base[key] = /_IMAGE$/.test(key) ? 'example.invalid/viara:test' : 'a'.repeat(64);
  base.CLIENT_URL = 'https://clinical.example.invalid'; base.PORTAL_CLIENT_URL = 'https://portal.example.invalid';
  const variants = [['missingBoth', '', ''], ['missingBackupOnly', 'a'.repeat(64), ''], ['bothProvided', 'a'.repeat(64), 'b'.repeat(64)]];
  return variants.map(([name, appPassword, backupPassword]) => {
    const result = cp.spawnSync('docker', ['compose', '--env-file', path.join(root, 'viara-production-package/.env.example'), '-f', path.join(root, 'viara-production-package/docker-compose.yml'), 'config', '--quiet'],
      { env: { ...base, APP_DB_PASSWORD: appPassword, BACKUP_DB_PASSWORD: backupPassword }, cwd: root, encoding: 'utf8' });
    return { name, status: result.status, diagnostic: (result.stderr || '').trim(), changesToContainers: false, allInputsSynthetic: true };
  });
}
function zipInfo(relative) {
  const full = path.join(root, relative);
  return new Promise((resolve, reject) => {
    yauzl.open(full, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const info = { path: relative, bytes: fs.statSync(full).size, migrationFiles: [], releaseInfo: null, comparisons: [] };
      const comparisons = ['database/migrate.js','docker-compose.yml','.env.example','scripts/initialize-env.ps1'];
      zip.on('error', reject);
      zip.on('entry', entry => {
        const migrationMatch = entry.fileName.match(/(?:^|\/)database\/migrations\/(\d+_.*\.sql)$/);
        if (migrationMatch) info.migrationFiles.push('database/migrations/' + migrationMatch[1]);
        const isMetadata = /(?:^|\/)release-info\.json$/.test(entry.fileName);
        const comparisonName = comparisons.find(name => entry.fileName === name || entry.fileName.endsWith('/' + name));
        if (!isMetadata && !comparisonName) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => {
            const bytes = Buffer.concat(chunks);
            if (isMetadata) {
              const meta = JSON.parse(bytes.toString('utf8'));
              info.releaseInfo = { sourceCommit: meta.sourceCommit, approval: meta.approval, keys: Object.keys(meta) };
            } else {
              const current = fs.readFileSync(path.join(root, 'viara-production-package', comparisonName));
              info.comparisons.push({ path: comparisonName, archiveSha256: sha(bytes), currentSha256: sha(current), matchesCurrent: sha(bytes) === sha(current) });
            }
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        info.migrationCount = info.migrationFiles.length;
        const current = fs.readdirSync(path.join(root, 'database/migrations')).filter(p => /^\d+_.*\.sql$/.test(p));
        info.missingCurrentMigrations = current.filter(p => !info.migrationFiles.includes('database/migrations/' + p));
        resolve(info);
      });
      zip.readEntry();
    });
  });
}
async function fileHash(relative) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(root, relative))) hash.update(chunk);
  return hash.digest('hex');
}
(async () => {
  const results = { dateCairo: '2026-10-14', runtime: runtime(), composeSyntheticConfiguration: compose() };
  const archive = 'dist/client-release/viara-rcms-client-v1.0.0-Offline-20261010T110548.zip';
  results.documentedDeliveryArchive = await zipInfo(archive);
  results.documentedDeliveryArchive.sha256 = await fileHash(archive);
  results.documentedDeliveryArchive.sidecarSha256 = fs.readFileSync(path.join(root, archive + '.sha256'), 'utf8').trim().split(/\s+/)[0];
  results.documentedDeliveryArchive.sidecarMatches = results.documentedDeliveryArchive.sha256 === results.documentedDeliveryArchive.sidecarSha256;
  results.latestAlias = await zipInfo('dist/client-release/viara-rcms-client-latest.zip');
  results.latestManifestBuildTime = JSON.parse(fs.readFileSync(path.join(root,'dist/client-release/release-manifest-latest.json'),'utf8')).build_timestamp;
  fs.writeFileSync(path.join(__dirname, 'deployment-current-evidence.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ runtime: results.runtime, compose: results.composeSyntheticConfiguration,
    delivery: { source: results.documentedDeliveryArchive.releaseInfo, migrationCount: results.documentedDeliveryArchive.migrationCount,
      missingMigrations: results.documentedDeliveryArchive.missingCurrentMigrations.length, sidecarMatches: results.documentedDeliveryArchive.sidecarMatches },
    latest: { migrationCount: results.latestAlias.migrationCount, buildTime: results.latestManifestBuildTime } }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
