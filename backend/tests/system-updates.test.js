const express = require('express');
const request = require('supertest');
const { CURRENT_VERSION, getSystemUpdateStatus, checkForAvailableUpdates, verifyUpdatePackage, applySystemUpdate, getSystemUpdateHistory } = require('../src/services/systemUpdateService');
const systemRoutes = require('../src/routes/systemRoutes');

describe('Release management uses approved external deployment', () => {
    const pool = { query: jest.fn(async sql => ({ rows: sql.includes('COUNT') ? [{ count: 194 }] : [] })), connect: jest.fn() };
    beforeEach(() => jest.clearAllMocks());
    test('status reports the running version and explicitly disables package application', async () => {
        const status = await getSystemUpdateStatus(pool);
        expect(status.currentVersion).toBe(CURRENT_VERSION);
        expect(status.applicationEnabled).toBe(false);
        expect(status.deploymentMethod).toBe('immutable-release');
    });
    test('an unconfigured release channel is unknown, not an assertion that releases were checked', async () => {
        const result = await checkForAvailableUpdates(pool);
        expect(result.checked).toBe(false); expect(result.hasUpdate).toBeNull();
    });
    test('package verification fails closed, including unsigned and arbitrary paths', async () => {
        await expect(verifyUpdatePackage('untrusted.zip')).rejects.toMatchObject({ statusCode: 503, code: 'SYSTEM_UPDATE_UNAVAILABLE' });
        expect(pool.query).not.toHaveBeenCalled();
    });
    test('application cannot skip backups or write completed records', async () => {
        await expect(applySystemUpdate(pool, { targetVersion: '99.0.0', autoBackup: false })).rejects.toMatchObject({ statusCode: 503 });
        expect(pool.query).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled();
    });
    test('history remains available', async () => expect(Array.isArray(await getSystemUpdateHistory(pool))).toBe(true));
    test('HTTP upload/apply reject before accepting multipart files and preserve role gates', async () => {
        const app = express(); app.use(express.json());
        const auth = (req, res, next) => { req.user = { role: req.headers['x-test-role'] || 'Admin' }; next(); };
        const roles = allowed => (req, res, next) => allowed.includes(req.user.role) ? next() : res.sendStatus(403);
        app.use('/system', systemRoutes(pool, auth, roles));
        expect((await request(app).post('/system/updates/upload-patch').attach('package', Buffer.from('untrusted'), 'payload.zip')).status).toBe(503);
        expect((await request(app).post('/system/updates/apply').send({ targetVersion: '99.0.0', autoBackup: false })).status).toBe(503);
        expect((await request(app).post('/system/updates/apply').set('x-test-role', 'Nurse').send({})).status).toBe(403);
        expect(pool.query).not.toHaveBeenCalled();
    });
});
