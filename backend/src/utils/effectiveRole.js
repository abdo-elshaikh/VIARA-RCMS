'use strict';

// Organization administrators retain their explicitly assigned organization
// privileges. Ordinary staff are authorized by their verified branch role.
module.exports = function effectiveRole(req) {
    if (req.user?.role === 'Developer' || req.user?.is_org_admin) return req.user.role;
    const role = req.branchContext?.branchRole || req.user?.role;
    return role === 'Developer' ? 'Unassigned' : role;
};
