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

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    // Only admins can manage roles
    router.get('/permissions', authenticateToken, authorizeRole(['Admin']), getAllPermissions(pool));
    router.get('/roles', authenticateToken, authorizeRole(['Admin']), getRolePermissions(pool));
    router.put('/roles/:role/permissions', authenticateToken, authorizeRole(['Admin']), updateRolePermissions(pool));
    router.post('/roles/:role/reset', authenticateToken, authorizeRole(['Admin']), resetRolePermissions(pool));
    router.post('/roles/:role/clone', authenticateToken, authorizeRole(['Admin']), cloneRolePermissions(pool));
    router.get('/audit-logs', authenticateToken, authorizeRole(['Admin']), getRbacAuditLogs(pool));
    
    router.post('/break-glass', authenticateToken,
        authorizeRole(['Radiologist', 'Nurse', 'Technician']), requestBreakGlass(pool));
    
    // Any authenticated user can fetch their permissions
    router.get('/my-permissions', authenticateToken, getUserPermissions(pool));

    return router;
};
