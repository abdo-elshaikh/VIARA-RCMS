const validateEnv = require('../src/config/validateEnv');

describe('Release environment hardening', () => {
    const original = { ...process.env };
    beforeEach(() => {
        Object.assign(process.env, { NODE_ENV: 'production', METRICS_TOKEN: 'synthetic_metrics_private_token_2026', CLIENT_URL: 'https://staff.example.test', PORTAL_CLIENT_URL: 'https://portal.example.test', ALLOWED_ORIGINS: 'https://staff.example.test,https://portal.example.test', CLAMSCAN_PATH: '/usr/bin/clamdscan', WEBAUTHN_ORIGIN: 'https://staff.example.test', WEBAUTHN_RP_ID: 'staff.example.test', WEBAUTHN_RP_NAME: 'Synthetic Test', REDIS_URL: 'redis://127.0.0.1:6379', RATE_LIMIT_STORE: 'redis', TRUST_PROXY: 'loopback,172.28.0.10', PERF_TEST: 'false', PACS_AI_ENABLED: 'false' });
        jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { process.env = { ...original }; jest.restoreAllMocks(); });
    test('accepts the approved configuration', () => expect(() => validateEnv()).not.toThrow());
    test('rejects a production performance bypass', () => { process.env.PERF_TEST = 'true'; expect(() => validateEnv()).toThrow('PERF_TEST'); });
    test('rejects memory quotas in production', () => { process.env.RATE_LIMIT_STORE = 'memory'; expect(() => validateEnv()).toThrow('RATE_LIMIT_STORE'); });
    test('requires shared quota storage', () => { delete process.env.REDIS_URL; expect(() => validateEnv()).toThrow('REDIS_URL'); });
    test('rejects an invalid Redis protocol', () => { process.env.REDIS_URL = 'https://redis.example.test'; expect(() => validateEnv()).toThrow('REDIS_URL'); });
    test('rejects an invalid trusted proxy network', () => { process.env.TRUST_PROXY = 'untrusted-host.example.test'; expect(() => validateEnv()).toThrow('TRUST_PROXY'); });
    test.each(['true', '1', '2'])('rejects unsafe proxy trust %s', setting => { process.env.TRUST_PROXY = setting; expect(() => validateEnv()).toThrow('TRUST_PROXY'); });
    test('rejects unreviewed AI enablement', () => { process.env.PACS_AI_ENABLED = 'true'; delete process.env.PACS_AI_RELEASE_APPROVED; expect(() => validateEnv()).toThrow('PACS_AI_RELEASE_APPROVED'); });
    test('does not accept a staff origin with credentials or path', () => { process.env.CLIENT_URL = 'https://user:secret@staff.example.test/path'; expect(() => validateEnv()).toThrow('CLIENT_URL'); });
});
