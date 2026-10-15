'use strict';

const express = require('express');
const request = require('supertest');
jest.mock('../src/services/licenseService', () => ({
    getLicense: jest.fn(() => ({ edition: 'trial', allowedModules: [], daysRemaining: 5 })),
    inspectLicenseKey: jest.fn(() => ({ valid: true, payload: { edition: 'standard' } })),
    applyLicenseKey: jest.fn(() => ({ edition: 'standard', allowedModules: [] })),
}));
jest.mock('../src/services/quotaService', () => ({ getQuotaStats: jest.fn(async () => ({})) }));
const service = require('../src/services/licenseService');
const routes = require('../src/routes/licenseRoutes');

const appFor = (role) => {
    const app = express();
    app.use(express.json());
    app.use('/api/license', routes({}, (req, res, next) => {
        if (!role) return res.sendStatus(401);
        req.user = { user_id: 1, role };
        next();
    }));
    return app;
};

beforeEach(() => jest.clearAllMocks());
describe('license administration authorization', () => {
    test.each(['inspect', 'activate'])('%s rejects anonymous callers', async (action) => {
        await request(appFor()).post(`/api/license/${action}`).send({ key: 'test' }).expect(401);
        expect(service.applyLicenseKey).not.toHaveBeenCalled();
        expect(service.inspectLicenseKey).not.toHaveBeenCalled();
    });
    test.each(['Receptionist', 'Nurse', 'Doctor', 'Patient'])('%s cannot modify or inspect license keys', async (role) => {
        for (const action of ['inspect', 'activate']) {
            await request(appFor(role)).post(`/api/license/${action}`).send({ key: 'test' }).expect(403);
        }
        expect(service.applyLicenseKey).not.toHaveBeenCalled();
        expect(service.inspectLicenseKey).not.toHaveBeenCalled();
    });
    test.each(['Admin', 'Developer'])('%s may activate and inspect licenses', async (role) => {
        await request(appFor(role)).post('/api/license/inspect').send({ key: 'test' }).expect(200);
        await request(appFor(role)).post('/api/license/activate').send({ key: 'test' }).expect(200);
        expect(service.applyLicenseKey).toHaveBeenCalledWith('test', { persist: true });
    });
    test('staff can still read the trial summary', async () => {
        await request(appFor('Receptionist')).get('/api/license/info').expect(200);
    });
});
