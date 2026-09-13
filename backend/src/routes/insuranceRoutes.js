const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const {
    providerSchema,
    contractSchema,
    policySchema,
    coverageRuleSchema,
    coverageQuerySchema,
    approvalSchema,
    updateApprovalStatusSchema
} = require('../schemas/insuranceSchema');
const {
    createClaimSchema,
    updateClaimStatusSchema,
    getClaimsQuerySchema
} = require('../schemas/claimSchema');
const {
    getProviders,
    createProvider,
    getContracts,
    createContract,
    getPolicies,
    createPolicy,
    getCoverageRules,
    createCoverageRule,
    previewCoverage,
    getApprovals,
    createApproval,
    updateApprovalStatus
} = require('../controllers/insuranceController');
const {
    getClaims,
    createClaim,
    updateClaimStatus
} = require('../controllers/claimsController');

module.exports = function insuranceRoutes(pool, auditService) {
    const router = express.Router();

    // Insurance Providers
    router.get('/insurance/providers',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        getProviders(pool)
    );
    router.post('/insurance/providers',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_PROVIDERS'),
        validateRequest(providerSchema),
        createProvider(pool)
    );

    // Insurance Contracts
    router.get('/insurance/contracts',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        getContracts(pool)
    );
    router.post('/insurance/contracts',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'),
        validateRequest(contractSchema),
        createContract(pool)
    );

    // Insurance Policies
    router.get('/insurance/policies',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Nurse']),
        getPolicies(pool)
    );
    router.post('/insurance/policies',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'),
        validateRequest(policySchema),
        createPolicy(pool)
    );

    // Coverage Rules & Preview
    router.get('/insurance/coverage-rules',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        getCoverageRules(pool)
    );
    router.post('/insurance/coverage-rules',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'),
        validateRequest(coverageRuleSchema),
        createCoverageRule(pool)
    );
    router.get('/insurance/coverage-preview',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        validateQuery(coverageQuerySchema),
        previewCoverage(pool)
    );

    // Prior Approvals
    router.get('/insurance/approvals',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Nurse']),
        getApprovals(pool)
    );
    router.post('/insurance/approvals',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Nurse']),
        hasPermission(pool, 'MANAGE_INSURANCE_APPROVALS'),
        validateRequest(approvalSchema),
        createApproval(pool)
    );
    router.put('/insurance/approvals/:approvalId/status',
        authenticateToken,
        hasPermission(pool, 'MANAGE_INSURANCE_APPROVALS'),
        validateRequest(updateApprovalStatusSchema),
        updateApprovalStatus(pool)
    );

    // Insurance Claims
    router.get('/claims',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'insurance_claims' }),
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        hasAnyPermission(pool, ['VIEW_INSURANCE', 'MANAGE_INSURANCE_CLAIMS']),
        validateQuery(getClaimsQuerySchema),
        getClaims(pool)
    );
    router.post('/claims',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_CLAIMS'),
        validateRequest(createClaimSchema),
        createClaim(pool)
    );
    router.put('/claims/:id/status',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_CLAIMS'),
        validateRequest(updateClaimStatusSchema),
        updateClaimStatus(pool)
    );

    return router;
};
