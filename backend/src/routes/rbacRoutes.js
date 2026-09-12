const express = require('express');
const {
    getAllPermissions,
    getRolePermissions,
    updateRolePermissions,
    requestBreakGlass,
    getBreakGlassStatus,
    listActiveBreakGlassGrants,
    revokeBreakGlass,
    getUserPermissions,
    resetRolePermissions,
    cloneRolePermissions,
    getRbacAuditLogs
} = require('../controllers/rbacController');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const { sensitiveOpLimiter } = require('../middleware/rateLimiters');
const { requestBreakGlassSchema, revokeBreakGlassSchema } = require('../schemas/breakGlassSchema');
const { EMERGENCY_ACCESS_ROLES } = require('../services/emergencyAccessService');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Viewer permission set kept in sync with the frontend Settings tab gate
    // (settingsSections.js) so the tab never opens for a permission the data
    // endpoints would reject.
    const rbacViewerPermissions = ['MANAGE_ROLES', 'MANAGE_SETTINGS', 'VIEW_STAFF', 'VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS'];

    // Admins and authorized managers can view permissions and roles
    router.get('/permissions', authenticateToken, authorizeRole(['Admin', 'Developer']), hasAnyPermission(pool, rbacViewerPermissions), getAllPermissions(pool));
    router.get('/roles', authenticateToken, authorizeRole(['Admin', 'Developer']), hasAnyPermission(pool, rbacViewerPermissions), getRolePermissions(pool));
    router.put('/roles/:role/permissions', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_ROLES'), sensitiveOpLimiter, updateRolePermissions(pool));
    router.post('/roles/:role/reset', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_ROLES'), sensitiveOpLimiter, resetRolePermissions(pool));
    router.post('/roles/:role/clone', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_ROLES'), sensitiveOpLimiter, cloneRolePermissions(pool));
    router.get('/audit-logs', authenticateToken, authorizeRole(['Admin', 'Developer']), hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS', 'MANAGE_ROLES']), getRbacAuditLogs(pool));
    
    router.get('/break-glass/status', authenticateToken,
        authorizeRole(EMERGENCY_ACCESS_ROLES), getBreakGlassStatus(pool));
    router.get('/break-glass/active', authenticateToken,
        authorizeRole(['Admin', 'Developer']),
        hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS', 'MANAGE_ROLES']),
        listActiveBreakGlassGrants(pool));
    router.post('/break-glass', authenticateToken,
        authorizeRole(EMERGENCY_ACCESS_ROLES),
        sensitiveOpLimiter,
        validateRequest(requestBreakGlassSchema),
        requestBreakGlass(pool));
    router.post('/break-glass/revoke', authenticateToken,
        authorizeRole(EMERGENCY_ACCESS_ROLES),
        sensitiveOpLimiter,
        validateRequest(revokeBreakGlassSchema),
        revokeBreakGlass(pool));
    router.post('/break-glass/:grantId/revoke', authenticateToken,
        authorizeRole(['Admin', 'Developer']),
        hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS', 'MANAGE_ROLES']),
        validateRequest(revokeBreakGlassSchema),
        revokeBreakGlass(pool, { administrative: true }));
    
    // Any authenticated user can fetch their permissions
    router.get('/my-permissions', authenticateToken, getUserPermissions(pool));

    return router;
};
