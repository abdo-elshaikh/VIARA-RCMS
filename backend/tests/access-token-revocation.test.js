const jwt = require('jsonwebtoken');
const { authenticateToken, configureAuthDatabase } = require('../src/middleware/authMiddleware');
const secret = 'isolated-access-token-revocation-test-secret';
const originalSecret = process.env.JWT_SECRET;

beforeAll(() => { process.env.JWT_SECRET = secret; });
afterEach(() => configureAuthDatabase(undefined));
afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
});

const authenticate = async (rows, claims = {}, path = '/api/invoices') => {
    const db = { query: jest.fn().mockResolvedValue({ rows }) };
    configureAuthDatabase(db);
    const token = jwt.sign({ user_id: 'synthetic-staff', role: 'Admin', session_id: 'session-1', ...claims }, secret, { expiresIn: '5m' });
    const req = { headers: { authorization: `Bearer ${token}` }, path, method: 'GET' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authenticateToken(req, res, next);
    return { req, res, next, db };
};

test.each([
    ['deleted', []],
    ['inactive', [{ is_active: false, role: 'Admin', current_session_id: 'session-1' }]],
    ['demoted', [{ is_active: true, role: 'Receptionist', current_session_id: 'session-1' }]],
    ['revoked session', [{ is_active: true, role: 'Admin', current_session_id: null }]],
    ['replaced session', [{ is_active: true, role: 'Admin', current_session_id: 'session-2' }]],
])('rejects an already-issued access token after the account is %s', async (_name, rows) => {
    const { res, next } = await authenticate(rows);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
});

test('uses the current password-change requirement instead of the old JWT claim', async () => {
    const { res, next } = await authenticate([{ is_active: true, role: 'Admin', current_session_id: 'session-1', must_change_password: true }], { must_change_password: false });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
});

test('allows a live session to change its required password', async () => {
    const { next } = await authenticate([{ is_active: true, role: 'Admin', current_session_id: 'session-1', must_change_password: true }], {}, '/api/profile/password');
    expect(next).toHaveBeenCalledWith();
});

test.each([
    ['Patient', { user_id: undefined, userId: 'synthetic-patient' }, 'patients', 'patient_status'],
    ['Doctor', { user_id: undefined, doctorId: 'synthetic-doctor' }, 'referring_doctors', 'portal_is_active'],
])('validates a live %s portal owner using its own account schema', async (role, claims, table, activeField) => {
    const { db, next } = await authenticate([{ is_active: true, role, current_session_id: 'session-1', must_change_password: false }], { ...claims, role });
    expect(db.query.mock.calls[0][0]).toContain(`FROM ${table}`);
    expect(db.query.mock.calls[0][0]).toContain(activeField);
    expect(next).toHaveBeenCalledWith();
});

test('rejects an access token without a session', async () => {
    const { res, db } = await authenticate([], { session_id: undefined });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.query).not.toHaveBeenCalled();
});
