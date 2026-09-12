jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn(async () => ({ scheduled: 0 })),
    triggerEventForRole: jest.fn(async () => ({ recipients: 0, scheduled: 0 })),
}));
jest.mock('../src/services/financialPostingService', () => ({
    calculateInvoiceTotals: jest.fn(() => ({ discount: 0, fixedDiscount: 0, percentageDiscount: 0, tax: 0, total: 0, insurance: 0, patientPayable: 0 })),
    invoiceDiscountComponents: jest.fn(() => ({ fixedDiscount: 0, percentageDiscount: 0 })),
    issueRefundCreditNote: jest.fn(async () => ({ net_amount: 100, tax_amount: 0 })),
    lockFinancialBusinessDate: jest.fn(async () => ({ businessDate: '2026-09-05', branchId: '00000000-0000-4000-8000-000000000001' })),
    moneyNumber: jest.fn((value) => Number(value || 0)),
    postJournalBatch: jest.fn(async () => undefined),
    requestFingerprint: jest.fn(() => 'fingerprint'),
}));

const { refundInvoice, reviewRefund } = require('../src/controllers/invoiceController');
const { refundSchema, reviewRefundSchema } = require('../src/schemas/invoiceSchema');

const USER_ID = '00000000-0000-4000-8000-000000000901';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000902';
const INVOICE_ID = '00000000-0000-4000-8000-000000000903';
const PAYMENT_ID = '00000000-0000-4000-8000-000000000904';
const REFUND_ID = '00000000-0000-4000-8000-000000000905';
const BRANCH_ID = '00000000-0000-4000-8000-000000000002';
const IDEMPOTENCY_KEY = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const invoiceRow = {
    invoice_id: INVOICE_ID,
    invoice_number: 'INV-100',
    invoice_status: 'Paid',
    patient_id: '00000000-0000-4000-8000-000000000909',
    branch_id: BRANCH_ID,
    currency_code: 'EGP'
};

const paymentRow = {
    payment_id: PAYMENT_ID,
    invoice_id: INVOICE_ID,
    amount: 1000,
    method: 'Card',
    payment_status: 'Completed'
};

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

const makeReq = (overrides = {}) => ({
    params: { id: INVOICE_ID },
    body: {},
    user: { user_id: USER_ID, role: 'Receptionist' },
    ip: '127.0.0.1',
    get: jest.fn(() => IDEMPOTENCY_KEY),
    ...overrides,
});

// Minimal SQL router: each handler matches a distinctive fragment of the
// statement the controller issues, in controller execution order.
const makeClient = (routes) => {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        const text = String(sql);
        calls.push({ text, params });
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return ok();
        for (const [fragment, handler] of routes) {
            if (text.includes(fragment)) return handler(params, text);
        }
        throw new Error(`Unexpected SQL: ${text.slice(0, 120)}`);
    });
    return {
        query,
        calls,
        release: jest.fn(),
        _routes: routes
    };
};

const ok = (rows = []) => ({ rows });

describe('refund lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('refund request', () => {
        test('rejects a refund method that differs from the original payment method', async () => {
            const client = makeClient([
                ['FROM invoices', () => ok([invoiceRow])],
                ['financial_operation_keys', () => ok([{ operation_key_id: 'op-1' }])],
                ['FROM role_permissions', () => ok([{ 1: 1 }])],
                ['AS reserved_refund_amount', () => ok([{ paid_amount: 1000, reserved_refund_amount: 0 }])],
                ['FROM payments', () => ok([paymentRow])],
                ['AS reserved_amount', () => ok([{ reserved_amount: 0 }])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await refundInvoice(db)(makeReq({ body: { paymentId: PAYMENT_ID, amount: 100, method: 'Cash', reason: 'patient cancelled' } }), res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, message: 'Refund method must match the original payment method' }));
            expect(res.json).not.toHaveBeenCalled();
        });

        test('uses the original payment method and stamps request-time branch and currency', async () => {
            let insertParams = null;
            const client = makeClient([
                ['FROM invoices', () => ok([invoiceRow])],
                ['financial_operation_keys', () => ok([{ operation_key_id: 'op-1' }])],
                ['FROM role_permissions', () => ok([{ 1: 1 }])],
                ['AS reserved_refund_amount', () => ok([{ paid_amount: 1000, reserved_refund_amount: 0 }])],
                ['FROM payments', () => ok([paymentRow])],
                ['AS reserved_amount', () => ok([{ reserved_amount: 0 }])],
                ['INSERT INTO refunds', (params) => {
                    insertParams = params;
                    return ok([{ refund_id: REFUND_ID, status: 'Pending', method: 'Card' }]);
                }],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await refundInvoice(db)(makeReq({ body: { paymentId: PAYMENT_ID, amount: 250, reason: 'patient cancelled', reasonCode: 'PatientCancelled' } }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(insertParams[3]).toBe('Card');
            expect(insertParams[5]).toBe('PatientCancelled');
            expect(insertParams[11]).toBe(BRANCH_ID);
            expect(insertParams[12]).toBe('EGP');
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('fails validation when no specific payment is targeted', () => {
            const parsed = refundSchema.safeParse({ amount: 100, reason: 'patient cancelled' });
            expect(parsed.success).toBe(false);
        });

        test('does not count Failed refunds against the refundable balance', async () => {
            let totalsSql = null;
            const client = makeClient([
                ['FROM invoices', () => ok([invoiceRow])],
                ['financial_operation_keys', () => ok([{ operation_key_id: 'op-1' }])],
                ['FROM role_permissions', () => ok([{ 1: 1 }])],
                ['AS reserved_refund_amount', (_params, text) => {
                    totalsSql = text;
                    return ok([{ paid_amount: 1000, reserved_refund_amount: 0 }]);
                }],
                ['FROM payments', () => ok([paymentRow])],
                ['AS reserved_amount', (_params, text) => {
                    totalsSql = text;
                    return ok([{ reserved_amount: 0 }]);
                }],
                ['INSERT INTO refunds', () => ok([{ refund_id: REFUND_ID, status: 'Pending' }])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await refundInvoice(db)(makeReq({ body: { paymentId: PAYMENT_ID, amount: 1000, reason: 'full refund after failure' } }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(totalsSql).toContain("status NOT IN ('Rejected', 'Failed')");
        });
    });

    describe('refund review', () => {
        const refundRow = (status, overrides = {}) => ({
            refund_id: REFUND_ID,
            invoice_id: INVOICE_ID,
            payment_id: PAYMENT_ID,
            amount: 250,
            method: 'Card',
            reason: 'patient cancelled',
            status,
            requested_by: REQUESTER_ID,
            business_date: '2026-09-05',
            branch_id: BRANCH_ID,
            currency_code: 'EGP',
            ...overrides
        });

        const makeReviewClient = (refund, { approver = true, processor = true } = {}) => {
            let updateParams = null;
            const client = makeClient([
                ['SELECT * FROM refunds WHERE refund_id', () => ok([refund])],
                ['FROM role_permissions', (_params) => ok([{ 1: 1 }])],
                ['SELECT * FROM invoices WHERE invoice_id', () => ok([invoiceRow])],
                ['AS processed_amount', () => ok([{ paid_amount: 1000, processed_amount: 0 }])],
                ['UPDATE refunds', (params) => {
                    updateParams = params;
                    return ok([{ ...refund, status: params[0] }]);
                }],
            ]);
            return { client, getUpdateParams: () => updateParams };
        };

        test('marks an approved refund as failed with a recorded failure reason', async () => {
            const { client, getUpdateParams } = makeReviewClient(refundRow('Approved'));
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await reviewRefund(db)(makeReq({ params: { id: REFUND_ID }, body: { status: 'Failed', reason: 'card provider rejected the reversal' } }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(getUpdateParams()[0]).toBe('Failed');
            const updateSql = client.calls.find((call) => call.text.includes('UPDATE refunds')).text;
            expect(updateSql).toContain('failure_reason = CASE');
            expect(updateSql).not.toContain('branch_id = CASE');
            // No financial posting happens on failure.
            const { postJournalBatch } = require('../src/services/financialPostingService');
            expect(postJournalBatch).not.toHaveBeenCalled();
        });

        test('allows re-approving a failed refund but not by its requester', async () => {
            const { client } = makeReviewClient(refundRow('Failed'));
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await reviewRefund(db)(makeReq({
                params: { id: REFUND_ID },
                body: { status: 'Approved', reason: 'cause fixed, retry' },
                user: { user_id: REQUESTER_ID, role: 'Receptionist' },
            }), res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        });

        test('a failed refund can be re-approved by another approver', async () => {
            const { client, getUpdateParams } = makeReviewClient(refundRow('Failed'));
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await reviewRefund(db)(makeReq({
                params: { id: REFUND_ID },
                body: { status: 'Approved', reason: 'cause fixed, retry' },
                user: { user_id: USER_ID, role: 'Admin' },
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(getUpdateParams()[0]).toBe('Approved');
        });

        test('a failed refund cannot jump directly to Processed', async () => {
            const { client } = makeReviewClient(refundRow('Failed'));
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [] })) };
            const res = createResponse();
            const next = jest.fn();

            await reviewRefund(db)(makeReq({
                params: { id: REFUND_ID },
                body: { status: 'Processed', reason: 'retry execution' },
                user: { user_id: USER_ID, role: 'Cashier' },
            }), res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 409,
                message: expect.stringContaining('cannot move from Failed to Processed')
            }));
        });

        test('accepts the Failed status in the review schema', () => {
            expect(reviewRefundSchema.safeParse({ status: 'Failed', reason: 'provider rejection' }).success).toBe(true);
            expect(reviewRefundSchema.safeParse({ status: 'Deleted', reason: 'whatever reason' }).success).toBe(false);
        });
    });
});
