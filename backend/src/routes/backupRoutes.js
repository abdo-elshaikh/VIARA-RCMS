const express = require('express');
const {
    generateBackup,
    listBackups,
    downloadBackup,
    restoreBackup,
    getBackupStatus
} = require('../controllers/backupController');
const { sensitiveOpLimiter } = require('../middleware/rateLimiters');
const { hasPermission } = require('../middleware/rbacMiddleware');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    
    router.use(authenticateToken);

    router.get('/', authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_BACKUPS'), listBackups(pool));
    router.get('/status', authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_BACKUPS'), getBackupStatus(pool));
    router.post('/generate', authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_BACKUPS'), generateBackup(pool));
    router.post('/restore', authorizeRole(['Developer']), hasPermission(pool, 'RESTORE_BACKUPS'), sensitiveOpLimiter, restoreBackup(pool));
    router.get('/:filename/download', authorizeRole(['Admin']), hasPermission(pool, 'DOWNLOAD_BACKUPS'), downloadBackup(pool));

    return router;
};
