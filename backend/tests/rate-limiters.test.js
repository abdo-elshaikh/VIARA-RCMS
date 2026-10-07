const express = require('express');
const request = require('supertest');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const rateLimiters = require('../src/middleware/rateLimiters');
const legacyRateLimiter = require('../src/middleware/rateLimiter');

describe('Rate Limiters Middleware Suite', () => {
    describe('Export Integrity & Backwards Compatibility', () => {
        const expectedLimiters = [
            'authLimiter',
            'apiLimiter',
            'strictLimiter',
            'patientDataLimiter',
            'invoiceLimiter',
            'sensitiveOpLimiter',
            'integrationOpLimiter',
            'notificationLimiter',
            'publicCaseStatusLimiter',
            'publicBookingLimiter',
            'displayBoardLimiter',
            'pacsWebhookLimiter'
        ];

        test.each(expectedLimiters)('exports %s as an express middleware function', (limiterName) => {
            expect(rateLimiters[limiterName]).toBeDefined();
            expect(typeof rateLimiters[limiterName]).toBe('function');
        });

        test('exports authenticatedKey generator function', () => {
            expect(typeof rateLimiters.authenticatedKey).toBe('function');
        });

        test('legacy rateLimiter.js re-exports identical instances for backwards compatibility', () => {
            expect(legacyRateLimiter.authLimiter).toBe(rateLimiters.authLimiter);
            expect(legacyRateLimiter.apiLimiter).toBe(rateLimiters.apiLimiter);
            expect(legacyRateLimiter.strictLimiter).toBe(rateLimiters.strictLimiter);
        });
    });

    describe('authenticatedKey Generator', () => {
        const { authenticatedKey } = rateLimiters;

        test('returns user_id when req.user.user_id is present', () => {
            const req = {
                user: { user_id: 'usr-abc-123' },
                ip: '192.168.1.100'
            };
            expect(authenticatedKey(req)).toBe('user:staff:usr-abc-123');
        });

        test('returns userId when req.user.userId is present and user_id is absent', () => {
            const req = {
                user: { userId: 'usr-xyz-789' },
                ip: '192.168.1.100'
            };
            expect(authenticatedKey(req)).toBe('user:staff:usr-xyz-789');
        });

        test('prefers user_id over userId if both exist', () => {
            const req = {
                user: { user_id: 'primary-id', userId: 'secondary-id' },
                ip: '192.168.1.100'
            };
            expect(authenticatedKey(req)).toBe('user:staff:primary-id');
        });

        test('falls back to ipKeyGenerator(req.ip) when req.user is undefined', () => {
            const req = {
                ip: '127.0.0.1'
            };
            const expectedIpKey = ipKeyGenerator(req.ip);
            expect(authenticatedKey(req)).toBe(`ip:${expectedIpKey}`);
        });

        test('falls back to ipKeyGenerator(req.ip) when req.user contains no user ID', () => {
            const req = {
                user: { role: 'guest' },
                ip: '10.0.0.5'
            };
            const expectedIpKey = ipKeyGenerator(req.ip);
            expect(authenticatedKey(req)).toBe(`ip:${expectedIpKey}`);
        });
    });

    describe('HTTP 429 Enforcement & Isolation', () => {
        test('blocks requests and returns 429 when rate limit threshold is exceeded', async () => {
            const app = express();
            const testLimiter = rateLimit({
                windowMs: 60 * 1000,
                limit: 2,
                message: { error: 'Test quota exceeded' },
                standardHeaders: 'draft-7',
                legacyHeaders: false
            });

            app.get('/test-limit', testLimiter, (req, res) => {
                res.status(200).json({ ok: true });
            });

            // 1st request: OK
            const res1 = await request(app).get('/test-limit');
            expect(res1.status).toBe(200);
            expect(res1.body).toEqual({ ok: true });

            // 2nd request: OK
            const res2 = await request(app).get('/test-limit');
            expect(res2.status).toBe(200);

            // 3rd request: Exceeded limit -> 429
            const res3 = await request(app).get('/test-limit');
            expect(res3.status).toBe(429);
            expect(res3.body).toEqual({ error: 'Test quota exceeded' });
        });

        test('authenticatedKey isolates different users sharing the same client IP', async () => {
            const app = express();
            const isolatedLimiter = rateLimit({
                windowMs: 60 * 1000,
                limit: 1,
                keyGenerator: rateLimiters.authenticatedKey,
                message: { error: 'Per-user quota exceeded' },
                standardHeaders: 'draft-7',
                legacyHeaders: false
            });

            // Mock auth middleware to attach user from header
            app.use((req, res, next) => {
                const userId = req.headers['x-user-id'];
                if (userId) {
                    req.user = { user_id: userId };
                }
                next();
            });

            app.get('/user-resource', isolatedLimiter, (req, res) => {
                res.status(200).json({ user: req.user?.user_id });
            });

            // User A first request -> 200
            const resA1 = await request(app).get('/user-resource').set('x-user-id', 'user-A');
            expect(resA1.status).toBe(200);

            // User A second request -> 429
            const resA2 = await request(app).get('/user-resource').set('x-user-id', 'user-A');
            expect(resA2.status).toBe(429);
            expect(resA2.body).toEqual({ error: 'Per-user quota exceeded' });

            // User B from same IP -> 200 (not locked out by User A)
            const resB1 = await request(app).get('/user-resource').set('x-user-id', 'user-B');
            expect(resB1.status).toBe(200);
            expect(resB1.body).toEqual({ user: 'user-B' });
        });
    });
});
