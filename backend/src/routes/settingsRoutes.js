const express = require('express');
const {
    getCenterSettings,
    getPublicCenterSettings,
    updateCenterSettings,
    getDatabaseSettings,
    updateDatabaseSettings,
    testDatabaseSettings,
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

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Public center homepage settings expose only safe marketing/contact fields.
    router.get('/public/home', getPublicCenterSettings(pool));
    
    // Anyone authenticated can read center settings (for receipts, UI headers, etc)
    router.get('/center', authenticateToken, getCenterSettings(pool));

    // Admin handles operational settings; Developer can access through the global bypass.
    router.put('/center', authenticateToken, authorizeRole(['Admin']), updateCenterSettings(pool));

    router.get('/database', authenticateToken, authorizeRole(['Developer']), getDatabaseSettings(pool));
    router.put('/database', authenticateToken, authorizeRole(['Developer']), updateDatabaseSettings(pool));
    router.post('/database/test', authenticateToken, authorizeRole(['Developer']), testDatabaseSettings(pool));

    router.get('/ai/status', authenticateToken, getAiSettingsStatus(pool));
    router.get('/ai', authenticateToken, authorizeRole(['Developer']), getAiSettings(pool));
    router.put('/ai', authenticateToken, authorizeRole(['Developer']), updateAiSettings(pool));
    router.post('/ai/test', authenticateToken, authorizeRole(['Developer']), testAiSettings(pool));
    router.get('/ai/profiles', authenticateToken, authorizeRole(['Developer']), getAiProfiles(pool));
    router.post('/ai/profiles', authenticateToken, authorizeRole(['Developer']), createAiProfile(pool));
    router.put('/ai/profiles/:id', authenticateToken, authorizeRole(['Developer']), updateAiProfile(pool));
    router.post('/ai/profiles/:id/activate', authenticateToken, authorizeRole(['Developer']), activateAiProfile(pool));
    router.delete('/ai/profiles/:id', authenticateToken, authorizeRole(['Developer']), deleteAiProfile(pool));

    return router;
};
