jest.mock('../src/middleware/rbacMiddleware', () => ({
    hasPermission: jest.fn((db, permission) => (req, res, next) => {
        req.checkedPermissions = [...(req.checkedPermissions || []), permission];
        next();
    }),
    hasAnyPermission: jest.fn((db, permissions) => (req, res, next) => {
        req.checkedAnyPermissions = [...(req.checkedAnyPermissions || []), permissions];
        next();
    }),
}));

jest.mock('../src/controllers/auditController', () => ({
    getAuditLogs: jest.fn(() => (req, res) => res.json({ route: 'logs', checkedPermissions: req.checkedPermissions, checkedAnyPermissions: req.checkedAnyPermissions })),
    getStaffActivityLogs: jest.fn(() => (req, res) => res.json({ route: 'activity', checkedPermissions: req.checkedPermissions })),
    exportStaffActivityLogs: jest.fn(() => (req, res) => res.json({ route: 'activity_export', checkedPermissions: req.checkedPermissions })),
    exportAuditLogs: jest.fn(() => (req, res) => res.json({ route: 'export', checkedPermissions: req.checkedPermissions })),
    verifyAuditChain: jest.fn(() => (req, res) => res.json({ route: 'verify', checkedPermissions: req.checkedPermissions })),
    getAuditAlerts: jest.fn(() => (req, res) => res.json({ route: 'alerts', checkedPermissions: req.checkedPermissions, checkedAnyPermissions: req.checkedAnyPermissions })),
    reviewAuditAlert: jest.fn(() => (req, res) => res.json({ route: 'review', checkedPermissions: req.checkedPermissions })),
    runAuditDetections: jest.fn(() => (req, res) => res.json({ route: 'detect', checkedPermissions: req.checkedPermissions })),
}));

const express = require('express');
const request = require('supertest');
const auditRoutes = require('../src/routes/auditRoutes');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/audit', auditRoutes({}, (req, res, next) => {
        req.user = { user_id: '00000000-0000-4000-8000-000000000001', role: 'Admin' };
        next();
    }));
    return app;
};

describe('audit routes permissions', () => {
    it('uses granular permissions for sensitive audit operations', async () => {
        const app = buildApp();

        await expect(request(app).get('/audit/').then(res => res.body.checkedPermissions[0]))
            .resolves.toBe('VIEW_AUDIT_TRAILS');
        await expect(request(app).get('/audit/alerts').then(res => res.body.checkedPermissions[0]))
            .resolves.toBe('VIEW_AUDIT_TRAILS');
        await expect(request(app).get('/audit/export').then(res => res.body.checkedPermissions[0]))
            .resolves.toBe('EXPORT_AUDIT_TRAILS');
        await expect(request(app).get('/audit/verify').then(res => res.body.checkedPermissions[0]))
            .resolves.toBe('VERIFY_AUDIT_CHAIN');
        await expect(request(app).post('/audit/alerts/detect').then(res => res.body.checkedPermissions[0]))
            .resolves.toBe('RUN_AUDIT_DETECTIONS');
        await expect(request(app).patch('/audit/alerts/00000000-0000-4000-8000-000000000001/review').send({ status: 'resolved' }).then(res => res.body.checkedPermissions[0]))
            .resolves.toBe('REVIEW_AUDIT_ALERTS');
    });
});
