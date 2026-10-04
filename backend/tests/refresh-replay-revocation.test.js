jest.mock('../src/config/logger', () => ({ warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/services/securityEventService', () => ({ logSecurityEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/notificationJobService', () => ({ triggerEvent: jest.fn(), triggerEventForRole: jest.fn().mockResolvedValue(undefined) }));
const { refresh } = require('../src/controllers/authController');

const runReplay = async (currentSession, reason = 'rotated') => {
    const client = {
        query: jest.fn(async sql => {
            if (sql.includes('SELECT rt.*')) return { rows: [{ token_id: 'synthetic-token', user_id: 'synthetic-user', session_id: 'old-session', revoked: true, revoked_reason: reason }] };
            if (sql.includes('SELECT current_session_id')) return { rows: [{ current_session_id: currentSession }] };
            if (sql.includes('SELECT revoked,')) return { rows: [{ session_id: 'old-session', revoked: true, revoked_reason: reason }] };
            return { rows: [] };
        }),
        release: jest.fn()
    };
    const db = { connect: jest.fn().mockResolvedValue(client) };
    const next = jest.fn();
    await refresh(db)({ headers: { cookie: 'refreshToken=synthetic-value' }, body: {}, originalUrl: '/api/auth/refresh' }, {}, next);
    return { client, next };
};

test('replaying a rotated token revokes the current session and its access JWTs', async () => {
    const { client, next } = await runReplay('old-session');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET current_session_id = NULL'), ['synthetic-user', 'old-session']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("revoked_reason = 'token_reuse_detected'"), ['synthetic-user', 'old-session']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(next.mock.calls[0][0].statusCode).toBe(401);
});

test('replaying a token from an older login cannot revoke the new login session', async () => {
    const { client, next } = await runReplay('new-session');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('SET current_session_id = NULL'))).toBe(false);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
});

test('an explicitly revoked token cannot trigger a replay teardown', async () => {
    const { client, next } = await runReplay('old-session', 'staff_security_profile_changed');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('SET current_session_id = NULL'))).toBe(false);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
});
