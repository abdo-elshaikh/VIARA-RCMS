const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const checkFeature = require('../middleware/checkFeature');

/** Every path prefix owned by this router; see the gate note below. */
const INSURANCE_PATHS = ['/insurance', '/claims'];
const {
    providerSchema,
    updateProviderSchema,
    contractSchema,
    updateContractSchema,
    policySchema,
    updatePolicySchema,
    coverageRuleSchema,
    updateCoverageRuleSchema,
    coverageQuerySchema,
    approvalSchema,
    updateApprovalStatusSchema
} = require('../schemas/insuranceSchema');
const {
    createClaimSchema,
    updateClaimStatusSchema,
    getClaimsQuerySchema,
    exportClaimsQuerySchema
} = require('../schemas/claimSchema');
const {
    claimsSummaryQuerySchema,
    payerStatementQuerySchema,
    insuranceAgingQuerySchema,
    contractsPerformanceQuerySchema
} = require('../schemas/insuranceReportSchema');
const {
    getClaimsSummary,
    getPayerStatement,
    getInsuranceAging,
    getContractsPerformance
} = require('../controllers/insuranceReportController');
const {
    getProviders,
    createProvider,
    updateProvider,
    getContracts,
    createContract,
    updateContract,
    getPolicies,
    createPolicy,
    updatePolicy,
    getCoverageRules,
    createCoverageRule,
    updateCoverageRule,
    previewCoverage,
    getApprovals,
    createApproval,
    updateApprovalStatus
} = require('../controllers/insuranceController');
const {
    getClaims,
    createClaim,
    updateClaimStatus,
    exportClaims
} = require('../controllers/claimsController');

module.exports = function insuranceRoutes(pool, auditService) {
    const router = express.Router();

    // Gated by explicit path prefix — see the note in financeRoutes.js. The
    // coverage invariant is enforced by tests/feature-gate-mounting.test.js.
    router.use(INSURANCE_PATHS, checkFeature('insurance'));

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
    router.put('/insurance/providers/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_PROVIDERS'),
        validateRequest(updateProviderSchema),
        updateProvider(pool)
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
    router.put('/insurance/contracts/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'),
        validateRequest(updateContractSchema),
        updateContract(pool)
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
    router.put('/insurance/policies/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff', 'Receptionist']),
        hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'),
        validateRequest(updatePolicySchema),
        updatePolicy(pool)
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
    router.put('/insurance/coverage-rules/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasPermission(pool, 'MANAGE_INSURANCE_CONTRACTS'),
        validateRequest(updateCoverageRuleSchema),
        updateCoverageRule(pool)
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
    router.get('/claims/export',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'insurance_claims' }),
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasAnyPermission(pool, ['VIEW_INSURANCE', 'MANAGE_INSURANCE_CLAIMS']),
        validateQuery(exportClaimsQuerySchema),
        exportClaims(pool)
    );
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

    // ─── Insurance & Contracts Reports ──────────────────────────────────────────
    router.get('/insurance/reports/claims-summary',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'insurance_claims' }),
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasAnyPermission(pool, ['VIEW_INSURANCE', 'MANAGE_INSURANCE_CLAIMS']),
        validateQuery(claimsSummaryQuerySchema),
        getClaimsSummary(pool)
    );
    router.get('/insurance/reports/statement',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'insurance_claims' }),
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasAnyPermission(pool, ['VIEW_INSURANCE', 'MANAGE_INSURANCE_CLAIMS']),
        validateQuery(payerStatementQuerySchema),
        getPayerStatement(pool)
    );
    router.get('/insurance/reports/aging',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'insurance_claims' }),
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasAnyPermission(pool, ['VIEW_INSURANCE', 'MANAGE_INSURANCE_CLAIMS']),
        validateQuery(insuranceAgingQuerySchema),
        getInsuranceAging(pool)
    );
    router.get('/insurance/reports/contracts-performance',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'contracts' }),
        authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']),
        hasAnyPermission(pool, ['VIEW_INSURANCE', 'MANAGE_INSURANCE_CONTRACTS']),
        validateQuery(contractsPerformanceQuerySchema),
        getContractsPerformance(pool)
    );

    return router;
};
