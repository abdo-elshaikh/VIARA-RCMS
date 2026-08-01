jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined)
}));

const bcrypt = require('bcrypt');
const { changePassword } = require('../src/controllers/profileController');

const createResponse = () => ({
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('profile password changes', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret-for-password-change';
        process.env.JWT_EXPIRY = '1h';
    });

    it('persists the new password hash and requires logout after revoking sessions', async () => {
        const oldPassword = 'TempPass123';
        const newPassword = 'NewPass456';
        const oldHash = await bcrypt.hash(oldPassword, 4);
        let savedHash;

        const client = {
            query: jest.fn(async (sql, params = []) => {
                if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
                if (String(sql).startsWith('SELECT password_hash')) {
                    return { rows: [{ password_hash: oldHash }] };
                }
                if (String(sql).startsWith('UPDATE users SET password_hash')) {
                    savedHash = params[0];
                    return {
                        rows: [{
                            user_id: 'user-1',
                            full_name: 'New User',
                            email: 'new.user@rcms.test',
                            role: 'Nurse',
                            must_change_password: false
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = {
            connect: jest.fn().mockResolvedValue(client)
        };
        const req = {
            user: { user_id: 'user-1' },
            body: { currentPassword: oldPassword, newPassword },
            ip: '127.0.0.1',
            get: jest.fn().mockReturnValue('jest-agent')
        };
        const res = createResponse();
        const next = jest.fn();

        await changePassword(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(await bcrypt.compare(newPassword, savedHash)).toBe(true);
        expect(await bcrypt.compare(oldPassword, savedHash)).toBe(false);
        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({
            httpOnly: true,
            path: '/api/auth'
        }));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            logoutRequired: true
        }));
    });
});
