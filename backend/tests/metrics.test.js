/**
 * Contract tests for the central Prometheus metrics module.
 * Guards against the defects the 2026-09-12 audit found in the previous
 * hand-rolled exporter: unbounded label cardinality, invalid histogram
 * exposition, and missing backup/pool metrics.
 */
const {
    register,
    metricsMiddleware,
    normalizeRoute,
    recordBackupSuccess,
    recordBackupFailure,
} = require('../src/config/metrics');

const exposition = () => register.metrics();

/** Drive one fake request through the middleware to observe real metrics. */
const simulateRequest = ({ method = 'GET', path = '/test', status = 200 }) => new Promise((resolve) => {
    const req = { method, path };
    const res = {
        statusCode: status,
        writableFinished: false,
        on(event, handler) {
            if (event === 'finish' || event === 'close') {
                setImmediate(() => {
                    res.writableFinished = event === 'finish';
                    handler();
                    if (event === 'finish') resolve();
                });
            }
        },
    };
    metricsMiddleware(req, res, () => {});
});

describe('config/metrics', () => {
    describe('normalizeRoute', () => {
        it('collapses UUIDs into a bounded label', () => {
            const a = normalizeRoute('/api/patients/3f2504e0-4f89-11d3-9a0c-0305e82c3301/documents');
            const b = normalizeRoute('/api/patients/11111111-2222-3333-4444-555555555555/documents');
            expect(a).toBe('/api/patients/:id/documents');
            expect(b).toBe(a);
        });

        it('collapses long numeric ids', () => {
            expect(normalizeRoute('/api/invoices/1784761793561'))
                .toBe('/api/invoices/:num');
            expect(normalizeRoute('/api/invoices/42')).toBe('/api/invoices/42');
        });

        it('caps pathological path lengths', () => {
            const long = normalizeRoute(`/${'a'.repeat(400)}`);
            expect(long.length).toBeLessThanOrEqual(120);
        });

        it('never returns undefined for garbage input', () => {
            expect(normalizeRoute(undefined)).toBe('/unknown');
        });
    });

    describe('http metrics exposition', () => {
        it('exposes a real histogram with buckets after traffic', async () => {
            await simulateRequest({ method: 'GET', path: '/api/patients/3f2504e0-4f89-11d3-9a0c-0305e82c3301', status: 200 });
            const text = await exposition();
            expect(text).toMatch(/VIARA_http_request_duration_seconds_bucket\{le="/);
            expect(text).toMatch(/VIARA_http_request_duration_seconds_sum\{/);
        });

        it('labels requests with method, normalized route, and status', async () => {
            await simulateRequest({ method: 'POST', path: '/api/invoices/1784761793561/payments', status: 500 });
            const text = await exposition();
            expect(text).toMatch(/VIARA_http_requests_total\{method="POST",route="\/api\/invoices\/:num\/payments",status="500"\}/);
        });

        it('keeps cardinality bounded across distinct patient ids', async () => {
            await simulateRequest({ path: '/api/patients/11111111-1111-1111-1111-111111111111' });
            await simulateRequest({ path: '/api/patients/22222222-2222-2222-2222-222222222222' });
            const text = await exposition();
            const distinctRoutes = new Set(
                [...text.matchAll(/route="([^"]+)"/g)].map((m) => m[1])
            );
            expect(distinctRoutes.has('/api/patients/:id')).toBe(true);
            expect([...distinctRoutes].filter((r) => r.startsWith('/api/patients/')).length).toBe(1);
        });
    });

    describe('backup and pool gauges the alert rules depend on', () => {
        it('exposes VIARA_db_backup_completed and size', async () => {
            const text = await exposition();
            expect(text).toContain('# HELP VIARA_db_backup_completed');
            expect(text).toContain('# HELP VIARA_db_backup_size_bytes');
            expect(text).toContain('# HELP VIARA_db_backup_failures_total');
        });

        it('exposes pg pool gauges', async () => {
            const text = await exposition();
            expect(text).toContain('# HELP VIARA_db_pool_connections');
            expect(text).toContain('# HELP VIARA_db_pool_idle_connections');
            expect(text).toContain('# HELP VIARA_db_pool_waiting_clients');
        });

        it('recordBackupSuccess stamps freshness (unix seconds) and size', async () => {
            const before = Date.now() / 1000;
            recordBackupSuccess({ sizeBytes: 4096 });
            const text = await exposition();
            expect(text).toContain('VIARA_db_backup_completed');
            const match = text.match(/VIARA_db_backup_completed (\d+(?:\.\d+)?)/);
            expect(match).not.toBeNull();
            expect(Number(match[1])).toBeGreaterThanOrEqual(before);
            expect(text).toContain('VIARA_db_backup_size_bytes 4096');
        });

        it('recordBackupFailure increments the failure counter', async () => {
            const read = async () => {
                const text = await exposition();
                const match = text.match(/VIARA_db_backup_failures_total (\d+(?:\.\d+)?)/);
                return match ? Number(match[1]) : 0;
            };
            const before = await read();
            recordBackupFailure();
            expect(await read()).toBeGreaterThan(before);
        });
    });

    describe('process metrics', () => {
        it('includes default Node.js runtime metrics under the VIARA_ prefix', async () => {
            const text = await exposition();
            expect(text).toContain('VIARA_process_cpu_seconds_total');
            expect(text).toContain('VIARA_nodejs_eventloop_lag_seconds');
        });
    });
});
