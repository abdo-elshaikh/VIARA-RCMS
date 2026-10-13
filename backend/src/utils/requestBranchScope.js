'use strict';
const { AppError } = require('../middleware/errorHandler');

module.exports = function requestBranchScope(req, requestedBranchId) {
    const branchId = req.branchContext?.branchId;
    if (!branchId || req.branchContext?.isAllBranches) {
        throw new AppError('Select a branch for this operation', 400, true, 'BRANCH_SELECTION_REQUIRED');
    }
    if (requestedBranchId && requestedBranchId !== branchId) {
        throw new AppError('Requested branch differs from the selected branch', 403, true, 'BRANCH_ACCESS_DENIED');
    }
    return branchId;
};
