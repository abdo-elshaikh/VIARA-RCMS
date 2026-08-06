const express = require('express');
const {
    generateBackup,
    listBackups,
    downloadBackup,
    restoreBackup,
    getBackupStatus
} = require('../controllers/backupController');
const { sensitiveOpLimiter } = require('../middleware/rateLimiters');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    
    router.use(authenticateToken);

    router.get('/', authorizeRole(['Admin']), listBackups(pool));
    router.get('/status', authorizeRole(['Admin']), getBackupStatus(pool));
    router.post('/generate', authorizeRole(['Admin']), generateBackup(pool));
    router.post('/restore', authorizeRole(['Developer']), sensitiveOpLimiter, restoreBackup(pool));
    router.get('/:filename/download', authorizeRole(['Admin']), downloadBackup(pool));

    return router;
};
