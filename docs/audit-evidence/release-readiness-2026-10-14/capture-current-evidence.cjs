'use strict';

// Read-only source inspection and mocked performance-harness probes.
// No application server, database connection, credentials, or patient data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const write = (name, value) => fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n');
const sourcePaths = git(['ls-files', '-c', '-o', '--exclude-standard']).split(/\r?\n/)
  .filter(p => /^(backend\/(src|tests)|frontend\/src|portal\/src|database|scripts|pacs|deploy|\.github|viara-production-package\/(database|scripts))\//.test(p)
    || /(^|\/)(package(-lock)?\.json|Dockerfile|docker-compose[^/]*\.yml|\.env\.example|\.nvmrc|vite\.config\.[^/]+|jest\.config\.js)$/.test(p))
  .filter(p => /\.(js|cjs|mjs|jsx|ts|tsx|sql|yml|yaml|json|ps1|sh|lua|conf|py)$/.test(p)
    || /(^|\/)(Dockerfile|\.env\.example|\.nvmrc)$/.test(p))
  .filter(p => !/(^|\/)(node_modules|dist|scratch|docs|backups|uploads|keys|license)(\/|$)/.test(p))
  .filter(p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
const hashes = Object.fromEntries(sourcePaths.sort().map(p => [p, sha256(path.join(root, p))]));
write('current-source-manifest.json', {
  reviewDateCairo: '2026-10-14', capturedAtUtc: new Date().toISOString(),
  commit: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
  node: process.version, status: git(['status', '--short']), hashes
});
const historical = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/multibranch-deep-2026-10-14/source-manifest.json'), 'utf8'));
const comparison = Object.entries(historical.hashes).map(([p, previous]) => ({
  path: p, previousSha256: previous,
  currentSha256: fs.existsSync(path.join(root, p)) ? sha256(path.join(root, p)) : null,
  unchanged: fs.existsSync(path.join(root, p)) && sha256(path.join(root, p)) === previous
}));
write('previous-source-comparison.json', { same: comparison.filter(x => x.unchanged).length, changed: comparison.filter(x => !x.unchanged).length, files: comparison });

async function probes() {
  const Collector = require(path.join(root, 'performance-tests/lib/metricsCollector'));
  const peak = require(path.join(root, 'performance-tests/scenarios/12_peak_load'));
  const soak = require(path.join(root, 'performance-tests/scenarios/13_soak_test'));
  const pacs = require(path.join(root, 'performance-tests/scenarios/07_pacs_imaging'));
  const thresholds = { apiRead: { p95: 500, p99: 1500 }, apiWriteAndSearch: { p95: 1000, p99: 2500 }, diagnosticImageFirstLoad: { p95: 5000 }, maxErrorRatePercent: 1 };
  const run = async (scenario, responseData) => {
    const collector = new Collector(thresholds); collector.start();
    const requests = [];
    const client = {
      get: async endpoint => { requests.push({ method: 'GET', endpoint }); return { data: responseData, status: 200, ok: true, duration: 1 }; },
      put: async (endpoint, body) => { requests.push({ method: 'PUT', endpoint, body }); return { data: {}, status: 200, ok: true, duration: 1 }; }
    };
    await scenario({ vuId: 3, userPool: { createAuthenticatedClient: async () => client }, metricsCollector: collector });
    collector.stop(); return { requests, summary: collector.getSummary() };
  };
  const result = {
    evidenceType: 'Offline mocked probes of harness behavior; no server performance measurements',
    peakEmptyWorklist: await run(peak, []),
    peakUnsupportedObjectShape: await run(peak, { items: [{ exam_id: 'synthetic-ready', report_status: 'Draft' }], summary: { total: 1 }, limit: 20, offset: 0 }),
    peakCurrentApiDraftArray: await run(peak, [{ exam_id: 'synthetic-ready', report_status: 'Draft' }]),
    peakFinalizedWorklist: await run(peak, [{ exam_id: 'synthetic-finalized', report_status: 'Finalized' }]),
    soakEmptyWorklist: await run(soak, []),
    soakUnsupportedObjectShape: await run(soak, { items: [{ exam_id: 'synthetic-ready', report_status: 'Draft' }], summary: { total: 1 }, limit: 20, offset: 0 }),
    soakCurrentApiDraftArray: await run(soak, [{ exam_id: 'synthetic-ready', report_status: 'Draft' }]),
    pacsMetadataOnly: await run(pacs, [])
  };
  write('performance-offline-probes.json', result);
  console.log(JSON.stringify({ filesHashed: sourcePaths.length, previousManifest: { same: comparison.filter(x => x.unchanged).length, changed: comparison.filter(x => !x.unchanged).map(x => x.path) }, probes: Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'evidenceType').map(([key, value]) => [key, { requestCount: value.requests.length, writeCount: value.requests.filter(r => r.method === 'PUT').length, thresholdStatus: value.summary.thresholdStatus, body: value.requests.find(r => r.method === 'PUT')?.body }])) }, null, 2));
}
probes().catch(error => { console.error(error.message); process.exitCode = 1; });
