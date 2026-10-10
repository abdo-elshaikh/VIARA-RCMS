'use strict';

describe('Environment Configuration Validation (validateEnv)', () => {
    let originalEnv;
    let validateEnv;
    let consoleErrorSpy;
    let consoleLogSpy;
    let consoleWarnSpy;

    beforeEach(() => {
        originalEnv = { ...process.env };
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.resetModules();
        validateEnv = require('../src/config/validateEnv');
    });

    afterEach(() => {
        process.env = originalEnv;
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('passes when all environment variables are correctly configured and distinct', () => {
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/viara_test';
        process.env.PORT = '3000';
        process.env.JWT_SECRET = 'a'.repeat(32);
        process.env.ENCRYPTION_KEY = '1'.repeat(64);
        process.env.BACKUP_ENCRYPTION_KEY = '2'.repeat(64);
        process.env.BLIND_INDEX_KEY = '3'.repeat(64);
        process.env.ORTHANC_PASSWORD = 'strong_orthanc_password_123';
        process.env.PACS_WEBHOOK_SECRET = 'strong_webhook_secret_123';

        expect(() => validateEnv()).not.toThrow();
    });

    it('rejects when BLIND_INDEX_KEY is identical to ENCRYPTION_KEY', () => {
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/viara_test';
        process.env.PORT = '3000';
        process.env.JWT_SECRET = 'a'.repeat(32);
        const sharedKey = '1'.repeat(64);
        process.env.ENCRYPTION_KEY = sharedKey;
        process.env.BACKUP_ENCRYPTION_KEY = '2'.repeat(64);
        process.env.BLIND_INDEX_KEY = sharedKey;
        process.env.ORTHANC_PASSWORD = 'strong_orthanc_password_123';
        process.env.PACS_WEBHOOK_SECRET = 'strong_webhook_secret_123';

        expect(() => validateEnv()).toThrow(/BLIND_INDEX_KEY must be distinct from ENCRYPTION_KEY/i);
    });

    it('rejects when BACKUP_ENCRYPTION_KEY is identical to ENCRYPTION_KEY', () => {
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/viara_test';
        process.env.PORT = '3000';
        process.env.JWT_SECRET = 'a'.repeat(32);
        const sharedKey = '1'.repeat(64);
        process.env.ENCRYPTION_KEY = sharedKey;
        process.env.BACKUP_ENCRYPTION_KEY = sharedKey;
        process.env.BLIND_INDEX_KEY = '3'.repeat(64);
        process.env.ORTHANC_PASSWORD = 'strong_orthanc_password_123';
        process.env.PACS_WEBHOOK_SECRET = 'strong_webhook_secret_123';

        expect(() => validateEnv()).toThrow(/BACKUP_ENCRYPTION_KEY must be distinct from ENCRYPTION_KEY/i);
    });

    it('rejects EXPOSE_DEV_STACK in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/viara_prod';
        process.env.PORT = '3000';
        process.env.JWT_SECRET = 'a'.repeat(32);
        process.env.ENCRYPTION_KEY = '1'.repeat(64);
        process.env.BACKUP_ENCRYPTION_KEY = '2'.repeat(64);
        process.env.BLIND_INDEX_KEY = '3'.repeat(64);
        process.env.ORTHANC_PASSWORD = 'strong_orthanc_password_123';
        process.env.PACS_WEBHOOK_SECRET = 'strong_webhook_secret_123';
        process.env.ALLOWED_ORIGINS = 'https://viara.health';
        process.env.CLIENT_URL = 'https://viara.health';
        process.env.PORTAL_CLIENT_URL = 'https://portal.viara.health';
        process.env.CLAMSCAN_PATH = 'clamscan';
        process.env.WEBAUTHN_ORIGIN = 'https://viara.health';
        process.env.WEBAUTHN_RP_ID = 'viara.health';
        process.env.WEBAUTHN_RP_NAME = 'VIARA RCMS';
        process.env.REDIS_URL = 'redis://127.0.0.1:6379';
        process.env.METRICS_TOKEN = 'synthetic_metrics_private_token_2026';
        process.env.EXPOSE_DEV_STACK = 'true';

        expect(() => validateEnv()).toThrow(/EXPOSE_DEV_STACK must not be enabled in production/i);
    });
});
