'use strict';

// Organization administrators retain their explicitly assigned organization
// privileges. Ordinary staff are authorized by their verified branch role.
module.exports = function effectiveRole(req) {
    const identityRole = req.user?.identity_role || req.user?.role;
    if (identityRole === 'Developer') return 'Developer';
    if (req.user?.is_org_admin) return identityRole || 'Unassigned';
    if (req.branchContext) {
        if (req.branchContext.branchRole) return req.branchContext.branchRole === 'Developer' ? 'Unassigned' : req.branchContext.branchRole;
        if (req.branchContext.branchId === null) return 'Unassigned';
    }
    const role = req.branchContext?.branchRole || req.user?.role;
    return role === 'Developer' ? 'Unassigned' : (role || 'Unassigned');
};


