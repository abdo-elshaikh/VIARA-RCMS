const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const configured = process.env.VIARA_RELEASE_TEST_REDIS_URL;
if (!configured || new URL(configured).pathname !== '/15') throw Error('Use an isolated test Redis database 15 through VIARA_RELEASE_TEST_REDIS_URL');
process.env.REDIS_URL = configured;
process.env.RATE_LIMIT_STORE = 'redis';
const { createRateLimitStore, closeRateLimitStore } = backendRequire('./src/services/rateLimitStore');
const { rateLimit } = backendRequire('express-rate-limit');
const express = backendRequire('express');
const request = backendRequire('supertest');
async function main() {
    const policy = `release-test-${crypto.randomUUID()}`;
    const first = createRateLimitStore(policy), second = createRateLimitStore(policy);
    const apps = [first, second].map(store => {
        const app = express();
        app.get('/', rateLimit({ windowMs: 1000, limit: 3, store }), (req, res) => res.json({ ok: true }));
        return app;
    });
    try {
        assert.equal((await request(apps[0]).get('/')).status, 200);
        assert.equal((await request(apps[1]).get('/')).status, 200);
        assert.equal((await request(apps[0]).get('/')).status, 200);
        assert.equal((await request(apps[1]).get('/')).status, 429);
        await new Promise(resolve => setTimeout(resolve, 1100));
        assert.equal((await request(apps[1]).get('/')).status, 200);
        console.log(JSON.stringify({ success: true, replicas: 2, sharedQuota: true, expiry: true }));
    } finally {
        await first.resetKey('::/56');
        await first.resetKey('127.0.0.1');
        await closeRateLimitStore();
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
