// Run only against a disposable database whose name ends in _release_test.
// The migration CI job provisions this database before invoking the verifier.
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const databaseUrl = process.env.VIARA_RELEASE_TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_release_test')) {
    throw new Error('VIARA_RELEASE_TEST_DATABASE_URL must target a disposable *_release_test database');
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'viara_release_integration_synthetic_secret_2026';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.BLIND_INDEX_KEY = 'synthetic_release_blind_index_key_2026';
process.env.LICENSE_KEY = '';
const { Pool } = backendRequire('pg');
const express = backendRequire('express');
const request = backendRequire('supertest');
const bcrypt = backendRequire('bcrypt');
const { resetPassword, refresh } = backendRequire('./src/controllers/authController');
const AuthService = backendRequire('./src/services/authService');
const { authenticateToken, configureAuthDatabase } = backendRequire('./src/middleware/authMiddleware');

async function main() {
    const pool = new Pool({ connectionString: databaseUrl, max: 12 });
    const id = crypto.randomUUID(), email = `release-${id}@example.test`;
    const rawToken = crypto.randomBytes(32).toString('hex');
    try {
        assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name, /_release_test$/);
        await pool.query(`INSERT INTO users (user_id, full_name, email, password_hash, role, password_reset_token, password_reset_expires)
            VALUES ($1, 'Synthetic Release User', $2, $3, 'Developer', $4, NOW() + INTERVAL '1 hour')`,
        [id, email, await bcrypt.hash('SyntheticOldPassword123!', 12), crypto.createHash('sha256').update(rawToken).digest('hex')]);
        const tokens = await AuthService.generateTokens(pool, { user_id: id, role: 'Developer' }, id);
        configureAuthDatabase(pool);
        const app = express(); app.use(express.json()); app.use(backendRequire('cookie-parser')());
        app.post('/reset', resetPassword(pool)); app.post('/refresh', refresh(pool));
        app.get('/protected', authenticateToken, (req, res) => res.json({ ok: true }));
        app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: error.message }));
        assert.equal((await request(app).get('/protected').set('Authorization', `Bearer ${tokens.token}`)).status, 200);
        const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => request(app).post('/reset').send({ token: rawToken, email, newPassword: `SyntheticNewPassword${i}!` })));
        const winners = responses.map((r, i) => ({ status: r.status, i })).filter(r => r.status === 200);
        assert.equal(winners.length, 1); assert.equal(responses.filter(r => r.status === 400).length, 7);
        const row = (await pool.query('SELECT password_hash, password_reset_token, password_reset_expires, current_session_id FROM users WHERE user_id=$1', [id])).rows[0];
        assert.equal(row.password_reset_token, null); assert.equal(row.password_reset_expires, null); assert.equal(row.current_session_id, null);
        assert.equal(await bcrypt.compare(`SyntheticNewPassword${winners[0].i}!`, row.password_hash), true);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id=$1 AND revoked=FALSE', [id])).rows[0].count, 0);
        assert.equal((await request(app).get('/protected').set('Authorization', `Bearer ${tokens.token}`)).status, 401);
        assert.equal((await request(app).post('/refresh').set('Cookie', `refreshToken=${tokens.refreshToken}`)).status, 401);
        assert.equal((await request(app).post('/reset').send({ token: rawToken, email, newPassword: 'SyntheticReusePassword123!' })).status, 400);
        console.log(JSON.stringify({ success: true, concurrentRequests: 8, successfulConsumers: 1, rejectedConsumers: 7, storedPasswordVerified: true, oldAccessRejected: true, oldRefreshRejected: true, tokenReuseRejected: true }));
    } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
