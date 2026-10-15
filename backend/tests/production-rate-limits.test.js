const express = require('express');
const request = require('supertest');

describe('Production quotas and facility NAT', () => {
    const original = { ...process.env };
    let limits;
    beforeEach(() => {
        jest.resetModules(); process.env.NODE_ENV = 'production'; process.env.PERF_TEST = 'true';
        delete process.env.REDIS_URL; delete process.env.RATE_LIMIT_STORE;
        limits = require('../src/middleware/rateLimiters');
    });
    afterEach(() => { process.env = { ...original }; });
    const appFor = (limiter, status = 200) => {
        const app = express(); app.set('trust proxy', 'loopback'); app.use(express.json());
        app.post('/', limiter, (req, res) => res.status(status).json({ ok: status === 200 })); return app;
    };
    test('normal successful login and polling requests do not consume the former tiny NAT quota', async () => {
        const app = appFor(limits.apiLimiter), login = appFor(limits.authLimiter);
        for (let i = 0; i < 110; i++) {
            expect((await request(app).post('/')).status).toBe(200);
            expect((await request(login).post('/')).status).toBe(200);
        }
    });
    test('PERF_TEST cannot disable production protection against repeated failures', async () => {
        const app = appFor(limits.authLimiter, 401);
        for (let i = 0; i < 100; i++) expect((await request(app).post('/')).status).toBe(401);
        expect((await request(app).post('/')).status).toBe(429);
    });
    test.each([['pacsWebhookLimiter', 60], ['displayBoardLimiter', 120]])('%s shares requests by IP, isolates other sources and groups IPv6 subnet addresses', async (name, cap) => {
        const app = appFor(limits[name]);
        for (let i = 0; i < cap; i++) expect((await request(app).post('/').set('X-Forwarded-For', '2001:db8:1234:5600::1')).status).toBe(200);
        expect((await request(app).post('/').set('X-Forwarded-For', '2001:db8:1234:5600::2')).status).toBe(429);
        expect((await request(app).post('/').set('X-Forwarded-For', '203.0.113.8')).status).toBe(200);
    });
    test('a targeted account cannot gain fresh failed-login quotas by rotating source addresses', async () => {
        const app = appFor(limits.authAccountLimiter, 401);
        for (let i = 0; i < 10; i++) expect((await request(app).post('/').set('X-Forwarded-For', `203.0.113.${i + 1}`).send({ email: 'target@example.test' })).status).toBe(401);
        expect((await request(app).post('/').set('X-Forwarded-For', '203.0.113.99').send({ email: 'TARGET@example.test' })).status).toBe(429);
        expect((await request(app).post('/').send({ email: 'other@example.test' })).status).toBe(401);
    });
    test('successful recovery responses are still throttled per account', async () => {
        const app = appFor(limits.passwordResetRequestLimiter);
        for (let i = 0; i < 5; i++) expect((await request(app).post('/').send({ email: 'target@example.test' })).status).toBe(200);
        expect((await request(app).post('/').send({ email: 'target@example.test' })).status).toBe(429);
    });
});
