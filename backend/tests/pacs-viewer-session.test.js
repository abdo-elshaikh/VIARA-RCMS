const jwt = require('jsonwebtoken');
const secret = 'pacs-test-secret-with-at-least-32-characters';
process.env.JWT_SECRET = secret;
const { authenticateDicomWeb, configureAuthDatabase } = require('../src/middleware/authMiddleware');

describe('Scoped viewer session revocation', () => {
    const payload = { user_id: 'reader', role: 'Radiologist', session_id: 'session-1', scope: 'pacs-viewer', study_instance_uids: ['1.2.3'] };
    const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
    test.each([
        { current_session_id: null, is_active: true, role: 'Radiologist' },
        { current_session_id: 'session-2', is_active: true, role: 'Radiologist' },
        { current_session_id: 'session-1', is_active: false, role: 'Radiologist' },
        { current_session_id: 'session-1', is_active: true, role: 'Technician' },
        { current_session_id: 'session-1', is_active: true, role: 'Radiologist', must_change_password: true }
    ])('rejects revoked or changed staff state: %j', async owner => {
        configureAuthDatabase({ query: jest.fn(async () => ({ rows: [owner] })) });
        const req = { headers: { authorization: 'Bearer ' + jwt.sign(payload, secret, { expiresIn: '5m' }) } };
        const res = response(), next = jest.fn();
        await authenticateDicomWeb(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
    test('accepts only the current active staff session', async () => {
        configureAuthDatabase({ query: jest.fn(async () => ({ rows: [{ current_session_id: 'session-1', is_active: true, role: 'Radiologist' }] })) });
        const req = { headers: { authorization: 'Bearer ' + jwt.sign(payload, secret, { expiresIn: '5m' }) } };
        const next = jest.fn();
        await authenticateDicomWeb(req, response(), next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.authType).toBe('pacs_viewer_bearer');
    });
    test('rejects a legacy cookie without its parent login session', async () => {
        const { session_id, ...legacy } = payload;
        const req = { headers: { cookie: 'pacs_viewer_token=' + jwt.sign(legacy, secret) } };
        const res = response();
        await authenticateDicomWeb(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
