/**
 * Scenario 12: Peak Load — Realistic Clinical Workflow (H-04)
 *
 * Target load profile (controlled via CLI):
 *   Ramp-up  : --users=50 started over 30 s (launch staggered workers)
 *   Sustained: --users=50 --duration=300 (5 minutes)
 *   Ramp-down: framework winds down naturally when duration elapses
 *
 * Run command:
 *   node performance-tests/run.js --scenario=12 --users=50 --duration=360
 *   (360 s = 30 s ramp-up buffer + 300 s sustained + 30 s ramp-down buffer)
 *
 * Clinical workflow covered (Journey 1 → 3 → 4):
 *   1. Authenticate (receptionist or radiologist, distributed by VU)
 *   2. Patient search (receptionist path)
 *   3. Exam worklist lookup (radiologist path)
 *   4. Report read / draft save
 *
 * Acceptance thresholds (from config.js):
 *   - Error rate < 1%
 *   - GET p95 ≤ 500 ms
 *   - Write p95 ≤ 1000 ms
 *   - p99 ≤ 1500 ms
 */

async function runPeakLoadScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '12_peak_load';

    // Distribute VUs across roles matching Section 4 workload distribution:
    // slots 0–2 (30%) → Receptionist, slots 3–4 (20%) → Radiologist,
    // slot 5 (10%) → Cashier, slots 6–9 (40%) → blended read ops
    const slot = vuId % 10;

    if (slot <= 2) {
        // ── Receptionist path: patient search → appointment check ───────────
        const client = await userPool.createAuthenticatedClient('receptionist');

        const searchTerms = ['Ahmed', 'Sara', 'Mohamed', 'Fatma', 'Nour', 'Ali', 'Rana', 'MRN-000001'];
        const query = searchTerms[vuId % searchTerms.length];

        // 1. Patient search
        let res = await client.get(`/api/patients?search=${encodeURIComponent(query)}&limit=10`);
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Patient Search',
            method: 'GET',
            endpoint: '/api/patients?search',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 2. Exam worklist (receptionist can view pending exams)
        res = await client.get('/api/queue');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Patient Queue',
            method: 'GET',
            endpoint: '/api/queue',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 3. Reception current shift
        res = await client.get('/api/reception/shifts/current');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Reception Shift',
            method: 'GET',
            endpoint: '/api/reception/shifts/current',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

    } else if (slot <= 4) {
        // ── Radiologist path: worklist → exam detail → report read/draft ────
        const client = await userPool.createAuthenticatedClient('radiologist');

        // 1. Exam worklist
        let res = await client.get('/api/exams/worklist?scope=mine&limit=20');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Clinical Worklist',
            method: 'GET',
            endpoint: '/api/exams/worklist',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        const exams = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const exam = exams.length > 0 ? exams[vuId % exams.length] : null;

        if (exam?.exam_id) {
            // 2. Exam detail
            res = await client.get(`/api/exams/${exam.exam_id}`);
            metricsCollector.record({
                scenario,
                action: 'Peak Load — Exam Detail',
                method: 'GET',
                endpoint: '/api/exams/:id',
                duration: res.duration,
                status: res.status,
                ok: res.ok,
                error: res.error
            });

            // 3. Save report draft (write path — measured separately for p95 write threshold)
            res = await client.put(`/api/exams/${exam.exam_id}/report`, {
                reportContent: `Peak load draft by VU-${vuId} at ${new Date().toISOString()}`,
                findings: `Peak load findings by VU-${vuId}`,
                impression: 'Unremarkable examination. Normal study findings.',
                reportStatus: exam.report_status || 'Draft',
                status: 'Reporting'
            });
            metricsCollector.record({
                scenario,
                action: 'Peak Load — Save Report Draft',
                method: 'PUT',
                endpoint: '/api/exams/:id/report',
                duration: res.duration,
                status: res.status,
                ok: res.ok,
                error: res.error
            });
        }

        // 4. Clinical queue overview
        res = await client.get('/api/queue');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Clinical Queue',
            method: 'GET',
            endpoint: '/api/queue',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

    } else if (slot === 5) {
        // ── Cashier path: invoice lookup ─────────────────────────────────────
        const client = await userPool.createAuthenticatedClient('cashier');

        let res = await client.get('/api/invoices?limit=10');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Invoice List',
            method: 'GET',
            endpoint: '/api/invoices',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        res = await client.get('/api/cashier/shifts/current');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Cashier Shift',
            method: 'GET',
            endpoint: '/api/cashier/shifts/current',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

    } else {
        // ── Mixed read path: shared reference data (rooms, exam types, health) ─
        const client = await userPool.createAuthenticatedClient('receptionist');

        let res = await client.get('/api/rooms/matrix');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Room Matrix',
            method: 'GET',
            endpoint: '/api/rooms/matrix',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        res = await client.get('/api/exam-types?limit=50');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Exam Types Catalog',
            method: 'GET',
            endpoint: '/api/exam-types',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        res = await client.get('/api/machines');
        metricsCollector.record({
            scenario,
            action: 'Peak Load — Modalities List',
            method: 'GET',
            endpoint: '/api/machines',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });
    }
}

module.exports = runPeakLoadScenario;
