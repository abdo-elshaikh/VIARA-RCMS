const express = require('express');
const {
    getSystemDiagnostics,
    getMigrationStatus,
    getRuntimeStatus
} = require('../controllers/systemDiagnosticsController');
const {
    getStatus,
    checkUpdates,
    getHistory
} = require('../controllers/systemUpdateController');
const updatesUnavailable = (req, res) => res.status(503).json({ code: 'SYSTEM_UPDATE_UNAVAILABLE', error: 'Use the approved release deployment and recovery runbook.' });

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    router.use(authenticateToken);

    // Diagnostics & Runtime (Developer Only)
    router.get('/diagnostics', authorizeRole(['Developer']), getSystemDiagnostics(pool));
    router.get('/migrations', authorizeRole(['Developer']), getMigrationStatus(pool));
    router.get('/runtime', authorizeRole(['Developer']), getRuntimeStatus());

    // System Updates & Release Management (Developer & Admin)
    router.get('/updates/status', authorizeRole(['Developer', 'Admin']), getStatus(pool));
    router.post('/updates/check', authorizeRole(['Developer', 'Admin']), checkUpdates(pool));
    router.post('/updates/upload-patch', authorizeRole(['Developer', 'Admin']), updatesUnavailable);
    router.post('/updates/apply', authorizeRole(['Developer', 'Admin']), updatesUnavailable);
    router.get('/updates/history', authorizeRole(['Developer', 'Admin']), getHistory(pool));

    return router;
};
