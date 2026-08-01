const {
    grantDeveloperPermissions,
    normalizeEmail,
    promoteExistingDeveloperUser,
    seedDeveloperUser,
    upsertDeveloperUser,
    validateDeveloperPassword
} = require('../src/services/developerSeedService');

const originalEnv = process.env;

describe('developerSeedService', () => {
    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('normalizes developer email input', () => {
        expect(normalizeEmail('  DEV@RCMS.COM  ')).toBe('dev@rcms.com');
    });

    test('requires a strong developer bootstrap password', () => {
        expect(() => validateDeveloperPassword('weakpass1')).toThrow(/uppercase letter/);
        expect(() => validateDeveloperPassword('Weakpassword1')).toThrow(/symbol/);
        expect(() => validateDeveloperPassword('StrongPassword1!')).not.toThrow();
    });

    test('grants Developer all known permissions idempotently', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

        await grantDeveloperPermissions(db);

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining("SELECT 'Developer'::user_role"));
        expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
    });

    test('promotes an existing active user and grants permissions', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ user_id: 'dev-1', email: 'dev@rcms.com', role: 'Developer' }] })
                .mockResolvedValueOnce({ rows: [] })
        };

        const result = await promoteExistingDeveloperUser(db, 'dev@rcms.com');

        expect(result).toEqual({ user_id: 'dev-1', email: 'dev@rcms.com', role: 'Developer' });
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[0][1]).toEqual(['dev@rcms.com']);
    });

    test('upserts a developer user with a hashed password', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ user_id: 'dev-1', email: 'dev@rcms.com', role: 'Developer' }] })
                .mockResolvedValueOnce({ rows: [] })
        };

        const result = await upsertDeveloperUser(db, {
            email: 'dev@rcms.com',
            password: 'StrongPassword1!',
            fullName: 'System Developer',
            mustChangePassword: true
        });

        expect(result.user_id).toBe('dev-1');
        expect(db.query.mock.calls[0][1][0]).toBe('System Developer');
        expect(db.query.mock.calls[0][1][1]).toBe('dev@rcms.com');
        expect(db.query.mock.calls[0][1][2]).toEqual(expect.stringMatching(/^\$2[aby]\$/));
        expect(db.query.mock.calls[0][1][3]).toBe(true);
    });

    test('seed creates or resets developer when password env is supplied', async () => {
        process.env.DEVELOPER_EMAIL = ' DEV@RCMS.COM ';
        process.env.DEVELOPER_PASSWORD = 'StrongPassword1!';
        process.env.DEVELOPER_FULL_NAME = 'Lead Developer';

        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ user_id: 'dev-1', email: 'dev@rcms.com', role: 'Developer' }] })
                .mockResolvedValueOnce({ rows: [] })
        };

        const result = await seedDeveloperUser(db);

        expect(result).toEqual({ promoted: true, created: true, userId: 'dev-1' });
        expect(db.query.mock.calls[0][1][0]).toBe('Lead Developer');
        expect(db.query.mock.calls[0][1][1]).toBe('dev@rcms.com');
    });
});
