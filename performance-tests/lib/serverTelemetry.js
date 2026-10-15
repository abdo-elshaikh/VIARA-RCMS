'use strict';

const numericMetric = (text, name) => {
    const line = text.split('\n').find(item => item.startsWith(name + ' '));
    const value = line ? Number(line.split(/\s+/)[1]) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : null;
};
async function collectServerTelemetry(config, collector, signal) {
    while (!signal.aborted) {
        try {
            const response = await fetch(new URL('/metrics', config.baseUrl), {
                headers: config.metricsToken ? { Authorization: 'Bearer ' + config.metricsToken } : {},
                signal: AbortSignal.any([signal, AbortSignal.timeout(5000)])
            });
            if (response.ok) {
                const text = await response.text();
                collector.recordServerSample({ timestamp: Date.now(),
                    rssBytes: numericMetric(text, 'VIARA_process_resident_memory_bytes'),
                    heapUsedBytes: numericMetric(text, 'VIARA_nodejs_heap_size_used_bytes'),
                    poolWaiters: numericMetric(text, 'VIARA_db_pool_waiting_clients') });
            }
        } catch { /* Missing telemetry stays unmeasured, never a passing zero. */ }
        if (signal.aborted) break;
        await new Promise(resolve => {
            const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
            const timer = setTimeout(done, 30000);
            signal.addEventListener('abort', done, { once: true });
            if (signal.aborted) done();
        });
    }
}
module.exports = { collectServerTelemetry, numericMetric };
