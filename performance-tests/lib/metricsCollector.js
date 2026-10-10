/**
 * Metrics Collector for high-precision latency profiling and SLA threshold verification
 */

class MetricsCollector {
    constructor(thresholds = {}) {
        this.thresholds = thresholds;
        this.startTime = null;
        this.endTime = null;
        this.records = [];
        this.endpointStats = new Map();
    }

    start() {
        this.startTime = Date.now();
        this.endTime = null;
        this.records = [];
        this.endpointStats.clear();
    }

    stop() {
        this.endTime = Date.now();
    }

    record({ scenario, action, method, endpoint, duration, status, ok, error, metric }) {
        const item = {
            scenario: scenario || 'default',
            action: action || `${method} ${endpoint}`,
            method: (method || 'GET').toUpperCase(),
            endpoint: endpoint || '/',
            metric: metric || null,
            duration: Number(duration) || 0,
            status: Number(status) || 0,
            ok: Boolean(ok),
            error: error || null,
            timestamp: Date.now()
        };

        this.records.push(item);

        const key = `${item.method} ${item.endpoint}`;
        if (!this.endpointStats.has(key)) {
            this.endpointStats.set(key, {
                method: item.method,
                endpoint: item.endpoint,
                action: item.action,
                durations: [],
                statuses: {},
                successCount: 0,
                failCount: 0
            });
        }

        const stat = this.endpointStats.get(key);
        stat.durations.push(item.duration);
        stat.statuses[item.status] = (stat.statuses[item.status] || 0) + 1;
        if (item.ok) {
            stat.successCount++;
        } else {
            stat.failCount++;
        }
    }

    _calculatePercentiles(sortedValues) {
        if (sortedValues.length === 0) {
            return { min: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
        }

        const count = sortedValues.length;
        const getP = (p) => {
            const index = Math.min(Math.floor((p / 100) * count), count - 1);
            return sortedValues[index];
        };

        const sum = sortedValues.reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / count) * 100) / 100;

        return {
            min: sortedValues[0],
            p50: getP(50),
            p75: getP(75),
            p90: getP(90),
            p95: getP(95),
            p99: getP(99),
            max: sortedValues[count - 1],
            avg
        };
    }

    getSummary() {
        const elapsedSeconds = Math.max(1, ((this.endTime || Date.now()) - (this.startTime || Date.now())) / 1000);
        const allDurations = this.records.map(r => r.duration).sort((a, b) => a - b);
        const overallLatency = this._calculatePercentiles(allDurations);

        const totalRequests = this.records.length;
        const successfulRequests = this.records.filter(r => r.ok).length;
        const failedRequests = totalRequests - successfulRequests;
        const errorRatePercent = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
        const throughputRps = Math.round((totalRequests / elapsedSeconds) * 100) / 100;

        // Endpoints breakdown
        const endpoints = [];
        for (const [key, stat] of this.endpointStats.entries()) {
            const sorted = stat.durations.slice().sort((a, b) => a - b);
            const stats = this._calculatePercentiles(sorted);
            const total = stat.durations.length;
            const errRate = total > 0 ? (stat.failCount / total) * 100 : 0;

            endpoints.push({
                key,
                method: stat.method,
                endpoint: stat.endpoint,
                action: stat.action,
                totalRequests: total,
                successCount: stat.successCount,
                failCount: stat.failCount,
                errorRatePercent: Math.round(errRate * 100) / 100,
                statuses: stat.statuses,
                ...stats
            });
        }

        // Sort endpoints by slowest p95 descending
        endpoints.sort((a, b) => b.p95 - a.p95);

        // Threshold checks
        const thresholdEvaluations = [];
        const evaluatePercentile = (name, durations, percentile, limit) => {
            if (limit === undefined) return;
            const stats = this._calculatePercentiles(durations);
            thresholdEvaluations.push({
                name,
                target: `<= ${limit}ms`,
                actual: durations.length ? `${stats[percentile].toFixed(1)}ms` : 'Not measured',
                passed: durations.length ? stats[percentile] <= limit : null
            });
        };

        if (this.thresholds.maxErrorRatePercent !== undefined) {
            thresholdEvaluations.push({
                name: 'Request Error Rate',
                target: `<= ${this.thresholds.maxErrorRatePercent}%`,
                actual: totalRequests ? `${errorRatePercent.toFixed(2)}%` : 'Not measured',
                passed: totalRequests ? errorRatePercent <= this.thresholds.maxErrorRatePercent : null
            });
        }

        const readDurations = this.records
            .filter(r => r.method === 'GET' && r.metric !== 'diagnosticImageFirstLoad')
            .map(r => r.duration)
            .sort((a, b) => a - b);
        const writeDurations = this.records
            .filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method))
            .map(r => r.duration)
            .sort((a, b) => a - b);
        const imageLoadDurations = this.records
            .filter(r => r.metric === 'diagnosticImageFirstLoad')
            .map(r => r.duration)
            .sort((a, b) => a - b);

        for (const percentile of ['p95', 'p99']) {
            evaluatePercentile(`Read API Latency (${percentile})`, readDurations, percentile, this.thresholds.apiRead?.[percentile]);
            evaluatePercentile(`Write & Mutation Latency (${percentile})`, writeDurations, percentile, this.thresholds.apiWriteAndSearch?.[percentile]);
        }
        evaluatePercentile(
            'Diagnostic Image First Load (p95)',
            imageLoadDurations,
            'p95',
            this.thresholds.diagnosticImageFirstLoad?.p95
        );

        const failedThresholds = thresholdEvaluations.filter(evaluation => evaluation.passed === false).length;
        const unmeasuredThresholds = thresholdEvaluations.filter(evaluation => evaluation.passed === null).length;
        const thresholdStatus = failedThresholds > 0
            ? 'FAIL'
            : unmeasuredThresholds > 0
                ? 'INCOMPLETE'
                : 'PASS';

        return {
            startTime: new Date(this.startTime).toISOString(),
            endTime: new Date(this.endTime || Date.now()).toISOString(),
            durationSeconds: Math.round(elapsedSeconds * 100) / 100,
            totalRequests,
            successfulRequests,
            failedRequests,
            errorRatePercent: Math.round(errorRatePercent * 100) / 100,
            throughputRps,
            latency: overallLatency,
            thresholdEvaluations,
            thresholdStatus,
            endpoints
        };
    }
}

module.exports = MetricsCollector;
