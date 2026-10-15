import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * VIARA k6 Performance & Load Test Script
 * Implements Section 4 & 5 of PERFORMANCE_TEST_PLAN.md
 * Run with: k6 run performance-tests/k6/viara_load_test.js
 */

export const options = {
    scenarios: {
        daily_load: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '30s', target: 10 },  // Ramp to 10 VUs
                { duration: '1m', target: 25 },   // Ramp to 25 VUs
                { duration: '30s', target: 50 },  // Peak 50 VUs
                { duration: '30s', target: 0 },   // Ramp down
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],             // Error rate < 1%
        http_req_duration: ['p(95)<1000', 'p(99)<2500'], // 95% of requests under 1s
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    };

    // 1. Health check & landing
    let res = http.get(`${BASE_URL}/health/live`);
    check(res, {
        'health live is 200': (r) => r.status === 200,
    });

    res = http.get(`${BASE_URL}/api/public/landing-overview`);
    check(res, {
        'landing overview is 200': (r) => r.status === 200,
    });

    // 2. Staff Login (simulate receptionist)
    const loginPayload = JSON.stringify({
        email: 'reception@VIARA.com',
        password: 'ViaraAdmin@2026',
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, params);
    const loginOk = check(loginRes, {
        'login is 200': (r) => r.status === 200,
        'has token': (r) => JSON.parse(r.body).token !== undefined,
    });

    if (loginOk) {
        const token = JSON.parse(loginRes.body).token;
        const authParams = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };

        // 3. User Profile
        res = http.get(`${BASE_URL}/api/profile`, authParams);
        check(res, { 'profile is 200': (r) => r.status === 200 });

        // 4. Rooms list
        res = http.get(`${BASE_URL}/api/rooms`, authParams);
        check(res, { 'rooms is 200': (r) => r.status === 200 });

        // 5. Hierarchy Matrix
        res = http.get(`${BASE_URL}/api/rooms/matrix`, authParams);
        check(res, { 'matrix is 200': (r) => r.status === 200 });

        // 6. Current reception shift
        res = http.get(`${BASE_URL}/api/reception/shifts/current`, authParams);
        check(res, { 'shift is 200': (r) => r.status === 200 });
    }

    // Realistic user think time
    sleep(1 + Math.random() * 2);
}
