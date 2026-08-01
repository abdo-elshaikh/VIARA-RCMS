const express = require('express');
const { hasAnyPermission, hasPermission } = require('../middleware/rbacMiddleware');
const {
    getAuditLogs,
    exportAuditLogs,
    verifyAuditChain,
    getAuditAlerts,
    reviewAuditAlert,
    runAuditDetections,
} = require('../controllers/auditController');

module.exports = (pool, authenticateToken) => {
    const router = express.Router();

    router.use(authenticateToken);

    router.get('/', hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS']), getAuditLogs(pool));
    router.get('/export', hasPermission(pool, 'EXPORT_AUDIT_TRAILS'), exportAuditLogs(pool));
    router.get('/verify', hasPermission(pool, 'VERIFY_AUDIT_CHAIN'), verifyAuditChain(pool));
    router.get('/alerts', hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS']), getAuditAlerts(pool));
    router.post('/alerts/detect', hasPermission(pool, 'RUN_AUDIT_DETECTIONS'), runAuditDetections(pool));
    router.patch('/alerts/:alertId/review', hasPermission(pool, 'REVIEW_AUDIT_ALERTS'), reviewAuditAlert(pool));

    return router;
};
