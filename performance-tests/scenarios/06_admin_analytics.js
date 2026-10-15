/**
 * Scenario 06: Administration, Executive Dashboard & Analytics
 * Tests Journey 8 & PF-07 (Heavy aggregations, audit logs, and operational metrics)
 */

async function runAdminAnalyticsScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '06_admin_analytics';
    const client = await userPool.createAuthenticatedClient('admin');

    // 1. Executive Dashboard Aggregated Stats
    let res = await client.get('/api/dashboard/stats');
    metricsCollector.record({
        scenario,
        action: 'Executive Dashboard Stats',
        method: 'GET',
        endpoint: '/api/dashboard/stats',
        duration: res.duration,
        status: res.status,
        ok: res.ok && typeof res.data === 'object',
        error: res.error
    });

    // 2. Clinical Hierarchy Matrix (Rooms -> Machines -> Procedures)
    res = await client.get('/api/rooms/matrix');
    metricsCollector.record({
        scenario,
        action: 'Clinical Hierarchy Matrix',
        method: 'GET',
        endpoint: '/api/rooms/matrix',
        duration: res.duration,
        status: res.status,
        ok: res.ok && Boolean(res.data?.kpis),
        error: res.error
    });

    // 3. Security Audit Logs Query
    res = await client.get('/api/audit-logs?limit=25&page=1');
    metricsCollector.record({
        scenario,
        action: 'Security Audit Logs',
        method: 'GET',
        endpoint: '/api/audit-logs',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 4. Clinical Safety & Center Settings
    res = await client.get('/api/settings/center');
    metricsCollector.record({
        scenario,
        action: 'Center Settings Lookup',
        method: 'GET',
        endpoint: '/api/settings/center',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 5. System Health Check
    res = await client.get('/health/ready');
    metricsCollector.record({
        scenario,
        action: 'Health Readiness Probe',
        method: 'GET',
        endpoint: '/health/ready',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });
}

module.exports = runAdminAnalyticsScenario;
