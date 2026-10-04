const express = require('express');

// Import modular routes
const auditRoutes = require('../auditRoutes');
const rbacRoutes = require('../rbacRoutes');
const privacyRoutes = require('../privacyRoutes');
// analyticsRoutes is intentionally NOT imported here.
// It is mounted directly on /api/analytics in server.js to avoid
// double-registration at both /api/analytics and /api/v1/analytics.
const documentRoutes = require('../documentRoutes');
const integrationRoutes = require('../integrationRoutes');
const settingsRoutes = require('../settingsRoutes');
const backupRoutes = require('../backupRoutes');
const safetyRoutes = require('../safetyRoutes');
const importRoutes = require('../importRoutes');
const pacsRoutes = require('../pacsRoutes');
const displayRoutes = require('../displayRoutes');
const receptionRoutes = require('../receptionRoutes');
const roomRoutes = require('../roomRoutes');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    router.use('/audit', auditRoutes(pool, authenticateToken, authorizeRole));
    router.use('/rbac', rbacRoutes(pool, authenticateToken, authorizeRole));
    router.use('/privacy', privacyRoutes(pool, authenticateToken, authorizeRole));
    // analytics NOT mounted here — see /api/analytics in server.js
    router.use('/documents', documentRoutes(pool, authenticateToken, authorizeRole));
    router.use('/integrations', integrationRoutes(pool, authenticateToken, authorizeRole));
    router.use('/settings', settingsRoutes(pool, authenticateToken, authorizeRole));
    router.use('/backups', backupRoutes(pool, authenticateToken, authorizeRole));
    router.use('/clinical', safetyRoutes(pool, authenticateToken, authorizeRole));
    router.use('/import', importRoutes(pool, authenticateToken, authorizeRole));
    router.use('/pacs', pacsRoutes(pool, authenticateToken, authorizeRole));
    router.use('/display', displayRoutes(pool, authenticateToken, authorizeRole));
    router.use('/reception', receptionRoutes(pool, authenticateToken, authorizeRole));
    router.use('/rooms', roomRoutes(pool, authenticateToken, authorizeRole));

    router.get('/health', async (req, res) => {
        try {
            await pool.query('SELECT 1');
            res.json({
                status: 'OK',
                version: 'v1',
                database: 'connected',
                timestamp: new Date().toISOString(),
                pool_stats: {
                    total: pool.totalCount,
                    idle: pool.idleCount,
                    waiting: pool.waitingCount
                }
            });
        } catch {
            res.status(503).json({
                status: 'ERROR',
                version: 'v1',
                database: 'disconnected',
                timestamp: new Date().toISOString()
            });
        }
    });

    return router;
};
