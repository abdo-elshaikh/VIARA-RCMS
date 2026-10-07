const express = require('express');
const {
    getCenterSettings,
    getPublicCenterSettings,
    updateCenterSettings,
    getDatabaseSettings,
    updateDatabaseSettings,
    testDatabaseSettings,
    vacuumDatabase,
    flushServerCache,
    getSystemTelemetry,
    getGovernancePolicies,
    updateGovernancePolicies,
    getAiSettingsStatus,
    getAiSettings,
    updateAiSettings,
    testAiSettings,
    getAiProfiles,
    createAiProfile,
    updateAiProfile,
    activateAiProfile,
    deleteAiProfile,
    seedDemoData,
    clearDemoData,
    getDemoStatus
} = require('../controllers/settingsController');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { aiSettingsTestLimiter } = require('../middleware/rateLimiters');
const portalBuilder = require('../controllers/portalBuilderController');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Public center homepage settings expose only safe marketing/contact fields.
    router.get('/public/home', getPublicCenterSettings(pool));
    const portalAccess = [authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_SETTINGS')];
    router.get('/portal', ...portalAccess, portalBuilder.get(pool));
    router.put('/portal/draft', ...portalAccess, portalBuilder.save(pool));
    router.post('/portal/publish', ...portalAccess, portalBuilder.publish(pool));
    router.post('/portal/restore', ...portalAccess, portalBuilder.restore(pool));
    router.post('/portal/preview-session', ...portalAccess, portalBuilder.preview(pool));
    router.get('/portal/versions', ...portalAccess, portalBuilder.versions(pool));
    
    // Anyone authenticated can read center settings (for receipts, UI headers, etc)
    router.get('/center', authenticateToken, getCenterSettings(pool));

    // Admin handles operational settings; Developer can access through the global bypass.
    router.put('/center', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_SETTINGS'), updateCenterSettings(pool));

    router.get('/database', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_DATABASE_CONFIG'), getDatabaseSettings(pool));
    router.put('/database', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_DATABASE_CONFIG'), updateDatabaseSettings(pool));
    router.post('/database/test', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_DATABASE_CONFIG'), testDatabaseSettings(pool));

    // Admin Superuser Maintenance & Governance
    router.post('/admin/maintenance/vacuum', authenticateToken, authorizeRole(['Admin', 'Developer']), vacuumDatabase(pool));
    router.post('/admin/maintenance/clear-cache', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_SETTINGS'), flushServerCache(pool));
    router.get('/admin/telemetry', authenticateToken, authorizeRole(['Admin', 'Developer']), getSystemTelemetry(pool));
    router.get('/admin/governance', authenticateToken, authorizeRole(['Admin', 'Developer']), getGovernancePolicies(pool));
    router.put('/admin/governance', authenticateToken, authorizeRole(['Admin', 'Developer']), updateGovernancePolicies(pool));

    // Demo Data Management
    router.get('/demo-status', authenticateToken, authorizeRole(['Admin', 'Developer']), getDemoStatus(pool));
    router.post('/demo-seed', authenticateToken, authorizeRole(['Admin', 'Developer']), seedDemoData(pool));
    router.post('/demo-clear', authenticateToken, authorizeRole(['Admin', 'Developer']), clearDemoData(pool));

    router.get('/ai/status', authenticateToken, getAiSettingsStatus(pool));
    router.get('/ai', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), getAiSettings(pool));
    router.put('/ai', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), updateAiSettings(pool));
    router.post('/ai/test', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), aiSettingsTestLimiter, testAiSettings(pool));
    router.get('/ai/profiles', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), getAiProfiles(pool));
    router.post('/ai/profiles', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), createAiProfile(pool));
    router.put('/ai/profiles/:id', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), updateAiProfile(pool));
    router.post('/ai/profiles/:id/activate', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), activateAiProfile(pool));
    router.delete('/ai/profiles/:id', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), deleteAiProfile(pool));

    return router;
};
