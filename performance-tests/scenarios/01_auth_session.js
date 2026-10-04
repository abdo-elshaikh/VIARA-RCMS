/**
 * Scenario 01: Authentication, Session Persistence, CSRF & Token Refresh
 * Tests PF-01 & Journey 1 (Staff Login -> Session Verification -> Token Refresh -> Logout)
 */

const ApiClient = require('../lib/apiClient');

async function runAuthSessionScenario({ vuId, userPool, metricsCollector }) {
    const config = userPool.config;
    const client = new ApiClient(config.baseUrl, config.timeoutMs);
    const scenario = '01_auth_session';

    // 1. Fetch CSRF Token
    let res = await client.get('/api/csrf-token');
    metricsCollector.record({
        scenario,
        action: 'CSRF Token Bootstrap',
        method: 'GET',
        endpoint: '/api/csrf-token',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 2. User Login (Staff Distributed by VU)
    const staffUsers = [
        { email: 'reception@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'cashier@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'sara.tech@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'dina.nurse@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'accountant@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'insurance@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'hr@VIARA.com', password: 'ViaraAdmin@2026' },
        { email: 'developer@VIARA.com', password: 'ViaraAdmin@2026' }
    ];
    const user = staffUsers[vuId % staffUsers.length];
    res = await client.post('/api/auth/login', {
        email: user.email,
        password: user.password
    });
    metricsCollector.record({
        scenario,
        action: 'Staff Login',
        method: 'POST',
        endpoint: '/api/auth/login',
        duration: res.duration,
        status: res.status,
        ok: res.ok && Boolean(res.data?.token),
        error: res.error
    });

    if (!res.ok || !res.data?.token) {
        return;
    }

    const token = res.data.token;
    client.setToken(token);

    // 3. Get User Profile (Protected Read)
    res = await client.get('/api/profile');
    metricsCollector.record({
        scenario,
        action: 'Get User Profile',
        method: 'GET',
        endpoint: '/api/profile',
        duration: res.duration,
        status: res.status,
        ok: res.ok && Boolean(res.data?.user_id || res.data?.email),
        error: res.error
    });

    // 4. Token Refresh
    res = await client.post('/api/auth/refresh', {});
    metricsCollector.record({
        scenario,
        action: 'Refresh Access Token',
        method: 'POST',
        endpoint: '/api/auth/refresh',
        duration: res.duration,
        status: res.status,
        ok: res.ok && Boolean(res.data?.token),
        error: res.error
    });

    if (res.data?.token) {
        client.setToken(res.data.token);
    }

    // 5. Query Active Sessions
    res = await client.get('/api/auth/sessions');
    metricsCollector.record({
        scenario,
        action: 'List Active Sessions',
        method: 'GET',
        endpoint: '/api/auth/sessions',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

    // 6. User Logout
    res = await client.post('/api/auth/logout', {});
    metricsCollector.record({
        scenario,
        action: 'Staff Logout',
        method: 'POST',
        endpoint: '/api/auth/logout',
        duration: res.duration,
        status: res.status,
        ok: res.ok,
        error: res.error
    });

}

module.exports = runAuthSessionScenario;
