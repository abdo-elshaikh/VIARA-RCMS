const MetricsCollector = require('../../performance-tests/lib/metricsCollector');

const thresholds = {
    apiRead: { p95: 500, p99: 1500 },
    apiWriteAndSearch: { p95: 1000, p99: 2500 },
    diagnosticImageFirstLoad: { p95: 5000 },
    maxErrorRatePercent: 1
};

const createCollector = () => {
    const collector = new MetricsCollector(thresholds);
    collector.start();
    return collector;
};

describe('performance threshold evaluation', () => {
    test('exactly one percent errors fails and browser samples do not dilute API error rate', () => {
        const collector = new MetricsCollector({ maxErrorRatePercent: 1 }); collector.start();
        for (let i = 0; i < 100; i++) collector.record({ method: 'GET', endpoint: '/api/test', duration: 5, status: i ? 200 : 500, ok: Boolean(i) });
        for (let i = 0; i < 20; i++) collector.record({ method: 'BROWSER', metric: 'diagnosticImageFirstLoad', duration: 100, status: 200, ok: true });
        expect(collector.getSummary()).toMatchObject({ totalRequests: 100, errorRatePercent: 1, thresholdStatus: 'FAIL' });
    });

    test('one server error fails normal workflow acceptance even below the error-rate ceiling', () => {
        const collector = new MetricsCollector({ maxErrorRatePercent: 1, maxServerErrors: 0 }); collector.start();
        for (let i = 0; i < 201; i++) collector.record({ method: 'GET', duration: 1, status: i ? 200 : 503, ok: Boolean(i) });
        expect(collector.getSummary()).toMatchObject({ thresholdStatus: 'FAIL', serverErrors: 1 });
    });

    test('a missing image observation or failed render cannot masquerade as a passing zero', () => {
        const collector = new MetricsCollector({ diagnosticImageFirstLoad: { p95: 5000 }, minDiagnosticImageSamples: 20 }); collector.start();
        expect(collector.getSummary().thresholdStatus).toBe('INCOMPLETE');
        collector.record({ method: 'BROWSER', metric: 'diagnosticImageFirstLoad', duration: 0, status: 0, ok: false });
        expect(collector.getSummary()).toMatchObject({ thresholdStatus: 'FAIL', diagnosticImageSamples: 0, diagnosticImageFailures: 1 });
    });

    test('preserves capture times and compares separate measured soak windows with backend memory', () => {
        const collector = new MetricsCollector({ stability: { minDurationSeconds: 1800, windowSeconds: 300, minSamples: 20, maxP95GrowthPercent: 20 } });
        collector.start(); const start = collector.startTime;
        for (let i = 0; i < 20; i++) {
            collector.record({ method: 'GET', duration: 100, status: 200, ok: true, timestamp: start + 60000 + i });
            collector.record({ method: 'GET', duration: 125, status: 200, ok: true, timestamp: start + 1600000 + i });
        }
        for (const offset of [60000, 90000, 1600000, 1630000]) collector.recordServerSample({ timestamp: start + offset, rssBytes: 1000, heapUsedBytes: 500 });
        collector.endTime = start + 1800000;
        expect(collector.getSummary()).toMatchObject({ thresholdStatus: 'FAIL', stability: { growthPercent: 25 } });
        collector.endTime = start + 60000;
        expect(collector.getSummary().thresholdStatus).toBe('INCOMPLETE');
    });

    test('uses nearest-rank p95 without shifting one observation higher', () => {
        const collector = new MetricsCollector({ apiRead: { p95: 19 } }); collector.start();
        for (let i = 1; i <= 20; i++) collector.record({ method: 'GET', duration: i, status: 200, ok: true });
        expect(collector.getSummary().thresholdStatus).toBe('PASS');
    });
    test('evaluates p95 and p99 for reads, writes, and diagnostic image first load', () => {
        const collector = createCollector();
        collector.record({ method: 'GET', endpoint: '/api/exams', duration: 200, status: 200, ok: true });
        collector.record({ method: 'POST', endpoint: '/api/reports', duration: 400, status: 201, ok: true });
        collector.record({
            method: 'GET',
            endpoint: '/dicom/first-frame',
            metric: 'diagnosticImageFirstLoad',
            duration: 1500,
            status: 200,
            ok: true
        });

        const summary = collector.getSummary();
        expect(summary.thresholdStatus).toBe('PASS');
        expect(summary.thresholdEvaluations).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Read API Latency (p99)', passed: true }),
            expect.objectContaining({ name: 'Write & Mutation Latency (p99)', passed: true }),
            expect.objectContaining({ name: 'Diagnostic Image First Load (p95)', passed: true })
        ]));
    });

    test('fails when a measured percentile exceeds its limit', () => {
        const collector = createCollector();
        collector.record({ method: 'GET', endpoint: '/api/exams', duration: 1600, status: 200, ok: true });
        collector.record({ method: 'POST', endpoint: '/api/reports', duration: 100, status: 201, ok: true });
        collector.record({
            method: 'GET',
            endpoint: '/dicom/first-frame',
            metric: 'diagnosticImageFirstLoad',
            duration: 1000,
            status: 200,
            ok: true
        });

        const summary = collector.getSummary();
        expect(summary.thresholdStatus).toBe('FAIL');
        expect(summary.thresholdEvaluations).toContainEqual(
            expect.objectContaining({ name: 'Read API Latency (p99)', passed: false })
        );
    });

    test('marks missing measurements incomplete instead of passing them', () => {
        const collector = createCollector();
        collector.record({ method: 'GET', endpoint: '/api/exams', duration: 200, status: 200, ok: true });

        const summary = collector.getSummary();
        expect(summary.thresholdStatus).toBe('INCOMPLETE');
        expect(summary.thresholdEvaluations).toContainEqual(
            expect.objectContaining({
                name: 'Write & Mutation Latency (p95)',
                actual: 'Not measured',
                passed: null
            })
        );
        expect(summary.thresholdEvaluations).toContainEqual(
            expect.objectContaining({
                name: 'Diagnostic Image First Load (p95)',
                actual: 'Not measured',
                passed: null
            })
        );
    });
});
