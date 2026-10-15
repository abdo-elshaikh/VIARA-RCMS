/**
 * Scenario 13: Soak Test — Long-Running Stability & Memory Leak Detection (H-04)
 *
 * Target load profile (controlled via CLI):
 *   Ramp-up  : --users=20 launched over ~1 minute (staggered by the harness)
 *   Sustained: --users=20 --duration=1800 (30 minutes)
 *   Ramp-down: framework winds down naturally when duration elapses
 *
 * Run command:
 *   node performance-tests/run.js --scenario=13 --users=20 --duration=1920
 *   (1920 s = 60 s ramp-up buffer + 1800 s sustained + 60 s ramp-down buffer)
 *
 * Clinical workflow covered (same as Scenario 12 to enable apples-to-apples comparison):
 *   1. Authentication (receptionist / radiologist, distributed by VU)
 *   2. Patient search or clinical worklist
 *   3. Exam detail or report read
 *   4. Lightweight reference-data reads (rooms, exam types)
 *
 * Memory leak detection strategy:
 *   - p95 must remain stable throughout the 30-minute window.
 *   - Compare p95 at 5-min mark vs 30-min mark in the generated Markdown report.
 *   - Growing p95 over time indicates connection-pool exhaustion or heap growth.
 *   - Zero 5xx errors expected — any 5xx signals resource saturation.
 *
 * Acceptance thresholds (from config.js):
 *   - Error rate < 1%
 *   - GET p95 ≤ 500 ms (must not creep upward over time)
 *   - Write p95 ≤ 1000 ms
 *   - p99 ≤ 1500 ms
 *   - No 5xx responses throughout the run
 */

async function runSoakTestScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '13_soak_test';

    // Same workload distribution as peak_load (12) so results are comparable
    const slot = vuId % 10;

    if (slot <= 2) {
        // ── Receptionist path ─────────────────────────────────────────────────
        const client = await userPool.createAuthenticatedClient('receptionist');

        const searchTerms = ['Ahmed', 'Sara', 'Mohamed', 'Fatma', 'Nour', 'Ali', 'Rana', 'MRN-000001'];
        const query = searchTerms[vuId % searchTerms.length];

        // 1. Patient search
        let res = await client.get(`/api/patients?search=${encodeURIComponent(query)}&limit=10`);
        metricsCollector.record({
            scenario,
            action: 'Soak — Patient Search',
            method: 'GET',
            endpoint: '/api/patients?search',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 2. Patient queue
        res = await client.get('/api/queue');
        metricsCollector.record({
            scenario,
            action: 'Soak — Patient Queue',
            method: 'GET',
            endpoint: '/api/queue',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 3. Daily appointments list (read-heavy)
        const today = new Date().toISOString().split('T')[0];
        res = await client.get(`/api/appointments?date=${today}&limit=25`);
        metricsCollector.record({
            scenario,
            action: 'Soak — Appointments Schedule',
            method: 'GET',
            endpoint: '/api/appointments?date',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 4. Reception shift status
        res = await client.get('/api/reception/shifts/current');
        metricsCollector.record({
            scenario,
            action: 'Soak — Reception Shift',
            method: 'GET',
            endpoint: '/api/reception/shifts/current',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

    } else if (slot <= 4) {
        // ── Radiologist path ──────────────────────────────────────────────────
        const client = await userPool.createAuthenticatedClient('radiologist');

        // 1. Clinical worklist
        let res = await client.get('/api/exams/worklist?scope=mine&limit=20');
        metricsCollector.record({
            scenario,
            action: 'Soak — Clinical Worklist',
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
            // 2. Exam details (read — dominant operation during soak)
            res = await client.get(`/api/exams/${exam.exam_id}`);
            metricsCollector.record({
                scenario,
                action: 'Soak — Exam Detail',
                method: 'GET',
                endpoint: '/api/exams/:id',
                duration: res.duration,
                status: res.status,
                ok: res.ok,
                error: res.error
            });

            // 3. Light write: draft report (keeps write-path warm without generating data bloat)
            res = await client.put(`/api/exams/${exam.exam_id}/report`, {
                reportContent: `Soak test draft by VU-${vuId} at ${new Date().toISOString()}`,
                findings: `Soak test findings — iteration ${Date.now()}`,
                impression: 'Unremarkable examination. Normal study findings.',
                reportStatus: exam.report_status || 'Draft',
                status: 'Reporting'
            });
            metricsCollector.record({
                scenario,
                action: 'Soak — Save Report Draft',
                method: 'PUT',
                endpoint: '/api/exams/:id/report',
                duration: res.duration,
                status: res.status,
                ok: res.ok,
                error: res.error
            });
        }

        // 4. Exam types — cheap catalog read, good memory-stability probe
        res = await client.get('/api/exam-types?limit=50');
        metricsCollector.record({
            scenario,
            action: 'Soak — Exam Types Catalog',
            method: 'GET',
            endpoint: '/api/exam-types',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

    } else if (slot === 5) {
        // ── Cashier path ──────────────────────────────────────────────────────
        const client = await userPool.createAuthenticatedClient('cashier');

        let res = await client.get('/api/invoices?limit=10');
        metricsCollector.record({
            scenario,
            action: 'Soak — Invoice List',
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
            action: 'Soak — Cashier Shift',
            method: 'GET',
            endpoint: '/api/cashier/shifts/current',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

    } else {
        // ── Shared reference-data / health probes ─────────────────────────────
        // These lightweight reads drive the largest request volume and are the
        // most sensitive indicators of connection-pool or heap exhaustion.
        const client = await userPool.createAuthenticatedClient('receptionist');

        let res = await client.get('/health/ready');
        metricsCollector.record({
            scenario,
            action: 'Soak — Health Ready Probe',
            method: 'GET',
            endpoint: '/health/ready',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        res = await client.get('/api/rooms/matrix');
        metricsCollector.record({
            scenario,
            action: 'Soak — Room Matrix',
            method: 'GET',
            endpoint: '/api/rooms/matrix',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        res = await client.get('/api/machines');
        metricsCollector.record({
            scenario,
            action: 'Soak — Modalities List',
            method: 'GET',
            endpoint: '/api/machines',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        res = await client.get('/api/profile');
        metricsCollector.record({
            scenario,
            action: 'Soak — User Profile',
            method: 'GET',
            endpoint: '/api/profile',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });
    }
}

module.exports = runSoakTestScenario;
