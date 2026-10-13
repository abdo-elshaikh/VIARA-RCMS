'use strict';
const { getUserBranches } = require('../services/branchService');

module.exports = async function requestBranches(db, req) {
    // The authentication middleware has already checked membership against the
    // database for this request. Controllers must keep the selected scope.
    if (req.branchContext?.branchId) {
        return { branches: [{ id: req.branchContext.branchId }], defaultBranchId: req.branchContext.branchId };
    }
    return getUserBranches(db, req.user.user_id, Boolean(req.user.is_org_admin), req.user.organization_id);
};
