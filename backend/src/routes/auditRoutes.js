const express = require('express');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const checkFeature = require('../middleware/checkFeature');
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
    getStaffActivityLogs,
    exportStaffActivityLogs,
    exportAuditLogs,
    verifyAuditChain,
    getAuditAlerts,
    reviewAuditAlert,
    runAuditDetections,
} = require('../controllers/auditController');

const { authorizeRole: defaultAuthorizeRole } = require('../middleware/authMiddleware');

module.exports = (pool, authenticateToken, authorizeRole = defaultAuthorizeRole) => {
    const router = express.Router();

    router.use(authenticateToken);

    router.get('/activity', authorizeRole(['Developer', 'Admin', 'HR']), hasPermission(pool, 'VIEW_AUDIT_LOGS'), validateQuery(auditLogsQuerySchema), getStaffActivityLogs(pool));
    router.get('/activity/export', checkFeature('export'), authorizeRole(['Developer', 'Admin', 'HR']), hasPermission(pool, 'EXPORT_STAFF_ACTIVITY'), validateQuery(auditExportQuerySchema), exportStaffActivityLogs(pool));
    router.get('/', authorizeRole(['Developer', 'Admin']), hasPermission(pool, 'VIEW_AUDIT_TRAILS'), validateQuery(auditLogsQuerySchema), getAuditLogs(pool));
    router.get('/export', checkFeature('export'), hasPermission(pool, 'EXPORT_AUDIT_TRAILS'), validateQuery(auditExportQuerySchema), exportAuditLogs(pool));
    router.get('/verify', hasPermission(pool, 'VERIFY_AUDIT_CHAIN'), validateQuery(auditVerifyQuerySchema), verifyAuditChain(pool));
    router.get('/alerts', authorizeRole(['Developer', 'Admin']), hasPermission(pool, 'VIEW_AUDIT_TRAILS'), validateQuery(auditAlertsQuerySchema), getAuditAlerts(pool));
    router.post('/alerts/detect', hasPermission(pool, 'RUN_AUDIT_DETECTIONS'), validateRequest(auditDetectionSchema), runAuditDetections(pool));
    router.patch('/alerts/:alertId/review', hasPermission(pool, 'REVIEW_AUDIT_ALERTS'), validateRequest(auditAlertReviewSchema), reviewAuditAlert(pool));

    return router;
};
