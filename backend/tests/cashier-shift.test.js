jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEventForRole: jest.fn(async () => ({ recipients: 1, scheduled: 1 })),
}));
jest.mock('../src/services/financialPostingService', () => ({
    DEFAULT_BRANCH_ID: '00000000-0000-4000-8000-000000000001',
    lockFinancialBusinessDate: jest.fn(async () => ({
        businessDate: '2026-09-05',
        branchId: '00000000-0000-4000-8000-000000000001'
    })),
}));

const { logAction } = require('../src/services/auditService');
const { triggerEventForRole } = require('../src/services/notificationJobService');
const { closeShift, getReconciliation, getCurrentCashierShift } = require('../src/controllers/cashierController');

const USER_ID = '00000000-0000-4000-8000-000000000801';
const SHIFT_ID = '00000000-0000-4000-8000-000000000802';
const BRANCH_ID = '00000000-0000-4000-8000-000000000001';

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('cashier shift lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('reconciliation visibility', () => {
        test('scopes a non-supervisor to their own shifts even when passing another cashier id', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('FROM role_permissions')) return { rows: [] };
                    if (text.includes('FROM cashier_shifts s')) return { rows: [] };
                    throw new Error(`Unexpected SQL: ${text}`);
                })
            };
            const res = createResponse();
            const next = jest.fn();

            await getReconciliation(db)({
                user: { user_id: USER_ID, role: 'Receptionist' },
                query: { cashierId: '00000000-0000-4000-8000-000000000999' }
            }, res, next);

            const mainCall = db.query.mock.calls.find(([sql]) => String(sql).includes('FROM cashier_shifts s'));
            expect(mainCall[1]).toEqual([BRANCH_ID, USER_ID]);
            expect(next).not.toHaveBeenCalled();
        });

        test('lets a role holding APPROVE_SHIFT_VARIANCE browse any cashier', async () => {
            const db = {
                query: jest.fn(async (sql) => {
                    const text = String(sql);
                    if (text.includes('FROM role_permissions')) return { rows: [{ 1: 1 }] };
                    if (text.includes('FROM cashier_shifts s')) return { rows: [] };
                    throw new Error(`Unexpected SQL: ${text}`);
                })
            };
            const res = createResponse();
            const next = jest.fn();
            const otherCashier = '00000000-0000-4000-8000-000000000999';

            await getReconciliation(db)({
                user: { user_id: USER_ID, role: 'Accountant' },
                query: { cashierId: otherCashier }
            }, res, next);

            const mainCall = db.query.mock.calls.find(([sql]) => String(sql).includes('FROM cashier_shifts s'));
            expect(mainCall[1]).toEqual([BRANCH_ID, otherCashier]);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('material variance handling', () => {
        test('flags the closure for review and notifies reviewer roles', async () => {
            let closureParams = null;
            const client = {
                query: jest.fn(async (sql, params) => {
                    const text = String(sql);
                    if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
                    if (text.includes('FROM cashier_shifts s')) {
                        return {
                            rows: [{
                                shift_id: SHIFT_ID,
                                cashier_id: USER_ID,
                                cashier_name: 'Cashier One',
                                status: 'Open',
                                opening_balance: 500,
                                business_date: '2026-09-05',
                                branch_id: BRANCH_ID,
                                currency_code: 'EGP'
                            }]
                        };
                    }
                    if (text.includes('FROM payments') || text.includes('FROM refunds')) return { rows: [] };
                    if (text.includes('UPDATE cashier_shifts')) {
                        return { rows: [{ shift_id: SHIFT_ID, status: 'Closed' }] };
                    }
                    if (text.includes('INSERT INTO cashier_closures')) {
                        closureParams = params;
                        return { rows: [{ closure_id: 'closure-1', review_status: 'Requires Review' }] };
                    }
                    throw new Error(`Unexpected SQL: ${text}`);
                }),
                release: jest.fn()
            };
            const db = { connect: jest.fn(async () => client), query: jest.fn() };
            const res = createResponse();
            const next = jest.fn();

            await closeShift(db)({
                params: { id: SHIFT_ID },
                body: { countedCash: 400, varianceReason: 'short drawer', notes: 'recounted twice' },
                user: { user_id: USER_ID, role: 'Cashier' },
                ip: '127.0.0.1'
            }, res, next);

            expect(next).not.toHaveBeenCalled();
            // variance = 400 - (500 + 0) = -100, beyond the default threshold of 5
            expect(closureParams[4]).toBe(-100);
            expect(closureParams[6]).toBe('Requires Review');
            expect(logAction).toHaveBeenCalledWith(client, expect.objectContaining({
                action: 'CASHIER_SHIFT_CLOSED',
                details: expect.objectContaining({ materialVariance: true, variance: -100 })
            }));
            const notifiedRoles = triggerEventForRole.mock.calls.map(([, , role]) => role);
            expect(notifiedRoles).toEqual(['Admin', 'Accountant', 'Developer']);
            expect(triggerEventForRole).toHaveBeenCalledWith(db, 'CASHIER_VARIANCE_REQUIRES_REVIEW', 'Admin', expect.objectContaining({
                variables: expect.objectContaining({ variance: -100, cashier_name: 'Cashier One' })
            }));
        });
    });

    describe('current cashier shift', () => {
        test('returns the open shift for the authenticated user', async () => {
            const db = {
                query: jest.fn(async () => ({
                    rows: [{
                        shift_id: SHIFT_ID,
                        cashier_id: USER_ID,
                        cashier_name: 'Cashier One',
                        status: 'Open',
                        opening_balance: 300
                    }]
                }))
            };
            const res = createResponse();
            const next = jest.fn();

            await getCurrentCashierShift(db)({
                user: { user_id: USER_ID, branch_id: BRANCH_ID }
            }, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                shift_id: SHIFT_ID,
                status: 'Open'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        test('returns null when no open shift exists', async () => {
            const db = {
                query: jest.fn(async () => ({ rows: [] }))
            };
            const res = createResponse();
            const next = jest.fn();

            await getCurrentCashierShift(db)({
                user: { user_id: USER_ID, branch_id: BRANCH_ID }
            }, res, next);

            expect(res.json).toHaveBeenCalledWith(null);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
