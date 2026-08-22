const { authorizeRole } = require('../src/middleware/authMiddleware');
const { hasAnyPermission, hasPermission } = require('../src/middleware/rbacMiddleware');
const sanitizeInput = require('../src/middleware/sanitize');
const { createInvoiceSchema, updateInvoiceSchema, getInvoicesQuerySchema, collectPaymentSchema } = require('../src/schemas/invoiceSchema');
const { updateClaimStatusSchema } = require('../src/schemas/claimSchema');
const {
    createExpenseSchema,
    financialReportQuerySchema,
    getFinancialClosuresQuerySchema,
    journalLedgerQuerySchema,
    payCommissionSchema,
    reverseExpenseSchema
} = require('../src/schemas/financeSchema');
const { createAppointmentSchema, updateAppointmentSchema } = require('../src/schemas/appointmentSchema');
const { updateInventoryStockSchema } = require('../src/schemas/inventorySchema');
const { approvalSchema } = require('../src/schemas/insuranceSchema');
const { updateExamReportSchema } = require('../src/schemas/examSchema');
const { isValidCalendarDate } = require('../src/utils/dateValidation');
const { isValidBackupFilename, resolveBackupPath } = require('../src/services/postgresBackupService');
const { isJsonRestoreAllowed, validateJsonBackupPayload } = require('../src/controllers/backupController');
const IntegrationService = require('../src/services/integrationService');
const { renderTemplate } = require('../src/services/notificationService');
const { getOutstandingClaims, getReceivablesAging } = require('../src/controllers/reportController');
const { getMyInvoices } = require('../src/controllers/portalController');
const { getQueue, transitionQueue } = require('../src/controllers/queueController');
const { reviewPartialPaymentException } = require('../src/controllers/partialPaymentExceptionController');
const { assertInvoiceFullyPaid, assertInvoiceTransactionAllowed } = require('../src/services/partialPaymentExceptionService');
const { getDiscountReport, getJournalLedger, getTrialBalance, normalizeRange } = require('../src/services/financialReportService');
const {
    canAssignRole,
    canManageRole,
    assertProtectedUserMutation
} = require('../src/utils/roleGovernance');

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('request and lifecycle business rules', () => {
    const makeRbacRequest = (role, overrides = {}) => ({
        user: { user_id: `${role.toLowerCase()}-1`, role, ...overrides.user },
        ip: '127.0.0.1',
        originalUrl: '/api/protected-resource',
        get: jest.fn().mockReturnValue('jest-agent'),
        ...overrides
    });

    test('role authorization fails closed', () => {
        const next = jest.fn();
        const status = jest.fn().mockReturnThis();
        const json = jest.fn();
        authorizeRole(['Admin'])({ user: { role: 'Patient' } }, { status, json }, next);
        expect(status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('developer is the only global role authorization bypass', () => {
        const developerNext = jest.fn();
        authorizeRole(['Admin'])({ user: { role: 'Developer' } }, {}, developerNext);
        expect(developerNext).toHaveBeenCalled();

        const adminNext = jest.fn();
        const status = jest.fn().mockReturnThis();
        const json = jest.fn();
        authorizeRole(['Developer'])({ user: { role: 'Admin' } }, { status, json }, adminNext);
        expect(status).toHaveBeenCalledWith(403);
        expect(adminNext).not.toHaveBeenCalled();
    });

    test('permission middleware gives Developer the only permission bypass', async () => {
        const db = { query: jest.fn() };
        const next = jest.fn();

        await hasPermission(db, 'MANAGE_DATABASE_CONFIG')(makeRbacRequest('Developer'), createResponse(), next);

        expect(next).toHaveBeenCalledWith();
        expect(db.query).not.toHaveBeenCalled();
    });

    test('permission middleware requires explicit Admin grants', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
        };
        const next = jest.fn();

        await hasPermission(db, 'MANAGE_DATABASE_CONFIG')(makeRbacRequest('Admin'), createResponse(), next);

        expect(db.query.mock.calls[0][1]).toEqual(['Admin', 'MANAGE_DATABASE_CONFIG']);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('permission middleware allows Admin when the grant exists', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
        const next = jest.fn();

        await hasPermission(db, 'VIEW_AUDIT_TRAILS')(makeRbacRequest('Admin'), createResponse(), next);

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('role_permissions'), ['Admin', 'VIEW_AUDIT_TRAILS']);
        expect(next).toHaveBeenCalledWith();
    });

    test('any-permission middleware follows the same Developer and Admin rules', async () => {
        const developerDb = { query: jest.fn() };
        const developerNext = jest.fn();
        await hasAnyPermission(developerDb, ['RESTORE_BACKUPS'])(makeRbacRequest('Developer'), createResponse(), developerNext);
        expect(developerNext).toHaveBeenCalledWith();
        expect(developerDb.query).not.toHaveBeenCalled();

        const adminDb = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
        };
        const adminNext = jest.fn();
        await hasAnyPermission(adminDb, ['RESTORE_BACKUPS', 'MANAGE_AI_SETTINGS'])(makeRbacRequest('Admin'), createResponse(), adminNext);
        expect(adminDb.query.mock.calls[0][1]).toEqual(['Admin', ['RESTORE_BACKUPS', 'MANAGE_AI_SETTINGS']]);
        expect(adminNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('protected role governance blocks non-developer escalation', async () => {
        expect(canAssignRole({ role: 'Admin' }, 'Developer')).toBe(false);
        expect(canAssignRole({ role: 'Admin' }, 'Radiologist')).toBe(true);
        expect(canManageRole({ role: 'HR' }, 'Admin')).toBe(false);
        expect(canManageRole({ role: 'Developer' }, 'Admin')).toBe(true);

        const client = {
            query: jest.fn().mockResolvedValue({ rows: [{ count: 1 }] })
        };

        await expect(assertProtectedUserMutation(
            client,
            { user_id: 'dev-2', role: 'Developer' },
            { user_id: 'dev-1', role: 'Developer', is_active: true },
            'Admin',
            true
        )).rejects.toThrow('final active Developer');
    });

    test('sanitization does not mutate credentials but strips markup from content', () => {
        const req = { body: { password: '<Strong>Password!', notes: '<script>alert(1)</script>Safe' }, query: {}, params: {} };
        const next = jest.fn();
        sanitizeInput(req, {}, next);
        expect(req.body.password).toBe('<Strong>Password!');
        expect(req.body.notes).not.toContain('<script>');
        expect(next).toHaveBeenCalled();
    });

    test('invoice schemas require discount and void reasons and reject client-derived statuses', () => {
        expect(createInvoiceSchema.safeParse({ patientId: crypto.randomUUID(), discountAmount: 5 }).success).toBe(false);
        expect(updateInvoiceSchema.safeParse({ invoiceStatus: 'Paid' }).success).toBe(false);
        expect(updateInvoiceSchema.safeParse({ invoiceStatus: 'Voided' }).success).toBe(false);
        expect(updateInvoiceSchema.safeParse({ invoiceStatus: 'Voided', voidReason: 'Duplicate invoice' }).success).toBe(true);
        expect(updateInvoiceSchema.safeParse({ discountAmount: 0 }).success).toBe(true);
        expect(collectPaymentSchema.safeParse({ amount: 0, discountAmount: 5, discountReason: 'Courtesy adjustment' }).success).toBe(true);
        expect(collectPaymentSchema.safeParse({ amount: 20, method: 'Card' }).success).toBe(false);
        expect(collectPaymentSchema.safeParse({ amount: 20, method: 'Card', paymentReference: 'AUTH-123' }).success).toBe(true);
        expect(getInvoicesQuerySchema.safeParse({ startDate: '2026-08-01', endDate: '2026-07-01' }).success).toBe(false);
    });

    test('finance schemas protect posting dates and tax math', () => {
        expect(createExpenseSchema.safeParse({
            categoryId: crypto.randomUUID(),
            amount: 100,
            taxAmount: 120,
            expenseDate: '2026-07-30'
        }).success).toBe(false);
        expect(createExpenseSchema.safeParse({
            categoryId: crypto.randomUUID(),
            amount: '100.50',
            taxAmount: '14.00',
            expenseDate: '2026-07-30',
            idempotencyKey: crypto.randomUUID()
        }).success).toBe(true);
        expect(getFinancialClosuresQuerySchema.safeParse({ startDate: '2026-07-31', endDate: '2026-07-01' }).success).toBe(false);
        expect(financialReportQuerySchema.safeParse({ groupBy: 'week' }).success).toBe(true);
        expect(financialReportQuerySchema.safeParse({ groupBy: 'quarter' }).success).toBe(false);
        expect(journalLedgerQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
        expect(journalLedgerQuerySchema.safeParse({ accountCode: '1100', sourceType: 'Invoice', sourceTypePrefix: 'InvoiceAdjustment:', limit: '100' }).success).toBe(true);
        expect(normalizeRange({ start: '2026-07-30', end: '2026-07-30' })).toMatchObject({
            start: '2026-07-30',
            end: '2026-07-30',
            asOf: '2026-07-30'
        });
    });

    test('discount report flags high-risk and incomplete discount approvals', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    {
                        invoice_id: 'invoice-1',
                        invoice_number: 'INV-001',
                        period: '2026-07-27',
                        business_date: '2026-07-30',
                        subtotal_amount: '100.00',
                        discount_amount: '45.00',
                        fixed_discount_amount: '45.00',
                        percentage_discount_amount: '0.00',
                        discount_percentage: '0',
                        discount_reason: '',
                        discount_approved_by: null,
                        approved_by_name: null,
                        effective_rate: '45.00'
                    },
                    {
                        invoice_id: 'invoice-2',
                        invoice_number: 'INV-002',
                        period: '2026-07-27',
                        business_date: '2026-07-30',
                        subtotal_amount: '100.00',
                        discount_amount: '100.00',
                        fixed_discount_amount: '0.00',
                        percentage_discount_amount: '100.00',
                        discount_percentage: '100',
                        discount_reason: 'Management waiver',
                        discount_approved_by: 'user-1',
                        approved_by_name: 'Finance Manager',
                        effective_rate: '100.00'
                    }
                ]
            })
        };

        const report = await getDiscountReport(db, {
            startDate: '2026-07-01',
            endDate: '2026-07-31',
            groupBy: 'week',
            branchId: 'branch-1'
        });

        expect(db.query.mock.calls[0][0]).toContain("date_trunc('week'");
        expect(db.query.mock.calls[0][1]).toEqual(['2026-07-01', '2026-07-31', 'branch-1']);
        expect(report.summary).toMatchObject({
            discounted_invoices: 2,
            flagged_invoices: 2,
            total_discount: 145,
            average_rate: 72.5
        });
        expect(report.items[0].flags).toEqual(['HIGH_RATE', 'NO_REASON', 'NO_APPROVAL']);
        expect(report.items[1].flags).toEqual(['HIGH_RATE', 'FULL_WAIVER']);
        expect(report.by_period[0]).toMatchObject({
            period: '2026-07-27',
            group_by: 'week',
            discount_total: 145,
            invoice_count: 2,
            flagged_count: 2
        });
        expect(report.by_approver).toEqual(expect.arrayContaining([
            expect.objectContaining({ approver: null, discount_total: 45, flagged_count: 1 }),
            expect.objectContaining({ approver: 'Finance Manager', discount_total: 100, flagged_count: 1 })
        ]));
    });

    test('claims require evidence for denial, resubmission, and payment', () => {
        expect(updateClaimStatusSchema.safeParse({ status: 'Rejected' }).success).toBe(false);
        expect(updateClaimStatusSchema.safeParse({ status: 'Resubmitted' }).success).toBe(false);
        expect(updateClaimStatusSchema.safeParse({ status: 'Paid' }).success).toBe(false);
        expect(updateClaimStatusSchema.safeParse({ status: 'Paid', receivedAmount: 10 }).success).toBe(true);
    });

    test('commission and expense reversal commands require replay and audit controls', () => {
        const payout = { doctorId: crypto.randomUUID(), amount: 10 };
        expect(payCommissionSchema.safeParse(payout).success).toBe(false);
        expect(payCommissionSchema.safeParse({ ...payout, idempotencyKey: crypto.randomUUID() }).success).toBe(true);
        expect(reverseExpenseSchema.safeParse({ reason: 'no' }).success).toBe(false);
        expect(reverseExpenseSchema.safeParse({ reason: 'Duplicate receipt' }).success).toBe(true);
    });

    test('follow-up appointments require an explicit prior examination link', () => {
        const baseAppointment = {
            patientId: crypto.randomUUID(),
            modalityId: crypto.randomUUID(),
            examTypeId: crypto.randomUUID(),
            startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        };

        expect(createAppointmentSchema.safeParse({ ...baseAppointment, isFollowUp: true }).success).toBe(false);
        expect(createAppointmentSchema.safeParse({
            ...baseAppointment,
            isFollowUp: true,
            priorExamId: crypto.randomUUID(),
            followUpReason: 'Interval assessment after treatment'
        }).success).toBe(true);
        expect(createAppointmentSchema.safeParse(baseAppointment).success).toBe(true);
    });

    test('appointment nullable UUID fields normalize form null strings', () => {
        const parsed = updateAppointmentSchema.parse({
            status: 'Checked-in',
            referringDoctorId: 'null',
            technicianId: 'undefined',
            nurseId: '',
            radiologistId: null
        });

        expect(parsed.referringDoctorId).toBeNull();
        expect(parsed.technicianId).toBeNull();
        expect(parsed.nurseId).toBeNull();
        expect(parsed.radiologistId).toBeNull();
    });

    test('appointment booleans are parsed strictly and terminal workflow statuses are rejected', () => {
        const baseAppointment = {
            patientId: crypto.randomUUID(),
            modalityId: crypto.randomUUID(),
            startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            contrastRequired: 'false',
            arrived: 'false'
        };

        const parsed = createAppointmentSchema.parse(baseAppointment);
        expect(parsed.contrastRequired).toBe(false);
        expect(parsed.arrived).toBe(false);
        expect(updateAppointmentSchema.safeParse({ status: 'Cancelled' }).success).toBe(false);
        expect(updateAppointmentSchema.safeParse({ cancellationReason: 'Bypass' }).success).toBe(false);
    });

    test('inventory quantity changes require movement workflows', () => {
        expect(updateInventoryStockSchema.safeParse({ quantity: 50 }).success).toBe(false);
        expect(updateInventoryStockSchema.safeParse({}).success).toBe(false);
        expect(updateInventoryStockSchema.safeParse({ minLevel: 5 }).success).toBe(true);
    });

    test('insurance authorization creation cannot self-approve or inject a decision amount', () => {
        const base = { patientId: crypto.randomUUID(), providerId: crypto.randomUUID() };
        expect(approvalSchema.safeParse({ ...base, status: 'Approved' }).success).toBe(false);
        expect(approvalSchema.safeParse({ ...base, approvedAmount: 100 }).success).toBe(false);
        expect(approvalSchema.safeParse({ ...base, status: 'Pending', requestedAmount: 100 }).success).toBe(true);
    });

    test('calendar date validation rejects normalized-but-impossible dates', () => {
        expect(isValidCalendarDate('2026-02-28')).toBe(true);
        expect(isValidCalendarDate('2026-02-30')).toBe(false);
        expect(isValidCalendarDate('2026-13-01')).toBe(false);
    });

    test('report finalization may validate against persisted report sections', () => {
        expect(updateExamReportSchema.safeParse({
            examId: crypto.randomUUID(),
            status: 'Finalized'
        }).success).toBe(true);
    });

    test('backup paths reject traversal and permit encrypted dump artifacts', () => {
        expect(isValidBackupFilename('../../secret.dump')).toBe(false);
        expect(isValidBackupFilename('VIARA_pg_20260704.dump.enc')).toBe(true);
        expect(resolveBackupPath('../../secret.dump')).toBeNull();
    });

    test('development JSON restore is explicitly gated and validates snapshot shape', () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousBackupMode = process.env.BACKUP_MODE;
        const previousJsonRestore = process.env.BACKUP_JSON_RESTORE_ENABLED;

        try {
            process.env.NODE_ENV = 'production';
            process.env.BACKUP_MODE = 'json';
            expect(isJsonRestoreAllowed()).toBe(false);

            process.env.NODE_ENV = 'development';
            process.env.BACKUP_MODE = 'postgres';
            expect(isJsonRestoreAllowed()).toBe(false);

            process.env.BACKUP_MODE = 'json';
            expect(isJsonRestoreAllowed()).toBe(true);

            process.env.BACKUP_JSON_RESTORE_ENABLED = 'false';
            expect(isJsonRestoreAllowed()).toBe(false);

            expect(() => validateJsonBackupPayload({ data: { users: [] } })).not.toThrow();
            expect(() => validateJsonBackupPayload({ data: { unknown_table: [] } })).toThrow('unsupported tables');
            expect(() => validateJsonBackupPayload({ data: { users: [{}], patients: 'bad' } })).toThrow('must be an array');
        } finally {
            process.env.NODE_ENV = previousNodeEnv;
            process.env.BACKUP_MODE = previousBackupMode;
            if (previousJsonRestore === undefined) {
                delete process.env.BACKUP_JSON_RESTORE_ENABLED;
            } else {
                process.env.BACKUP_JSON_RESTORE_ENABLED = previousJsonRestore;
            }
        }
    });

    test('mock integrations fail closed in production', async () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        await expect(new IntegrationService({}).sendSMS('+201000000000', 'test')).rejects.toThrow('disabled in production');
        process.env.NODE_ENV = previous;
    });

    test('notification template rendering removes unresolved unknown values safely', () => {
        expect(renderTemplate('Hello {{name}} {{missing}}', { name: 'Alice' })).toBe('Hello Alice ');
    });

    test('offsite backup replicator reports not-configured when env vars missing', async () => {
        const { isConfigured, replicateBackup } = require('../src/services/backupOffsiteReplicator');
        delete process.env.BACKUP_OFFSITE_ENDPOINT;
        delete process.env.BACKUP_OFFSITE_BUCKET;
        delete process.env.BACKUP_OFFSITE_ACCESS_KEY;
        delete process.env.BACKUP_OFFSITE_SECRET_KEY;
        expect(isConfigured()).toBe(false);
        const result = await replicateBackup({ filename: 'test.dump.enc', filepath: '/tmp/nonexistent' });
        expect(result.replicated).toBe(false);
        expect(result.reason).toBe('not_configured');
    });

    test('offsite backup replicator reports source_not_found for missing file', async () => {
        const { isConfigured, replicateBackup } = require('../src/services/backupOffsiteReplicator');
        process.env.BACKUP_OFFSITE_ENDPOINT = 's3.example.com';
        process.env.BACKUP_OFFSITE_BUCKET = 'test-bucket';
        process.env.BACKUP_OFFSITE_ACCESS_KEY = 'test';
        process.env.BACKUP_OFFSITE_SECRET_KEY = 'test';
        try {
            expect(isConfigured()).toBe(true);
            const result = await replicateBackup({ filename: 'test.dump.enc', filepath: '/tmp/nonexistent_file' });
            expect(result.replicated).toBe(false);
            expect(result.reason).toBe('source_not_found');
        } finally {
            delete process.env.BACKUP_OFFSITE_ENDPOINT;
            delete process.env.BACKUP_OFFSITE_BUCKET;
            delete process.env.BACKUP_OFFSITE_ACCESS_KEY;
            delete process.env.BACKUP_OFFSITE_SECRET_KEY;
        }
    });

    test('receivables aging uses canonical status and as-of patient and insurer balances', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ total_outstanding: 0 }] }) };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getReceivablesAging(db)({}, res, next);

        const sql = db.query.mock.calls[0][0];
        expect(sql).toContain("i.invoice_status <> 'Voided'");
        expect(sql).toContain('claim_receipts');
        expect(sql).toContain('credit_notes');
        expect(sql).toContain('patient_balance');
        expect(sql).not.toContain("i.status = 'Pending'");
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total_outstanding: 0 }));
        expect(next).not.toHaveBeenCalled();
    });

    test('outstanding claims are branch and as-of scoped', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getOutstandingClaims(db)({
            query: {
                startDate: '2026-07-01',
                endDate: '2026-07-30',
                branchId: '00000000-0000-4000-8000-000000000001'
            }
        }, res, next);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('i.branch_id = $1');
        expect(sql).toContain('i.business_date BETWEEN $3::date AND $2::date');
        expect(sql).toContain('cr.business_date <= $2::date');
        expect(params).toEqual([
            '00000000-0000-4000-8000-000000000001',
            '2026-07-30',
            '2026-07-01'
        ]);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(next).not.toHaveBeenCalled();
    });

    test('trial balance summarizes debits and credits with a balanced signal', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    { account_code: '1000', account_name: 'Cash', debit: 100, credit: 0, net_balance: 100 },
                    { account_code: '4000', account_name: 'Revenue', debit: 0, credit: 100, net_balance: -100 }
                ]
            })
        };

        const result = await getTrialBalance(db, { startDate: '2026-07-01', endDate: '2026-07-30' });

        expect(db.query.mock.calls[0][0]).toContain('journal_entries');
        expect(result).toMatchObject({
            total_debit: 100,
            total_credit: 100,
            difference: 0,
            is_balanced: true
        });
    });

    test('journal ledger applies account and source filters with paging', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ entry_id: 'entry-1', debit: 10, credit: 0 }] })
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        };

        const result = await getJournalLedger(db, {
            startDate: '2026-07-01',
            endDate: '2026-07-30',
            accountCode: '1100',
            sourceType: 'Invoice',
            limit: 25,
            offset: 5
        });

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('je.account_code');
        expect(sql).toContain('jb.source_type');
        expect(params).toEqual([
            '2026-07-01',
            '2026-07-30',
            '00000000-0000-4000-8000-000000000001',
            '1100',
            'Invoice',
            25,
            5
        ]);
        expect(result).toMatchObject({ total_count: 1, limit: 25, offset: 5 });
    });

    test('journal ledger supports source type prefix filters for dynamic posting sources', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ entry_id: 'entry-1', debit: 0, credit: 10 }] })
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        };

        await getJournalLedger(db, {
            startDate: '2026-07-01',
            endDate: '2026-07-30',
            sourceTypePrefix: 'InvoiceAdjustment:',
            limit: 50,
            offset: 0
        });

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('jb.source_type LIKE');
        expect(params).toEqual([
            '2026-07-01',
            '2026-07-30',
            '00000000-0000-4000-8000-000000000001',
            'InvoiceAdjustment:%',
            50,
            0
        ]);
    });

    test('patient portal invoice balances include refunds and unreversed credit notes', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getMyInvoices(db)({ user: { userId: 'patient-1' } }, res, next);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('refunded_amount');
        expect(sql).toContain('credited_amount');
        expect(sql).toContain('credit_notes');
        expect(sql).toContain('reversed_at IS NULL');
        expect(sql).toContain('GREATEST');
        expect(params).toEqual(['patient-1']);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(next).not.toHaveBeenCalled();
    });

    test('queue payment gate treats credit notes as settled patient balance', async () => {
        const examId = '00000000-0000-4000-8000-000000000101';
        const appointmentId = '00000000-0000-4000-8000-000000000102';
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
                if (text.includes('FROM examinations e')) {
                    return {
                        rows: [{
                            exam_id: examId,
                            appointment_id: appointmentId,
                            queue_stage: 'Payment Pending',
                            current_station: 'Cashier',
                            priority: 'Routine',
                            is_on_hold: false
                        }]
                    };
                }
                if (text.includes('WITH latest_invoice')) {
                    return {
                        rows: [{
                            invoice_id: '00000000-0000-4000-8000-000000000103',
                            invoice_status: 'Partial',
                            patient_payable_amount: '100.00',
                            paid_amount: '70.00',
                            refunded_amount: '0.00',
                            credited_amount: '30.00'
                        }]
                    };
                }
                if (text.includes('WITH totals')) {
                    return {
                        rows: [{
                            invoice_id: '00000000-0000-4000-8000-000000000103',
                            invoice_number: 'INV-001',
                            invoice_status: 'Paid',
                            patient_payable_amount: '100.00',
                            paid_amount: '70.00',
                            refunded_amount: '0.00',
                            credited_amount: '30.00',
                            net_paid_amount: '70.00',
                            balance_amount: '0.00'
                        }]
                    };
                }
                if (text.includes('UPDATE examinations')) {
                    return { rows: [{ exam_id: examId, queue_stage: 'Ready for Exam' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await transitionQueue({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId },
            body: { toStage: 'Ready for Exam' },
            user: { user_id: 'nurse-1', role: 'Nurse' }
        }, res, next);

        const invoiceSql = client.query.mock.calls
            .map(([sql]) => String(sql))
            .find((sql) => sql.includes('WITH latest_invoice'));
        expect(invoiceSql).toContain('credit_notes');
        expect(invoiceSql).toContain('credited_amount');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ queue_stage: 'Ready for Exam' }));
        expect(next).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalled();
    });

    test.each([
        ['Receptionist', 'In Exam'],
        ['Receptionist', 'Delivered'],
        ['Accountant', 'In Exam'],
        ['Accountant', 'Delivered'],
        ['Nurse', 'In Exam'],
        ['Nurse', 'Cancelled'],
        ['Technician', 'Finalized'],
        ['Technician', 'Cancelled'],
        ['Radiologist', 'In Exam']
    ])('%s cannot move a queue item into %s', async (role, toStage) => {
        const examId = '00000000-0000-4000-8000-000000000111';
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('FROM examinations e')) {
                    return {
                        rows: [{
                            exam_id: examId,
                            appointment_id: '00000000-0000-4000-8000-000000000112',
                            queue_stage: toStage === 'Delivered' ? 'Finalized' : 'Ready for Exam',
                            current_station: 'Modality',
                            priority: 'Emergency',
                            is_on_hold: false
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const res = createResponse();
        const next = jest.fn();

        await transitionQueue({ connect: jest.fn().mockResolvedValue(client) })({
            params: { examId },
            body: { toStage },
            user: { user_id: `${role.toLowerCase()}-1`, role }
        }, res, next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 403,
            message: 'Your role cannot move an item to this queue stage'
        }));
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE examinations'))).toBe(false);
        expect(res.json).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalled();
    });

    test('queue KPIs use the full filtered result set instead of the paginated rows', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('WITH filtered_queue AS')) {
                    return {
                        rows: [{
                            total: 12,
                            on_hold: 3,
                            overdue: 4,
                            average_waiting_minutes: 27,
                            average_turnaround_minutes: 91,
                            by_stage: { 'Ready for Exam': 12 }
                        }]
                    };
                }
                return {
                    rows: [{
                        exam_id: '00000000-0000-4000-8000-000000000113',
                        queue_stage: 'Ready for Exam',
                        waiting_minutes: 5,
                        turnaround_minutes: 10,
                        is_on_hold: false
                    }]
                };
            })
        };
        const res = createResponse();
        const next = jest.fn();

        await getQueue(db)({
            query: { stage: 'Ready for Exam', priority: 'Routine', offset: '1', limit: '1' },
            user: { user_id: 'technician-1', role: 'Technician' }
        }, res, next);

        expect(db.query).toHaveBeenCalledTimes(2);
        const [pageSql, pageValues] = db.query.mock.calls[0];
        const [kpiSql, kpiValues] = db.query.mock.calls[1];
        expect(pageSql).toContain('LIMIT $4 OFFSET $5');
        expect(pageValues).toEqual(['Ready for Exam', 'Routine', 'technician-1', 1, 1]);
        expect(kpiSql).toContain('WITH filtered_queue AS');
        expect(kpiSql).not.toContain('LIMIT $4 OFFSET $5');
        expect(kpiSql).toContain('(a.technician_id = $3 OR a.technician_id IS NULL)');
        expect(kpiValues).toEqual(['Ready for Exam', 'Routine', 'technician-1']);
        expect(res.json).toHaveBeenCalledWith({
            data: [expect.objectContaining({ exam_id: '00000000-0000-4000-8000-000000000113' })],
            kpis: {
                total: 12,
                onHold: 3,
                overdue: 4,
                averageWaitingMinutes: 27,
                averageTurnaroundMinutes: 91,
                byStage: { 'Ready for Exam': 12 }
            }
        });
        expect(next).not.toHaveBeenCalled();
    });

    test('restricted transactions require an approved exception for remaining partial balances', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('WITH totals')) {
                    return {
                        rows: [{
                            invoice_id: '00000000-0000-4000-8000-000000000104',
                            invoice_number: 'INV-002',
                            invoice_status: 'Partial',
                            patient_payable_amount: '100.00',
                            paid_amount: '60.00',
                            refunded_amount: '0.00',
                            credited_amount: '0.00',
                            net_paid_amount: '60.00',
                            balance_amount: '40.00'
                        }]
                    };
                }
                if (text.includes('partial_payment_exceptions')) {
                    return { rows: [] };
                }
                return { rows: [] };
            })
        };

        await expect(assertInvoiceTransactionAllowed(db, {
            invoiceId: '00000000-0000-4000-8000-000000000104',
            transactionType: 'ClinicalQueueTransition',
            targetStage: 'Ready for Exam',
            transactionLabel: 'moving this exam forward'
        })).rejects.toMatchObject({
            statusCode: 409,
            details: expect.objectContaining({
                code: 'PARTIAL_PAYMENT_EXCEPTION_REQUIRED',
                balanceAmount: 40
            })
        });
    });

    test('approved partial payment exceptions unlock clinical movement but not final delivery', async () => {
        const db = {
            query: jest.fn(async (sql, params) => {
                const text = String(sql);
                if (text.includes('WITH totals')) {
                    return {
                        rows: [{
                            invoice_id: params[0],
                            invoice_number: 'INV-003',
                            invoice_status: 'Partial',
                            patient_payable_amount: '250.00',
                            paid_amount: '150.00',
                            refunded_amount: '0.00',
                            credited_amount: '0.00',
                            net_paid_amount: '150.00',
                            balance_amount: '100.00'
                        }]
                    };
                }
                if (text.includes('UPDATE partial_payment_exceptions')) return { rows: [] };
                if (text.includes('partial_payment_exceptions')) {
                    return params[1] === 'ClinicalQueueTransition' && params[2] === 'Ready for Exam'
                        ? { rows: [{ exception_id: 'exception-1', transaction_type: params[1], status: 'Approved' }] }
                        : { rows: [] };
                }
                return { rows: [] };
            })
        };

        await expect(assertInvoiceTransactionAllowed(db, {
            invoiceId: '00000000-0000-4000-8000-000000000105',
            transactionType: 'ClinicalQueueTransition',
            targetStage: 'Ready for Exam',
            transactionLabel: 'moving this exam forward'
        })).resolves.toMatchObject({
            allowed: true,
            exception: expect.objectContaining({ status: 'Approved' })
        });
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("SET status = 'Used'"),
            ['exception-1', 'Ready for Exam']
        );

        await expect(assertInvoiceFullyPaid(db, {
            invoiceId: '00000000-0000-4000-8000-000000000105',
            transactionType: 'ResultDelivery',
            transactionLabel: 'delivering this result'
        })).rejects.toMatchObject({
            details: expect.objectContaining({
                code: 'FINAL_DELIVERY_BALANCE_REQUIRED',
                balanceAmount: 100
            })
        });
    });

    test('partial payment exception approval uses one SQL type for status parameter', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
                if (text.includes('FOR UPDATE')) {
                    return {
                        rows: [{
                            exception_id: '04c43fb6-b232-417e-b342-fab048e00a2c',
                            status: 'Pending',
                            requested_by: '11111111-1111-4111-8111-111111111111'
                        }]
                    };
                }
                if (text.includes('UPDATE partial_payment_exceptions')) {
                    return {
                        rows: [{
                            exception_id: '04c43fb6-b232-417e-b342-fab048e00a2c',
                            status: 'Approved'
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn(async () => client), query: jest.fn() };
        const res = createResponse();
        const next = jest.fn();

        await reviewPartialPaymentException(db)({
            params: { id: '04c43fb6-b232-417e-b342-fab048e00a2c' },
            body: { status: 'Approved', reviewNotes: 'Manager approved partial movement.' },
            user: { user_id: '22222222-2222-4222-8222-222222222222', role: 'Accountant' }
        }, res, next);

        const updateSql = client.query.mock.calls
            .map(([sql]) => String(sql))
            .find((sql) => sql.includes('UPDATE partial_payment_exceptions'));
        expect(updateSql).toContain('status = $1::varchar(20)');
        expect(updateSql).toContain("WHEN $1::varchar(20) = 'Approved'");
        expect(updateSql).not.toContain('$1::text');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'Approved' }));
        expect(next).not.toHaveBeenCalled();
    });
});

describe('RBAC permission cache', () => {
    test('refreshPermissionCache populates cache from database', async () => {
        const { refreshPermissionCache, permissionCache } = require('../src/middleware/rbacMiddleware');

        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    { role_name: 'Admin', permission_name: 'MANAGE_USERS' },
                    { role_name: 'Radiologist', permission_name: 'READ_REPORTS' }
                ]
            })
        };

        await refreshPermissionCache(db);

        expect(permissionCache.get('Admin')).toContain('MANAGE_USERS');
        expect(permissionCache.get('Radiologist')).toContain('READ_REPORTS');
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('refreshPermissionCache skips concurrent refresh', async () => {
        const { refreshPermissionCache } = require('../src/middleware/rbacMiddleware');

        let resolveFirst;
        const db1 = {
            query: jest.fn().mockImplementation(() => new Promise((resolve) => { resolveFirst = resolve; }))
        };
        const db2 = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        const p1 = refreshPermissionCache(db1);
        await Promise.resolve();
        await Promise.resolve();

        await refreshPermissionCache(db2);

        expect(db2.query).not.toHaveBeenCalled();

        resolveFirst({ rows: [] });
        await p1;
    });

    test('refreshPermissionCache recovers and allows subsequent refreshes after error', async () => {
        const { refreshPermissionCache } = require('../src/middleware/rbacMiddleware');

        const db1 = {
            query: jest.fn().mockRejectedValue(new Error('DB connection failed'))
        };

        await expect(refreshPermissionCache(db1)).resolves.toBeUndefined();
        expect(db1.query).toHaveBeenCalledTimes(1);

        const db2 = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };

        await refreshPermissionCache(db2);
        expect(db2.query).toHaveBeenCalledTimes(1);
    });
});
