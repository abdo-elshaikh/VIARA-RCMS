'use strict';

/**
 * quotaService.test.js
 * --------------------
 * Unit tests for the VIARA trial usage quota service.
 *
 * Tests cover:
 *  - assertQuota() passes when under limit
 *  - assertQuota() throws 402 when at/over limit
 *  - Non-trial editions are skipped (no DB call)
 *  - quotaMiddleware() calls next() on pass, next(err) on fail
 *  - getQuotaStats() returns correct structure
 *  - Unknown quota name is silently ignored
 */

'use strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock pool that returns a fixed count */
function mockPool(count) {
    return {
        query: jest.fn().mockResolvedValue({ rows: [{ n: String(count) }] }),
    };
}

/** Build a mock pool that throws */
function failPool(msg = 'DB error') {
    return {
        query: jest.fn().mockRejectedValue(new Error(msg)),
    };
}

// ── Setup ────────────────────────────────────────────────────────────────────

// Mock licenseService so we control the edition without real keys
jest.mock('../../src/services/licenseService', () => ({
    getLicense: jest.fn(),
}));

const { getLicense } = require('../../src/services/licenseService');
const { assertQuota, quotaMiddleware, getQuotaStats } = require('../../src/services/quotaService');

// Helper to configure getLicense return value
function setLicense(edition = 'trial', maxUsers = 3) {
    getLicense.mockReturnValue({ edition, maxUsers });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('quotaService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── assertQuota() ─────────────────────────────────────────────────────────

    describe('assertQuota()', () => {

        it('resolves without error when patients count is under limit', async () => {
            setLicense('trial');
            const pool = mockPool(25); // 25 < 50 limit
            await expect(assertQuota(pool, 'patients')).resolves.toBeUndefined();
        });

        it('throws AppError 402 when patients count equals the limit', async () => {
            setLicense('trial');
            const pool = mockPool(50); // exactly at limit
            await expect(assertQuota(pool, 'patients')).rejects.toMatchObject({
                statusCode: 402,
            });
        });

        it('throws AppError 402 when patients count exceeds the limit', async () => {
            setLicense('trial');
            const pool = mockPool(99); // over limit
            await expect(assertQuota(pool, 'patients')).rejects.toMatchObject({
                statusCode: 402,
            });
        });

        it('resolves for appointments under 100/month', async () => {
            setLicense('trial');
            const pool = mockPool(50);
            await expect(assertQuota(pool, 'appointments')).resolves.toBeUndefined();
        });

        it('throws for appointments at 100/month', async () => {
            setLicense('trial');
            const pool = mockPool(100);
            await expect(assertQuota(pool, 'appointments')).rejects.toMatchObject({ statusCode: 402 });
        });

        it('respects per-license maxUsers cap for users quota', async () => {
            setLicense('trial', 5); // license allows 5
            const pool = mockPool(4); // 4 < 5 → pass
            await expect(assertQuota(pool, 'users')).resolves.toBeUndefined();
        });

        it('blocks users at the per-license cap', async () => {
            setLicense('trial', 5);
            const pool = mockPool(5); // 5 >= 5 → block
            await expect(assertQuota(pool, 'users')).rejects.toMatchObject({ statusCode: 402 });
        });

        it('is a no-op for standard edition (does not query DB)', async () => {
            setLicense('standard');
            const pool = mockPool(9999);
            await expect(assertQuota(pool, 'patients')).resolves.toBeUndefined();
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('is a no-op for enterprise edition', async () => {
            setLicense('enterprise');
            const pool = mockPool(9999);
            await expect(assertQuota(pool, 'appointments')).resolves.toBeUndefined();
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('is a no-op for developer edition', async () => {
            setLicense('developer');
            const pool = mockPool(9999);
            await expect(assertQuota(pool, 'patients')).resolves.toBeUndefined();
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('silently ignores unknown quota names', async () => {
            setLicense('trial');
            const pool = mockPool(1);
            await expect(assertQuota(pool, 'unknown_quota')).resolves.toBeUndefined();
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('blocks creation when quota verification is unavailable', async () => {
            setLicense('trial');
            const pool = failPool('Connection refused');
            await expect(assertQuota(pool, 'patients')).rejects.toMatchObject({ statusCode: 503 });
        });
    });

    // ── quotaMiddleware() ─────────────────────────────────────────────────────

    describe('transactional quota checks', () => {
        it('commits creation on the same client and releases it', async () => {
            setLicense('trial');
            const client = { ...mockPool(0), release: jest.fn() };
            const pool = { connect: jest.fn(async () => client) };
            const operation = jest.fn(async connection => {
                expect(connection).toBe(client);
                return 'created';
            });
            const { withQuotaTransaction } = require('../../src/services/quotaService');
            await expect(withQuotaTransaction(pool, 'patients', operation)).resolves.toBe('created');
            expect(client.query.mock.calls[0][0]).toBe('BEGIN');
            expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
            expect(client.release).toHaveBeenCalledTimes(1);
        });
        it('rolls back and never creates a record after the limit is reached', async () => {
            setLicense('trial');
            const client = { ...mockPool(50), release: jest.fn() };
            const operation = jest.fn();
            const { withQuotaTransaction } = require('../../src/services/quotaService');
            await expect(withQuotaTransaction({ connect: async () => client }, 'patients', operation))
                .rejects.toMatchObject({ statusCode: 402 });
            expect(operation).not.toHaveBeenCalled();
            expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
            expect(client.release).toHaveBeenCalledTimes(1);
        });
        it('locks the quota before counting on the supplied transaction client', async () => {
            setLicense('trial');
            const client = mockPool(2);
            await assertQuota(client, 'users', { transaction: true });
            expect(client.query.mock.calls[0]).toEqual([
                'SELECT pg_advisory_xact_lock($1, $2)', [867421, 2],
            ]);
            expect(client.query.mock.calls[1][0]).toContain('COUNT(*)');
        });
        it('rejects the operation when the transaction lock fails', async () => {
            setLicense('trial');
            await expect(assertQuota(failPool(), 'users', { transaction: true }))
                .rejects.toMatchObject({ statusCode: 503 });
        });
    });

    describe('quotaMiddleware()', () => {
        const mockReq = {};
        const mockRes = {};

        it('calls next() with no arguments when quota is not exceeded', async () => {
            setLicense('trial');
            const pool = mockPool(10);
            const next = jest.fn();

            await quotaMiddleware(pool, 'patients')(mockReq, mockRes, next);

            expect(next).toHaveBeenCalledWith(); // called with no args = success
        });

        it('calls next(err) when quota is exceeded', async () => {
            setLicense('trial');
            const pool = mockPool(50); // at limit
            const next = jest.fn();

            await quotaMiddleware(pool, 'patients')(mockReq, mockRes, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 402 }));
        });

        it('passes through for non-trial editions', async () => {
            setLicense('standard');
            const pool = mockPool(9999);
            const next = jest.fn();

            await quotaMiddleware(pool, 'patients')(mockReq, mockRes, next);

            expect(next).toHaveBeenCalledWith();
            expect(pool.query).not.toHaveBeenCalled();
        });
    });

    // ── getQuotaStats() ───────────────────────────────────────────────────────

    describe('getQuotaStats()', () => {
        it('returns empty object for non-trial editions', async () => {
            setLicense('standard');
            const pool = mockPool(0);
            const stats = await getQuotaStats(pool);
            expect(stats).toEqual({});
        });

        it('returns stats object with current, limit, percent for trial', async () => {
            setLicense('trial', 3);
            // Each query returns 10
            const pool = { query: jest.fn().mockResolvedValue({ rows: [{ n: '10' }] }) };

            const stats = await getQuotaStats(pool);

            expect(stats).toHaveProperty('patients');
            expect(stats.patients).toMatchObject({
                current:  10,
                limit:    expect.any(Number),
                percent:  expect.any(Number),
            });
            expect(stats).toHaveProperty('appointments');
            expect(stats).toHaveProperty('users');
            expect(stats).toHaveProperty('reports');
        });

        it('calculates percent correctly', async () => {
            setLicense('trial', 3);
            // Simulate 25 patients out of 50 limit
            const pool = { query: jest.fn().mockResolvedValue({ rows: [{ n: '25' }] }) };

            const stats = await getQuotaStats(pool);
            expect(stats.patients.percent).toBe(50); // 25/50 = 50%
        });
    });
});
