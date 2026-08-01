const jwt = require('jsonwebtoken');

const TEST_SECRET = 'test-auth-secret-at-least-32-characters';

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('JWT authentication responses', () => {
    let authenticateToken;

    beforeAll(() => {
        process.env.JWT_SECRET = TEST_SECRET;
        jest.resetModules();
        ({ authenticateToken } = require('../src/middleware/authMiddleware'));
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
});
