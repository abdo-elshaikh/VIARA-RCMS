const fs = require('node:fs');
const path = require('node:path');
const routes = ['/health/ready', '/api/settings/public/home', '/api/public/landing-overview'];
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
async function main() {
    const results = [];
    for (const route of routes) {
        const measurements = [];
        for (let i = 0; i < 20; i++) {
            const start = performance.now();
            const response = await fetch(`http://127.0.0.1:${process.env.VIARA_REVIEW_PORT || 3000}${route}`, { signal: AbortSignal.timeout(5000) });
            const body = await response.arrayBuffer();
            measurements.push({ ms: performance.now() - start, status: response.status, bytes: body.byteLength });
        }
        const sorted = measurements.map(m => m.ms).sort((a, b) => a - b);
        results.push({ route, requests: 20, successes: measurements.filter(m => m.status === 200).length, p50Ms: quantile(sorted, .5), p95Ms: quantile(sorted, .95), p99Ms: quantile(sorted, .99), bytes: measurements.at(-1).bytes });
    }
    const report = { port: process.env.VIARA_REVIEW_PORT || 3000, scope: 'Read-only public endpoint loopback baseline, 20 sequential calls per endpoint. Not a production load test or clinical-workflow SLA.', results };
    fs.writeFileSync(path.join(__dirname, 'public-latency.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
