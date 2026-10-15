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
