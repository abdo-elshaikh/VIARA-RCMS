const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { numericMetric } = require('../../performance-tests/lib/serverTelemetry');

test('OHIF exports only the first visible diagnostic render, not metadata, hidden canvases or thumbnails', () => {
    const listeners = new Map();
    const storage = { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() };
    const window = { location: { hash: '', search: '', pathname: '/pacs-viewer/viewer' }, addEventListener: jest.fn(), setInterval: jest.fn() };
    window.parent = window;
    const document = { visibilityState: 'visible', addEventListener: (event, callback) => listeners.set(event, callback) };
    const performance = { timeOrigin: 100000, now: () => 1234 };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../pacs/ohif/app-config.js'), 'utf8'), {
        window, document, localStorage: storage, sessionStorage: storage, URLSearchParams, performance,
        location: window.location, history: { replaceState: jest.fn() }
    });
    expect(window.__viaraFirstDiagnosticImage).toBeUndefined();
    const render = listeners.get('CORNERSTONE_IMAGE_RENDERED');
    render({ target: { querySelector: () => null } });
    const event = (width, viewportId = 'diagnostic-main') => ({ detail: { viewportId }, target: { querySelector: () => ({ getBoundingClientRect: () => ({ width, height: width }) }) } });
    render(event(512, 'thumbnail-1')); render(event(100));
    document.visibilityState = 'hidden'; render(event(512));
    expect(window.__viaraFirstDiagnosticImage).toBeUndefined();
    document.visibilityState = 'visible'; render(event(512));
    expect(window.__viaraFirstDiagnosticImage).toEqual({ durationMs: 1234, timeOrigin: 100000, source: 'cornerstone-visible-viewport-render' });
    performance.now = () => 9999; render(event(512));
    expect(window.__viaraFirstDiagnosticImage.durationMs).toBe(1234);
});

test('backend telemetry distinguishes absent or invalid samples from measured zero', () => {
    expect(numericMetric('VIARA_db_pool_waiting_clients 0\n', 'VIARA_db_pool_waiting_clients')).toBe(0);
    expect(numericMetric('# comment\nother 4\n', 'VIARA_process_resident_memory_bytes')).toBeNull();
    expect(numericMetric('VIARA_process_resident_memory_bytes NaN\n', 'VIARA_process_resident_memory_bytes')).toBeNull();
    expect(numericMetric('VIARA_process_resident_memory_bytes 1e6\n', 'VIARA_process_resident_memory_bytes')).toBe(1000000);
});
