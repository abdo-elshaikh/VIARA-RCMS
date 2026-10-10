jest.mock('../src/services/securityEventService', () => ({
    logSecurityEvent: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/services/notificationJobService', () => ({
    triggerEventForRole: jest.fn().mockResolvedValue(undefined)
}));

const tokenController = require('../src/controllers/tokenController');

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

const makeRequest = (role, body = {}) => ({
    user: { user_id: 'staff-1', role },
    body,
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('jest')
});

describe('personal API token controller governance', () => {
    test('allows authenticated users to create read-only personal access tokens', async () => {
        const db = {
            query: jest.fn().mockResolvedValueOnce({
                rows: [{ id: 'token-1', name: 'readonly-client', prefix: 'VIARA_live_123...', accessLevel: 'read', created: new Date() }]
            })
        };
        const req = makeRequest('Nurse', { name: ' readonly-client ', accessLevel: 'read' });
        const res = makeResponse();
        const next = jest.fn();

        await tokenController.createToken(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0]).toMatchObject({
            token: { name: 'readonly-client', accessLevel: 'read' }
        });
        expect(res.json.mock.calls[0][0].rawToken).toMatch(/^VIARA_live_/);
    });

    test('blocks read/write token creation for roles without developer authorization', async () => {
        const db = {
            query: jest.fn().mockResolvedValueOnce({ rows: [] })
        };
        const req = makeRequest('Nurse', { name: 'unsafe-writer', accessLevel: 'read_write' });
        const res = makeResponse();
        const next = jest.fn();

        await tokenController.createToken(db)(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 403,
            message: 'Write API tokens require developer authorization'
        }));
    });

    test('allows Developer users to create read/write personal access tokens', async () => {
        const db = {
            query: jest.fn().mockResolvedValueOnce({
                rows: [{ id: 'token-2', name: 'trusted-writer', prefix: 'VIARA_live_456...', accessLevel: 'read_write', created: new Date() }]
            })
        };
        const req = makeRequest('Developer', { name: 'trusted-writer', accessLevel: 'read_write' });
        const res = makeResponse();
        const next = jest.fn();

        await tokenController.createToken(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0]).toMatchObject({
            token: { name: 'trusted-writer', accessLevel: 'read_write' }
        });
    });
});
