const express = require('express');
const { hasAnyPermission, hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const {
    auditLogsQuerySchema,
    auditExportQuerySchema,
    auditVerifyQuerySchema,
    auditAlertsQuerySchema,
    auditAlertReviewSchema,
    auditDetectionSchema,
} = require('../schemas/auditSchema');
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

    router.get('/', hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS']), validateQuery(auditLogsQuerySchema), getAuditLogs(pool));
    router.get('/export', hasPermission(pool, 'EXPORT_AUDIT_TRAILS'), validateQuery(auditExportQuerySchema), exportAuditLogs(pool));
    router.get('/verify', hasPermission(pool, 'VERIFY_AUDIT_CHAIN'), validateQuery(auditVerifyQuerySchema), verifyAuditChain(pool));
    router.get('/alerts', hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS']), validateQuery(auditAlertsQuerySchema), getAuditAlerts(pool));
    router.post('/alerts/detect', hasPermission(pool, 'RUN_AUDIT_DETECTIONS'), validateRequest(auditDetectionSchema), runAuditDetections(pool));
    router.patch('/alerts/:alertId/review', hasPermission(pool, 'REVIEW_AUDIT_ALERTS'), validateRequest(auditAlertReviewSchema), reviewAuditAlert(pool));

    return router;
};
