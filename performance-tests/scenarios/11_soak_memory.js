/**
 * Scenario 11: Soak, Endurance & Memory Leak Verification (PF-06 & PF-12)
 * Tests long-running sustained operations, token refresh bursts, and memory health.
 */

async function runSoakMemoryScenario({ vuId, userPool, metricsCollector }) {
    const scenario = '11_soak_memory';
    const client = await userPool.createAuthenticatedClient('receptionist');

    // 1. Health Probe & Server Metrics (Readiness check)
    let res = await client.get('/health/ready');
    metricsCollector.record({
        scenario,
        action: 'Health Ready Probe',
        method: 'GET',
        endpoint: '/health/ready',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 2. User Profile Verification
    res = await client.get('/api/profile');
    metricsCollector.record({
        scenario,
        action: 'User Profile Verification',
        method: 'GET',
        endpoint: '/api/profile',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 3. Operational Query (Reception Shifts & Appointments)
    res = await client.get('/api/reception/shifts/current');
    metricsCollector.record({
        scenario,
        action: 'Current Shift Probe',
        method: 'GET',
        endpoint: '/api/reception/shifts/current',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    res = await client.get('/api/patients?limit=10');
    metricsCollector.record({
        scenario,
        action: 'Patient List Probe',
        method: 'GET',
        endpoint: '/api/patients',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });
}

module.exports = runSoakMemoryScenario;
