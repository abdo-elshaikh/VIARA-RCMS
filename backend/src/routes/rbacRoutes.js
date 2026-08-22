const express = require('express');
const {
    getAllPermissions,
    getRolePermissions,
    updateRolePermissions,
    requestBreakGlass,
    getUserPermissions,
    resetRolePermissions,
    cloneRolePermissions,
    getRbacAuditLogs
} = require('../controllers/rbacController');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Admins and authorized managers can view permissions and roles
    router.get('/permissions', authenticateToken, authorizeRole(['Admin', 'Developer']), hasAnyPermission(pool, ['MANAGE_ROLES', 'MANAGE_SETTINGS', 'VIEW_STAFF', 'VIEW_AUDIT_TRAILS']), getAllPermissions(pool));
    router.get('/roles', authenticateToken, authorizeRole(['Admin', 'Developer']), hasAnyPermission(pool, ['MANAGE_ROLES', 'MANAGE_SETTINGS', 'VIEW_STAFF', 'VIEW_AUDIT_TRAILS']), getRolePermissions(pool));
    router.put('/roles/:role/permissions', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_ROLES'), updateRolePermissions(pool));
    router.post('/roles/:role/reset', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_ROLES'), resetRolePermissions(pool));
    router.post('/roles/:role/clone', authenticateToken, authorizeRole(['Admin', 'Developer']), hasPermission(pool, 'MANAGE_ROLES'), cloneRolePermissions(pool));
    router.get('/audit-logs', authenticateToken, authorizeRole(['Admin', 'Developer']), hasAnyPermission(pool, ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS', 'MANAGE_ROLES']), getRbacAuditLogs(pool));
    
    router.post('/break-glass', authenticateToken,
        authorizeRole(['Radiologist', 'Nurse', 'Technician', 'Admin', 'Developer']), requestBreakGlass(pool));
    
    // Any authenticated user can fetch their permissions
    router.get('/my-permissions', authenticateToken, getUserPermissions(pool));

    return router;
};
