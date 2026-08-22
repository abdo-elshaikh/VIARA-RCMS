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
    deleteAiProfile
} = require('../controllers/settingsController');
const { hasPermission } = require('../middleware/rbacMiddleware');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Public center homepage settings expose only safe marketing/contact fields.
    router.get('/public/home', getPublicCenterSettings(pool));
    
    // Anyone authenticated can read center settings (for receipts, UI headers, etc)
    router.get('/center', authenticateToken, getCenterSettings(pool));

    // Admin handles operational settings; Developer can access through the global bypass.
    router.put('/center', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_SETTINGS'), updateCenterSettings(pool));

    router.get('/database', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_DATABASE_CONFIG'), getDatabaseSettings(pool));
    router.put('/database', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_DATABASE_CONFIG'), updateDatabaseSettings(pool));
    router.post('/database/test', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_DATABASE_CONFIG'), testDatabaseSettings(pool));

    // Admin Superuser Maintenance & Governance
    router.post('/admin/maintenance/vacuum', authenticateToken, authorizeRole(['Admin', 'Developer']), vacuumDatabase(pool));
    router.post('/admin/maintenance/clear-cache', authenticateToken, authorizeRole(['Admin', 'Developer']), flushServerCache(pool));
    router.get('/admin/telemetry', authenticateToken, authorizeRole(['Admin', 'Developer']), getSystemTelemetry(pool));
    router.get('/admin/governance', authenticateToken, authorizeRole(['Admin', 'Developer']), getGovernancePolicies(pool));
    router.put('/admin/governance', authenticateToken, authorizeRole(['Admin', 'Developer']), updateGovernancePolicies(pool));

    router.get('/ai/status', authenticateToken, getAiSettingsStatus(pool));
    router.get('/ai', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), getAiSettings(pool));
    router.put('/ai', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), updateAiSettings(pool));
    router.post('/ai/test', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), testAiSettings(pool));
    router.get('/ai/profiles', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), getAiProfiles(pool));
    router.post('/ai/profiles', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), createAiProfile(pool));
    router.put('/ai/profiles/:id', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), updateAiProfile(pool));
    router.post('/ai/profiles/:id/activate', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), activateAiProfile(pool));
    router.delete('/ai/profiles/:id', authenticateToken, authorizeRole(['Developer']), hasPermission(pool, 'MANAGE_SECRET_SETTINGS'), deleteAiProfile(pool));

    return router;
};
