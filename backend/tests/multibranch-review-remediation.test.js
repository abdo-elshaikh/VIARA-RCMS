jest.mock('../src/services/licenseService', () => ({ getLicense: jest.fn() }));
const licenseService = require('../src/services/licenseService');
const { getUserBranches, createBranch, checkBranchQuota } = require('../src/services/branchService');
const { createClaim } = require('../src/controllers/claimsController');
const { getPatientHistory } = require('../src/controllers/patientController');

const branchA = '00000000-0000-4000-8000-000000000001';
const branchB = '00000000-0000-4000-8000-000000000002';
const organization = '00000000-0000-4000-8000-000000000010';

describe('post-review branch authorization regressions', () => {
    test('branch context proof is bound to identity, branch and expiry', () => {
        const { signBranchContext } = require('../src/utils/branchContextProof');
        const expiry = Math.floor(Date.now() / 1000) + 120;
        const signed = signBranchContext(branchA, 'user-A', expiry);
        expect(signed.signature).not.toBe(signBranchContext(branchB, 'user-A', expiry).signature);
        expect(signed.signature).not.toBe(signBranchContext(branchA, 'user-B', expiry).signature);
        expect(signed.signature).not.toBe(signBranchContext(branchA, 'user-A', expiry + 1).signature);
    });
    test('claim status cannot change a claim from another branch', async () => {
        const { updateClaimStatus } = require('../src/controllers/claimsController');
        const client = { release: jest.fn(), query: jest.fn(async sql => ({ rows: sql.includes('SELECT * FROM insurance_claims')
            ? [{ branch_id: branchB, status: 'Draft' }] : [] })) };
        const next = jest.fn();
        await updateClaimStatus({ connect: async () => client })({ params: { id: 'claim' },
            body: { status: 'Pending Approval' }, user: { user_id: 'user' }, branchContext: { branchId: branchA } }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'BRANCH_ACCESS_DENIED' }));
        expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE insurance_claims'))).toBe(false);
    });
    test.each(['getClaimsSummary', 'getPayerStatement', 'getInsuranceAging', 'getContractsPerformance'])('report %s rejects conflicting branch before reading data', async name => {
        const db = { query: jest.fn() }, next = jest.fn();
        await require('../src/controllers/insuranceReportController')[name](db)({
            query: { branchId: branchB }, branchContext: { branchId: branchA },
        }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'BRANCH_ACCESS_DENIED' }));
        expect(db.query).not.toHaveBeenCalled();
    });
    test('membership creation rejects a user from another organization', async () => {
        const { assignBranchMember } = require('../src/services/branchService');
        const client = { release: jest.fn(), query: jest.fn(async sql => ({ rows:
            sql.includes('FROM users') ? [{ organization_id: 'other', is_active: true, role: 'Admin' }]
                : sql.includes('FROM branches') ? [{ organization_id: organization, status: 'active' }] : [] })) };
        await expect(assignBranchMember({ connect: async () => client }, branchA, 'user')).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO user_branch_memberships'))).toBe(false);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
    test('expired enterprise license permits reads but denies clinical writes', () => {
        licenseService.getLicense.mockReturnValue({ edition: 'enterprise', isExpired: true });
        const guard = require('../src/middleware/trialGuard');
        const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
        guard({ method: 'GET', path: '/exams' }, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        guard({ method: 'POST', path: '/exams' }, res, next);
        expect(res.status).toHaveBeenCalledWith(402);
        expect(next).toHaveBeenCalledTimes(1);
    });
    test('emergency grant must match both user and branch organization', async () => {
        const { requireBranchContext } = require('../src/middleware/branchContextMiddleware');
        const db = { query: jest.fn(async sql => ({ rows:
            sql.includes('FROM user_branch_memberships') ? [{ id: branchA, branch_role: 'Nurse' }]
                : sql.includes('FROM emergency_access_logs') ? [{ grant_id: branchB, organization_id: 'other', target_branch_id: branchB }]
                : sql.includes('FROM branches') ? [{ id: branchB, organization_id: organization }] : [] })) };
        const req = { user: { user_id: 'user', role: 'Nurse', organization_id: organization,
            emergencyAccessId: branchB, elevatedPermissions: ['VIEW_EXAMS'], breakGlassExpiry: Date.now() + 60000 },
            method: 'GET', headers: { 'x-branch-id': branchB } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
        await requireBranchContext(db)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
    test('nullable legacy membership cannot inherit general Admin privileges', async () => {
        const { requireBranchContext } = require('../src/middleware/branchContextMiddleware');
        const { authorizeRole } = require('../src/middleware/authMiddleware');
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: branchA, branch_role: null, organization_id: organization }] }) };
        const req = { user: { user_id: 'user', role: 'Admin', organization_id: organization }, headers: { 'x-branch-id': branchA } };
        await requireBranchContext(db)(req, {}, jest.fn());
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
        authorizeRole(['Admin'])(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
    test('RBAC uses the branch role rather than the general Admin role', async () => {
        const { hasPermission } = require('../src/middleware/rbacMiddleware');
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const next = jest.fn();
        await hasPermission(db, 'MANAGE_USERS')({
            user: { user_id: 'user', role: 'Admin' },
            branchContext: { branchId: branchA, branchRole: 'Receptionist' },
            headers: {}, get: jest.fn(),
        }, {}, next);
        expect(db.query.mock.calls[0][1]).toEqual(['Receptionist', 'MANAGE_USERS']);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
    test('membership revocation is visible on the next request and query is organization scoped', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ id: branchA }] })
            .mockResolvedValueOnce({ rows: [] }) };
        expect((await getUserBranches(db, 'user', false, organization)).branches).toHaveLength(1);
        expect((await getUserBranches(db, 'user', false, organization)).branches).toHaveLength(0);
        expect(db.query.mock.calls[0][0]).toContain('b.organization_id = $2');
        expect(db.query.mock.calls[0][1]).toEqual(['user', organization]);
    });

    test('multiple memberships without a default require branch selection', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: branchA }, { id: branchB }] }) };
        expect((await getUserBranches(db, 'user', false, organization)).defaultBranchId).toBeNull();
    });

    test.each([
        [{ isExpired: true, multiBranchAllowed: true }, 'LICENSE_EXPIRED'],
        [{ organizationId: 'other', multiBranchAllowed: true }, 'LICENSE_ORGANIZATION_MISMATCH'],
    ])('branch creation rejects invalid license before inserting', async (license, code) => {
        licenseService.getLicense.mockReturnValue(license);
        const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        await expect(createBranch(db, { code: 'B', name: 'Branch' }, organization)).rejects.toMatchObject({ code });
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO branches'))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('expired license disables branch creation in quota response', async () => {
        licenseService.getLicense.mockReturnValue({ isExpired: true, multiBranchAllowed: true, maxBranches: -1 });
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ active_count: 1 }] }) };
        expect(await checkBranchQuota(db, organization)).toMatchObject({ canCreateMore: false, canReactivate: false });
    });

    test('claim cannot adopt an invoice from another branch, even with an unrestricted database role', async () => {
        const client = {
            query: jest.fn(async (sql) => ({ rows: sql.startsWith('SELECT * FROM invoices')
                ? [{ branch_id: branchB, invoice_status: 'Issued', patient_id: 'patient' }] : [] })),
            release: jest.fn(),
        };
        const next = jest.fn();
        await createClaim({ connect: jest.fn().mockResolvedValue(client) })({
            body: { invoiceId: 'invoice', expectedAmount: 100 },
            user: { user_id: 'user' }, branchContext: { branchId: branchA },
        }, { status: jest.fn() }, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'BRANCH_ACCESS_DENIED' }));
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO insurance_claims'))).toBe(false);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('unscoped patient history fails before any database read', async () => {
        const db = { query: jest.fn() };
        const next = jest.fn();
        await getPatientHistory(db)({ params: { id: 'patient' }, user: { role: 'Admin' } }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'BRANCH_SELECTION_REQUIRED' }));
        expect(db.query).not.toHaveBeenCalled();
    });
});
