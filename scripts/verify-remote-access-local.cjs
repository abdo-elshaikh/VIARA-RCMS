'use strict';
// Isolated nginx integration test. No production data, Docker daemon or public listener.
// Usage: node scripts/verify-remote-access-local.cjs <nginx executable> <openssl executable>
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const nginx = path.resolve(process.argv[2] || 'nginx');
const openssl = process.argv[3] || 'openssl';
const temp = fs.mkdtempSync(path.join(root, 'scratch/remote-access-check-'));
const forward = p => p.replaceAll('\\', '/');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const command = (binary, args) => {
  const result = spawnSync(binary, args, { windowsHide: true, encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed: ${result.stderr || result.error}`);
  return result;
};
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const port = async () => { const server = http.createServer(); const p = await listen(server); await new Promise(r => server.close(r)); return p; };
let checks = 0;
let upstreamRequests = 0;
const backend = http.createServer((req, res) => {
  upstreamRequests++;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ upstream: true, method: req.method, url: req.url }));
});
const request = (p, endpoint, method = 'GET', tls = false, client = false) => new Promise((resolve, reject) => {
  const options = { hostname: '127.0.0.1', port: p, path: endpoint, method, agent: false };
  if (tls) {
    options.ca = fs.readFileSync(path.join(temp, 'server.crt'));
    if (client) {
      options.cert = fs.readFileSync(path.join(temp, 'client.crt'));
      options.key = fs.readFileSync(path.join(temp, 'client.key'));
    }
  }
  const req = (tls ? https : http).request(options, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.setTimeout(3000, () => req.destroy(new Error('Request timeout')));
  req.on('error', reject); req.end();
});

(async () => {
  const upstreamPort = await listen(backend);
  const ports = { portal: await port(), edge: await port(), clinical: await port(), redirect: await port() };
  const cert = name => forward(path.join(temp, name));
  command(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:TRUE',
    '-keyout', cert('server.key'), '-out', cert('server.crt')]);
  command(openssl, ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=synthetic-device', '-keyout', cert('client.key'), '-out', cert('client.csr')]);
  command(openssl, ['x509', '-req', '-in', cert('client.csr'), '-CA', cert('server.crt'), '-CAkey', cert('server.key'), '-set_serial', '2', '-days', '1', '-out', cert('client.crt')]);
  fs.mkdirSync(path.join(temp, 'logs'));
  fs.mkdirSync(path.join(temp, 'temp'));
  fs.mkdirSync(path.join(temp, 'html'));
  fs.writeFileSync(path.join(temp, 'html/index.html'), 'Synthetic portal');
  const map = read('portal/nginx/portal-api-policy.conf');
  let portal = read('portal/nginx.conf')
    .replace('include /etc/nginx/portal-api-policy.conf;', '')
    .replace('listen 80;', `listen 127.0.0.1:${ports.portal};`)
    .replace('/var/log/nginx/access.log', 'logs/portal-access.log')
    .replace('/usr/share/nginx/html', forward(path.join(temp, 'html')))
    .replace('backend:3000', `127.0.0.1:${upstreamPort}`);
  let edge = read('deploy/remote-access/nginx/portal-edge.conf')
    .replace('include /etc/nginx/portal-api-policy.conf;', '')
    .replace('127.0.0.1:5174', `127.0.0.1:${ports.portal}`)
    .replace('127.0.0.1:3000', `127.0.0.1:${upstreamPort}`)
    .replace('127.0.0.1:4433', `127.0.0.1:${ports.edge}`)
    .replace('/var/log/nginx/access.log', 'logs/edge-access.log')
    .replaceAll('/etc/nginx/certs/portal.example.org.fullchain.pem', cert('server.crt'))
    .replaceAll('/etc/nginx/certs/portal.example.org.key', cert('server.key'));
  let clinical = read('deploy/remote-access/nginx/clinical-edge.conf')
    .replace('10.20.0.1:80', `127.0.0.1:${ports.redirect}`)
    .replace('10.20.0.1:443', `127.0.0.1:${ports.clinical}`)
    .replaceAll('127.0.0.1:3000', `127.0.0.1:${upstreamPort}`)
    .replaceAll('127.0.0.1:3005', `127.0.0.1:${upstreamPort}`)
    .replaceAll('127.0.0.1:5173', `127.0.0.1:${upstreamPort}`)
    .replaceAll('/etc/nginx/certs/ris.example.org.fullchain.pem', cert('server.crt'))
    .replaceAll('/etc/nginx/certs/ris.example.org.key', cert('server.key'))
    .replaceAll('/etc/nginx/clinical-ca.crt', cert('server.crt'));
  fs.writeFileSync(path.join(temp, 'nginx.conf'), `worker_processes 1;\npid logs/nginx.pid;\nerror_log logs/error.log;\nevents { worker_connections 256; }\nhttp { access_log off;\n${map}\n${portal}\n${edge}\n${clinical}\n}\n`);
  const args = ['-p', forward(temp) + '/', '-c', 'nginx.conf'];
  command(nginx, [...args, '-t']);
  const child = spawn(nginx, [...args, '-g', 'daemon off;'], { cwd: temp, windowsHide: true, stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { if (await request(ports.portal, '/') === 200) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert(ready, 'nginx did not start');
    const allowed = [
      ['GET', '/api/csrf-token'], ['POST', '/api/portal/login'], ['POST', '/api/doctor-portal/login'],
      ['POST', '/api/portal/auth/refresh'], ['POST', '/api/portal/auth/logout'], ['POST', '/api/auth/logout'],
      ['POST', '/api/auth/change-password'], ['GET', '/api/profile'], ['GET', '/api/settings/public/home'],
      ['GET', '/api/settings/center'], ['GET', '/api/exam-types'], ['GET', '/api/portal/records?page=2'],
      ['GET', '/api/portal/documents/doc-1/download'], ['POST', '/api/portal/appointment-requests'],
      ['POST', '/api/portal/profile-update-requests'], ['POST', '/api/portal/messages'],
      ['PUT', '/api/portal/notifications/n-1/read'], ['PUT', '/api/doctor-portal/notifications/mark-all-read'],
      ['GET', '/api/doctor-portal/cases'], ['GET', '/api/doctor-portal/reports/exam-1/pdf'],
      ['POST', '/api/doctor-portal/orders'], ['GET', '/api/portal/invoices/inv-1/pdf'], ['GET', '/api/exams/exam-1/report/pdf?customize=false'],
      ['POST', '/api/realtime/session'], ['GET', '/api/realtime/stream'],
      ['POST', '/api/public/case-status/verify'], ['POST', '/api/public/appointment-requests'],
      ['GET', '/api/public/final-report/synthetic.token'], ['GET', '/api/public/reports/verify/abc123'],
      ['HEAD', '/api/portal/invoices/']
    ];
    const denied = ['/api/invoices/inv-1/pdf', '/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/patients', '/api/settings',
      '/api/settings/security', '/api/system/update', '/api/backups', '/api/portal/review-requests',
      '/api/portal/appointment-requests/r-1/review', '/api/portal/profile-update-requests/r-1/review',
      '/api/referring-doctors/d-1/set-portal-password', '/api/chat/users', '/api/pacs/dicom-web/studies',
      '/api/pacs/viewer-session', '/api/pacs/webhook', '/api/realtime/other', '/api/portal/records/extra',
      '/api/doctor-portal/cases/extra', '/api/profile/tokens', '/api/v1/patients', '/api/unknown'];
    for (const [p, tls] of [[ports.portal, false], [ports.edge, true]]) {
      for (const [method, endpoint] of allowed) {
        const before = upstreamRequests;
        assert.equal(await request(p, endpoint, method, tls), 200, `${method} ${endpoint}`);
        assert.equal(upstreamRequests, before + 1); checks++;
      }
      for (const endpoint of denied) for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const before = upstreamRequests;
        assert.equal(await request(p, endpoint, method, tls), 404, `${method} ${endpoint}`);
        assert.equal(upstreamRequests, before, 'denied request reached upstream'); checks++;
      }
      for (const [method, endpoint] of [['DELETE', '/api/portal/records'], ['POST', '/api/settings/center'],
        ['GET', '/api/realtime/session'], ['POST', '/api/portal/documents/doc-1/download'],
        ['PATCH', '/api/portal/notifications/n-1/read'], ['OPTIONS', '/api/portal/records']]) {
        assert.equal(await request(p, endpoint, method, tls), 404); checks++;
      }
      for (const endpoint of ['/pacs-viewer/', '/orthanc', '/metrics', '/admin']) {
        assert.equal(await request(p, endpoint, 'GET', tls), 404); checks++;
      }
    }
    assert.equal(await request(ports.clinical, '/', 'GET', true, true), 200); checks++;
    assert.equal(await request(ports.clinical, '/pacs-viewer/', 'GET', true, true), 200); checks++;
    const before = upstreamRequests;
    let rejected = false;
    try { rejected = [400, 403, 495, 496].includes(await request(ports.clinical, '/', 'GET', true)); }
    catch (e) { if (/certificate|alert|socket hang up/i.test(e.message)) rejected = true; else throw e; }
    assert(rejected, 'clinical gateway accepted a connection without a client certificate');
    assert.equal(upstreamRequests, before); checks++;
    for (const name of ['portal-access.log', 'edge-access.log']) {
      const log = fs.readFileSync(path.join(temp, 'logs', name), 'utf8');
      assert(log.includes('/api/public/final-report/[redacted]'), 'report route was not redacted');
      assert(!log.includes('synthetic.token'), 'report access token leaked to nginx logs');
      assert(!log.includes('customize=false'), 'query parameters leaked to nginx logs'); checks++;
    }
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
    const acceptance = args => new Promise((resolve, reject) => {
      const probe = spawn(bash, ['deploy/remote-access/scripts/verify-remote-access.sh', ...args], { cwd: root, windowsHide: true, env: { ...process.env, CURL_CA_BUNDLE: cert('server.crt') } });
      let output = '';
      probe.stdout.on('data', data => { output += data; });
      probe.stderr.on('data', data => { output += data; });
      probe.on('error', reject);
      probe.on('exit', code => resolve({ code, output }));
    });
    // The Windows Schannel curl build requires certificate-store provisioning;
    // do not weaken verification or import test certificates into the user's store.
    if (process.platform !== 'win32') {
      const passed = await acceptance([`127.0.0.1:${ports.clinical}`, `127.0.0.1:${ports.edge}`, cert('client.crt'), cert('client.key'), cert('server.crt')]);
      assert.equal(passed.code, 0, passed.output); checks++;
      const incomplete = await acceptance([`127.0.0.1:${ports.clinical}`, `127.0.0.1:${ports.edge}`, '', '', cert('server.crt')]);
      assert.notEqual(incomplete.code, 0);
      assert(incomplete.output.includes('clinical verification is incomplete')); checks++;
    }
    console.log(JSON.stringify({ checks, nginxConfig: 'valid', portal: 'allowed routes passed; staff routes blocked before upstream', clinical: 'mTLS enforced with verified server certificate', curlProbes: process.platform === 'win32' ? 'require target certificate-store/TLS-client setup; not run on Windows' : 'passed, including incomplete-probe rejection', artifacts: path.relative(root, temp) }, null, 2));
  } finally {
    spawnSync(nginx, [...args, '-s', 'quit'], { cwd: temp, windowsHide: true, timeout: 5000, stdio: 'ignore' });
    await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 1000))]);
    if (child.exitCode === null) child.kill();
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => backend.close());
