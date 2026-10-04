/**
 * Scenario 03: Clinical Worklist & Diagnostic Reporting
 * Tests Journey 3 & 4 (Radiologist worklist lookup, report editing & saving)
 */

async function runClinicalReportingScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '03_clinical_reporting';
    const client = await userPool.createAuthenticatedClient('radiologist');

    // 1. Fetch Clinical Exams Worklist (assigned to logged-in radiologist)
    let res = await client.get('/api/exams/worklist?scope=mine&limit=20');
    metricsCollector.record({
        scenario,
        action: 'Query Clinical Worklist',
        method: 'GET',
        endpoint: '/api/exams/worklist',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    const exams = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    const exam = exams[vuId % (exams.length || 1)] || exams[0];

    if (exam && exam.exam_id) {
        // 2. Fetch Specific Exam Details
        res = await client.get(`/api/exams/${exam.exam_id}`);
        metricsCollector.record({
            scenario,
            action: 'Get Exam Details',
            method: 'GET',
            endpoint: '/api/exams/:id',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });

        // 3. Update Report Draft Findings
        res = await client.put(`/api/exams/${exam.exam_id}/report`, {
            reportContent: `Diagnostic findings recorded by VU-${vuId} at ${new Date().toISOString()}`,
            findings: `Diagnostic findings recorded by VU-${vuId} at ${new Date().toISOString()}`,
            impression: 'Unremarkable examination. Normal study findings.',
            reportStatus: exam.report_status || 'Draft',
            status: 'Reporting'
        });
        metricsCollector.record({
            scenario,
            action: 'Save Report Draft',
            method: 'PUT',
            endpoint: '/api/exams/:id/report',
            duration: res.duration,
            status: res.status,
            ok: res.ok,
            error: res.error
        });
    }

    // 4. Query Clinical Queue Status
    res = await client.get('/api/queue');
    metricsCollector.record({
        scenario,
        action: 'Query Clinical Queue',
        method: 'GET',
        endpoint: '/api/queue',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 5. Query Examination Types Catalog
    res = await client.get('/api/exam-types?limit=50');
    metricsCollector.record({
        scenario,
        action: 'List Examination Types',
        method: 'GET',
        endpoint: '/api/exam-types',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });
}

module.exports = runClinicalReportingScenario;
