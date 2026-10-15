'use strict';
const { AppError } = require('../middleware/errorHandler');
const organizationId = req => {
    if (!req.user?.organization_id) throw new AppError('Verified organization context is required', 403);
    return req.user.organization_id;
};
const requireIdentityManager = req => {
    const org = organizationId(req);
    if (!req.user.is_org_admin && (req.user.identity_role || req.user.role) !== 'Developer') {
        throw new AppError('Global staff identity changes require an organization administrator', 403);
    }
    return org;
};
module.exports = { organizationId, requireIdentityManager };
