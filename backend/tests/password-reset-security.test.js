const request = require('supertest');
const express = require('express');
const crypto = require('crypto');
jest.mock('../src/services/notificationService', () => ({ sendEmail: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/services/auditService', () => ({ logAction: jest.fn().mockResolvedValue() }));
const { forgotPassword, resetPassword } = require('../src/controllers/authController');
const { sendEmail } = require('../src/services/notificationService');
const { getStaffOrigin } = require('../src/config/publicOrigin');

const makeApp = db => {
    const app = express(); app.use(express.json());
    app.post('/forgot', forgotPassword(db)); app.post('/reset', resetPassword(db));
    app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
    return app;
};
const token = 'a'.repeat(64);
const user = { user_id: 'test-user', full_name: 'Synthetic User', email: 'staff@example.test', is_active: true, password_reset_expires: new Date(Date.now() + 60000) };

describe('Password recovery security', () => {
    const original = { ...process.env };
    afterEach(() => { process.env = { ...original }; jest.clearAllMocks(); });
    test('email links use the approved HTTPS origin despite untrusted request headers', async () => {
        process.env.NODE_ENV = 'production'; process.env.CLIENT_URL = 'https://staff.example.test';
        const db = { query: jest.fn().mockResolvedValue({ rows: [user] }) };
        const result = await request(makeApp(db)).post('/forgot').set('Host', 'attacker.example.test').set('X-Forwarded-Host', 'attacker.example.test').send({ email: user.email });
        expect(result.status).toBe(200);
        expect(sendEmail.mock.calls[0][2]).toContain('https://staff.example.test/login?resetToken=');
        expect(sendEmail.mock.calls[0][2]).not.toContain('attacker.example.test');
    });
    test.each(['http://staff.example.test', 'https://user:password@staff.example.test', 'https://staff.example.test/path', 'https://staff.example.test?redirect=evil', 'invalid'])('rejects unsafe production origin %s', origin => {
        expect(() => getStaffOrigin({ NODE_ENV: 'production', CLIENT_URL: origin })).toThrow();
    });
    test('competing token consumers cannot both succeed and session revocation is in the same statement', async () => {
        let consumed = false;
        const db = { query: jest.fn(async sql => {
            if (sql.startsWith('SELECT')) return { rows: [user] };
            expect(sql).toContain('password_reset_token = $3');
            expect(sql).toContain('password_reset_expires > NOW()');
            expect(sql).toContain('UPDATE refresh_tokens');
            if (consumed) return { rows: [] };
            consumed = true; return { rows: [{ user_id: user.user_id }] };
        }) };
        const app = makeApp(db), payload = { token, email: user.email, newPassword: 'SyntheticPassword123!' };
        const results = await Promise.all([request(app).post('/reset').send(payload), request(app).post('/reset').send(payload)]);
        expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    });
    test.each([null, 'expired'])('rejects %s expiration before hashing or consumption', async expiry => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ ...user, password_reset_expires: expiry === 'expired' ? new Date(0) : null }] }) };
        const result = await request(makeApp(db)).post('/reset').send({ token, email: user.email, newPassword: 'SyntheticPassword123!' });
        expect(result.status).toBe(400); expect(db.query).toHaveBeenCalledTimes(1);
    });
    test('does not enumerate missing accounts', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const result = await request(makeApp(db)).post('/forgot').send({ email: 'missing@example.test' });
        expect(result.status).toBe(200); expect(sendEmail).not.toHaveBeenCalled();
    });
    test('stores a digest instead of the raw emailed token', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [user] }) };
        await request(makeApp(db)).post('/forgot').send({ email: user.email });
        const raw = sendEmail.mock.calls[0][2].match(/resetToken=([a-f0-9]{64})/)[1];
        expect(db.query.mock.calls[1][1][0]).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
        expect(db.query.mock.calls[1][1][0]).not.toBe(raw);
    });
});
