/**
 * Generates terminal summaries, Markdown reports, and JSON artifacts for performance runs
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
    static printConsoleSummary(summary, title = 'VIARA Performance Test Results') {
        console.log('\n' + '='.repeat(80));
        console.log(` 📊 ${title}`);
        console.log('='.repeat(80));
        console.log(`⏱️  Duration: ${summary.durationSeconds}s | 🔄 Total Requests: ${summary.totalRequests} | 🚀 Throughput: ${summary.throughputRps} req/s`);
        console.log(`✅ Success: ${summary.successfulRequests} | ❌ Failed: ${summary.failedRequests} | ⚠️ Error Rate: ${summary.errorRatePercent}%`);
        
        console.log('\n--- ⏱️  Overall Latency (Response Times) ---');
        console.log(`   Min: ${summary.latency.min}ms | Avg: ${summary.latency.avg}ms | Median (p50): ${summary.latency.p50}ms`);
        console.log(`   p75: ${summary.latency.p75}ms | p90: ${summary.latency.p90}ms | p95: ${summary.latency.p95}ms | p99: ${summary.latency.p99}ms | Max: ${summary.latency.max}ms`);

        if (summary.thresholdEvaluations?.length > 0) {
            console.log('\n--- 🎯 SLA Thresholds Evaluation ---');
            for (const t of summary.thresholdEvaluations) {
                const mark = t.passed === null ? '⚠️ NOT MEASURED' : t.passed ? '✅ PASS' : '❌ FAIL';
                console.log(`   ${mark} [${t.name}]: Actual ${t.actual} (Target: ${t.target})`);
            }
        }
        if (summary.thresholdStatus) {
            console.log(`\nOverall threshold status: ${summary.thresholdStatus}`);
        }

        if (summary.endpoints?.length > 0) {
            console.log('\n--- 🔍 Top Endpoints by Latency (p95) ---');
            console.log('Method  | Endpoint                              | Count | p50 (ms) | p95 (ms) | p99 (ms) | Err %');
            console.log('-'.repeat(80));
            for (const ep of summary.endpoints.slice(0, 15)) {
                const m = ep.method.padEnd(7);
                const pathStr = (ep.endpoint.length > 35 ? ep.endpoint.slice(0, 32) + '...' : ep.endpoint).padEnd(37);
                const cnt = String(ep.totalRequests).padStart(5);
                const p50 = String(ep.p50).padStart(8);
                const p95 = String(ep.p95).padStart(8);
                const p99 = String(ep.p99).padStart(8);
                const err = (ep.errorRatePercent + '%').padStart(6);
                console.log(`${m} | ${pathStr} | ${cnt} | ${p50} | ${p95} | ${p99} | ${err}`);
            }
        }
        console.log('='.repeat(80) + '\n');
    }

    static saveMarkdownReport(summary, options = {}) {
        const title = options.title || 'VIARA Performance Test Execution Report';
        const scenarioName = options.scenarioName || 'Blended Workload';
        const vus = options.vus || 1;
        const outputDir = options.outputDir || path.resolve(__dirname, '../reports');

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `report_${scenarioName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timestamp}.md`;
        const filePath = path.join(outputDir, filename);

        const lines = [
            `# ${title}`,
            '',
            `- **Date:** ${new Date().toISOString()}`,
            `- **Scenario:** \`${scenarioName}\``,
            `- **Concurrent Users (VUs):** \`${vus}\``,
            `- **Test Duration:** \`${summary.durationSeconds}s\``,
            `- **Total Requests:** \`${summary.totalRequests}\``,
            `- **Throughput:** \`${summary.throughputRps} req/s\``,
            `- **Error Rate:** \`${summary.errorRatePercent}%\``,
            '',
            '## 1. ملخص النتائج ومؤشرات الأداء',
            '',
            '| المقياس | القيمة المسجلة | معيار القبول في الخطة | الحالة |',
            '|---|---|---|---|',
            `| معدل الأخطاء (Error Rate) | ${summary.errorRatePercent}% | < 1.0% | ${summary.errorRatePercent <= 1 ? '✅ ناجح' : '❌ تجاوز'} |`,
            `| وسيط زمن الاستجابة (p50) | ${summary.latency.p50} ms | - | ℹ️ مرجعي |`,
            `| المئين 95 لزمن الاستجابة (p95) | ${summary.latency.p95} ms | ≤ 500 ms (قراءة) / ≤ 1000 ms (كتابة) | ${summary.latency.p95 <= 1000 ? '✅ ضمن الحدود' : '⚠️ مرتفع'} |`,
            `| المئين 99 لزمن الاستجابة (p99) | ${summary.latency.p99} ms | ≤ 1500 ms | ${summary.latency.p99 <= 1500 ? '✅ ضمن الحدود' : '⚠️ استجابات استثنائية'} |`,
            `| أقصى زمن مسجل (Max Latency) | ${summary.latency.max} ms | - | ℹ️ ذروة الطلبات |`,
            `| الإنتاجية (Throughput) | ${summary.throughputRps} req/s | - | 🚀 إجمالي المعاملات |`,
            '',
            '## 2. تقييم معايير الخطة (SLA Thresholds)',
            '',
            summary.thresholdEvaluations?.length > 0
                ? summary.thresholdEvaluations.map(t => `- **${t.passed === null ? '⚠️ [NOT MEASURED]' : t.passed ? '✅ [PASS]' : '❌ [FAIL]'} ${t.name}:** Actual = \`${t.actual}\`, Target = \`${t.target}\``).join('\n')
                : '_لا توجد معايير مخصصة محددة لهذه الجولة._',
            '',
            `**Overall threshold status:** ${summary.thresholdStatus || 'NOT EVALUATED'}`,
            '',
            '## 3. تفاصيل أداء نقاط الاتصال البرمجية (Endpoints Breakdown)',
            '',
            '| الطريقة | المسار البرمجي | عدد الطلبات | p50 (ms) | p95 (ms) | p99 (ms) | معدل الخطأ |',
            '|---|---|---|---|---|---|---|'
        ];

        for (const ep of summary.endpoints) {
            lines.push(`| \`${ep.method}\` | \`${ep.endpoint}\` | ${ep.totalRequests} | ${ep.p50} | ${ep.p95} | ${ep.p99} | ${ep.errorRatePercent}% |`);
        }

        lines.push('');
        lines.push('---');
        lines.push(`_تم إنشاء هذا التقرير آلياً بواسطة منصة اختبارات أداء VIARA المتوافقة مع \`PERFORMANCE_TEST_PLAN.md\`._`);

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

        // Also save json artifact
        const jsonFilename = filename.replace(/\.md$/, '.json');
        fs.writeFileSync(path.join(outputDir, jsonFilename), JSON.stringify(summary, null, 2), 'utf8');

        return { markdownPath: filePath, jsonPath: path.join(outputDir, jsonFilename) };
    }
}

module.exports = ReportGenerator;
