'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Each observation uses a clean browser profile. No patient identifiers,
// tokens, browser storage, or screenshots are written to the performance report.
async function captureFirstImage(config, userPool) {
    if (typeof WebSocket !== 'function') throw new Error('Browser observations require Node.js 22 or later');
    const viewer = new URL(config.viewer.url);
    if (!['http:', 'https:'].includes(viewer.protocol) || viewer.username || viewer.password) throw new Error('Invalid viewer origin');
    const candidates = [config.viewer.executable,
        path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
        '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
    let executable;
    for (const candidate of candidates) { try { await fs.access(candidate); executable = candidate; break; } catch {} }
    if (!executable) throw new Error('Set PERF_BROWSER_EXECUTABLE to an installed Chrome or Edge executable');
    const client = await userPool.createAuthenticatedClient('radiologist');
    const session = await client.post('/api/pacs/viewer-session', { studyInstanceUids: [config.viewer.studyUid] });
    if (!session.ok || !session.data?.viewerToken) throw new Error('Could not create a study-scoped synthetic viewer session');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'viara-performance-browser-'));
    let child, socket, launchError;
    const pending = new Map();
    try {
        child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
            '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--window-size=1440,1000',
            '--user-data-dir=' + directory, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
        child.on('error', error => { launchError = error; });
        let port;
        const deadline = Date.now() + 30000;
        while (!port && Date.now() < deadline) {
            if (launchError) throw launchError;
            try { port = Number((await fs.readFile(path.join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch {}
            if (!port) await sleep(100);
        }
        if (!port) throw new Error('Isolated browser did not become ready');
        const version = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(5000) }).then(res => res.json());
        socket = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        let nextId = 0;
        socket.addEventListener('message', event => {
            const message = JSON.parse(String(event.data));
            if (!pending.has(message.id)) return;
            const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer);
            if (message.error) entry.reject(new Error('Browser protocol request failed: ' + message.error.message));
            else entry.resolve(message.result);
        });
        const request = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser protocol request timed out')); }, 15000);
            pending.set(id, { resolve, reject, timer });
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        const target = await request('Target.createTarget', { url: 'about:blank' });
        const attached = await request('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        const send = (method, params) => request(method, params, attached.sessionId);
        await send('Page.enable'); await send('Network.enable');
        await send('Network.setCacheDisabled', { cacheDisabled: true });
        await send('Page.addScriptToEvaluateOnNewDocument', { source:
            'if(location.origin === ' + JSON.stringify(viewer.origin) + ') sessionStorage.setItem("VIARA_viewer_token", ' + JSON.stringify(session.data.viewerToken) + ');' });
        viewer.searchParams.set('StudyInstanceUIDs', config.viewer.studyUid);
        const navigation = await send('Page.navigate', { url: viewer.href });
        if (navigation.errorText) throw new Error('Viewer navigation failed');
        const renderDeadline = Date.now() + 45000;
        while (Date.now() < renderDeadline) {
            const observed = await send('Runtime.evaluate', { expression: 'window.__viaraFirstDiagnosticImage || null', returnByValue: true });
            const value = observed.result?.value;
            if (value?.source === 'cornerstone-visible-viewport-render' && Number.isFinite(value.durationMs) && value.durationMs > 0) return value.durationMs;
            await sleep(100);
        }
        throw new Error('No visible diagnostic viewport rendered within 45 seconds');
    } finally {
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Browser observation ended')); }
        socket?.close();
        if (child && child.exitCode === null && !child.killed) {
            const stopped = new Promise(resolve => child.once('exit', resolve));
            child.kill(); await Promise.race([stopped, sleep(2000)]);
        }
        // Delete only the newly created, task-owned temporary browser profile.
        if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('viara-performance-browser-')) {
            await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {});
        }
    }
}

async function collectFirstImages(config, userPool, collector, scenario, durationSeconds) {
    if (!config.viewer?.url || !config.viewer?.studyUid) return;
    const samples = Math.max(1, Math.min(100, Math.trunc(config.viewer.samples) || 20));
    const started = Date.now();
    for (let i = 0; i < samples; i++) {
        const due = started + i / samples * durationSeconds * 1000;
        if (due > Date.now()) await sleep(due - Date.now());
        try {
            const duration = await captureFirstImage(config, userPool);
            collector.record({ scenario, method: 'BROWSER', endpoint: '/pacs-viewer/first-image', metric: 'diagnosticImageFirstLoad', duration, status: 200, ok: true });
        } catch (error) {
            collector.record({ scenario, method: 'BROWSER', endpoint: '/pacs-viewer/first-image', metric: 'diagnosticImageFirstLoad', duration: 0, status: 0, ok: false, error: error.message });
            // Setup/render failure must not launch a sequence of unusable browsers.
            break;
        }
    }
}
module.exports = { captureFirstImage, collectFirstImages };
