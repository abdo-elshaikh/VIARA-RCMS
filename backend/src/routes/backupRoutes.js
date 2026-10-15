const express = require('express');
const {
    generateBackup,
    listBackups,
    downloadBackup,
    restoreBackup,
    getBackupStatus
} = require('../controllers/backupController');
const { sensitiveOpLimiter, trialAwareLimiter } = require('../middleware/rateLimiters');

// Heavy export operations get stricter rate limits in trial mode
const exportLimiter = trialAwareLimiter(sensitiveOpLimiter);
const { hasPermission } = require('../middleware/rbacMiddleware');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    
    router.use(authenticateToken);
    // A backup contains every branch in the instance, including private medical data.
    router.use(async (req, res, next) => {
        const identityRole = req.user?.identity_role || req.user?.role;
        if (identityRole === 'Developer') return next();
        if (!req.user?.is_org_admin) return res.status(403).json({ error: 'Whole-instance backups require an organization administrator', code: 'BACKUP_ORG_ADMIN_REQUIRED' });
        try {
            const { rows } = await pool.query('SELECT count(*)::int AS count FROM organizations');
            if (rows[0]?.count !== 1) return res.status(403).json({ error: 'Multi-organization backups require a technical administrator', code: 'BACKUP_INSTANCE_ADMIN_REQUIRED' });
            return next();
        } catch (error) { return next(error); }
    });

    router.get('/', authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_BACKUPS'), listBackups(pool));
    router.get('/status', authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_BACKUPS'), getBackupStatus(pool));
    router.post('/generate', authorizeRole(['Admin']), hasPermission(pool, 'MANAGE_BACKUPS'), exportLimiter, generateBackup(pool));
    router.post('/restore', authorizeRole(['Developer']), hasPermission(pool, 'RESTORE_BACKUPS'), sensitiveOpLimiter, restoreBackup(pool));
    router.get('/:filename/download', authorizeRole(['Admin']), hasPermission(pool, 'DOWNLOAD_BACKUPS'), exportLimiter, downloadBackup(pool));

    return router;
};
