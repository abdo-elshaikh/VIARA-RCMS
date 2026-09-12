const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test-auth-secret-at-least-32-characters';

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('JWT authentication responses', () => {
    let authenticateToken;
    let authorizeStaffIdentity;
    let configureAuthDatabase;

    beforeAll(() => {
        process.env.JWT_SECRET = TEST_SECRET;
        jest.resetModules();
        ({ authenticateToken, authorizeStaffIdentity, configureAuthDatabase } = require('../src/middleware/authMiddleware'));
    });

    test('returns 401 for an expired access token so the client can refresh it', async () => {
        const token = jwt.sign({ user_id: 'user-1', role: 'Admin' }, TEST_SECRET, { expiresIn: -1 });
        const req = { headers: { authorization: `Bearer ${token}` }, path: '/api/profile/preferences' };
        const res = makeResponse();
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Access token expired',
            code: 'TOKEN_EXPIRED'
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 for a malformed JWT and does not treat it as authorization failure', async () => {
        const req = { headers: { authorization: 'Bearer not-a-jwt' }, path: '/api/profile/preferences' };
        const res = makeResponse();
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Invalid Token',
            code: 'INVALID_ACCESS_TOKEN'
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('keeps password-change enforcement as a genuine 403 response', async () => {
        const token = jwt.sign({
            user_id: 'user-1',
            role: 'Admin',
            must_change_password: true
        }, TEST_SECRET, { expiresIn: '5m' });
        const req = { headers: { authorization: `Bearer ${token}` }, path: '/api/profile/preferences' };
        const res = makeResponse();
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Password change required',
            code: 'PASSWORD_CHANGE_REQUIRED'
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('strips revoked emergency claims before any controller can trust them', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [{
                grant_id: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
                user_id: '4a8cc118-1d4e-4411-bbf7-6e9464fce34e',
                permissions: ['VIEW_EXAMS'],
                status: 'Revoked',
                expires_at: new Date(Date.now() + 60_000),
                session_id: null,
            }] })
            .mockResolvedValue({ rows: [] }) };
        configureAuthDatabase(db);
        const token = jwt.sign({
            user_id: '4a8cc118-1d4e-4411-bbf7-6e9464fce34e',
            role: 'Nurse',
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['VIEW_EXAMS'],
            breakGlassExpiry: Date.now() + 60_000,
        }, TEST_SECRET, { expiresIn: '5m' });
        const req = { headers: { authorization: `Bearer ${token}` }, path: '/api/exams/worklist' };
        const res = makeResponse();
        const next = jest.fn();

        await authenticateToken(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(req.user).not.toHaveProperty('emergencyAccessId');
        expect(req.user).not.toHaveProperty('elevatedPermissions');
        configureAuthDatabase(undefined);
    });

    test.each([
        ['patient portal', { userId: 'patient-1', role: 'Patient' }],
        ['doctor portal', { doctorId: 'doctor-1', role: 'Doctor' }],
        ['doctor portal with legacy claim', { doctor_id: 'doctor-1', role: 'Doctor' }]
    ])('staff identity guard rejects a %s token', (_label, user) => {
        const req = { user };
        const res = makeResponse();
        const next = jest.fn();

        authorizeStaffIdentity(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access Denied: Staff identity required' });
        expect(next).not.toHaveBeenCalled();
    });

    test('staff identity guard accepts a canonical staff user claim', () => {
        const next = jest.fn();

        authorizeStaffIdentity({ user: { user_id: 'staff-1', role: 'Receptionist' } }, {}, next);

        expect(next).toHaveBeenCalledWith();
    });
});
