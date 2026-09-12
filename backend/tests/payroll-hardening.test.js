jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn(async () => undefined),
}));
jest.mock('../src/services/notificationJobService', () => ({
    triggerEvent: jest.fn(async () => ({ scheduled: 0 })),
    triggerEventForRole: jest.fn(async () => ({ recipients: 0, scheduled: 0 })),
}));
jest.mock('../src/services/financialPostingService', () => ({
    DEFAULT_BRANCH_ID: '00000000-0000-4000-8000-000000000001',
    DEFAULT_CURRENCY: 'EGP',
    lockFinancialBusinessDate: jest.fn(async () => ({ businessDate: '2026-09-05', branchId: '00000000-0000-4000-8000-000000000001' })),
    moneyNumber: jest.fn((value) => Number(value || 0)),
    postJournalBatch: jest.fn(async () => ({ batch_id: 'batch-1' }))
}));

const { triggerEvent, triggerEventForRole } = require('../src/services/notificationJobService');
const {
    createPenalty,
    updatePenaltyStatus,
    acknowledgePenalty,
    resolvePenaltyDispute,
    getMyPayrollHistory,
    updateDeductionStatus,
    calculatePayroll,
    _private
} = require('../src/controllers/payrollController');
const { updatePenaltyStatusSchema, resolvePenaltyDisputeSchema } = require('../src/schemas/payrollSchema');

const USER_ID = '00000000-0000-4000-8000-000000000a01';
const CREATOR_ID = '00000000-0000-4000-8000-000000000a02';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000a03';
const PENALTY_ID = '00000000-0000-4000-8000-000000000a04';
const PERIOD_ID = '00000000-0000-4000-8000-000000000a05';
const BRANCH_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_BRANCH_ID = '00000000-0000-4000-8000-000000000002';

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

const makeReq = (overrides = {}) => ({
    params: {},
    body: {},
    query: {},
    user: { user_id: USER_ID, role: 'HR' },
    ip: '127.0.0.1',
    ...overrides
});

const ok = (rows = []) => ({ rows });

const makeClient = (routes) => {
    const calls = [];
    const query = jest.fn(async (sql, params) => {
        const text = String(sql);
        calls.push({ text, params });
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return ok();
        for (const [fragment, handler] of routes) {
            if (text.includes(fragment)) return handler(params, text);
        }
        throw new Error(`Unexpected SQL: ${text.slice(0, 140)}`);
    });
    return { query, calls, release: jest.fn() };
};

describe('payroll hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createPenalty regression (route-scoped query fix)', () => {
        test('creates a pending penalty without referencing list-query variables', async () => {
            let insertParams = null;
            const client = makeClient([
                ['FROM users u', () => ok([{ user_id: EMPLOYEE_ID }])],
                ['FROM attendance_logs', () => ok([{ 1: 1 }])],
                ['FROM payroll_periods', () => ok([{ period_id: PERIOD_ID }])],
                ['INSERT INTO employee_penalties', (params) => {
                    insertParams = params;
                    return ok([{ penalty_id: PENALTY_ID, status: 'Pending Approval' }]);
                }],
                ['INSERT INTO payroll_audit_log', () => ok()],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await createPenalty(db)(makeReq({
                body: { userId: EMPLOYEE_ID, penaltyType: 'Policy', amount: 100, reason: 'repeated no-show', source: 'Manual', currencyCode: 'EGP', incidentDate: '2026-09-01' }
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(insertParams[8]).toBe(BRANCH_ID);
        });
    });

    describe('penalty cancellation of approved records', () => {
        const penaltyRow = (overrides = {}) => ({
            penalty_id: PENALTY_ID,
            user_id: EMPLOYEE_ID,
            penalty_type: 'Policy',
            amount: 150,
            remaining_amount: 150,
            reason: 'repeated no-show',
            status: 'Approved',
            payroll_period_id: PERIOD_ID,
            branch_id: BRANCH_ID,
            acknowledgement_status: 'Pending',
            created_by: CREATOR_ID
        });

        const makeStatusClient = (penalty, periodStatus = 'Calculated') => makeClient([
            ['SELECT payroll_period_id FROM employee_penalties', () => ok([{ payroll_period_id: penalty.payroll_period_id }])],
            ['SELECT period_id FROM payroll_periods', () => ok([{ period_id: PERIOD_ID }])],
            ['SELECT * FROM employee_penalties WHERE penalty_id', () => ok([penalty])],
            ['SELECT status FROM payroll_periods', () => ok([{ status: periodStatus }])],
            ['UPDATE employee_penalties', (params) => ok([{ ...penalty, status: params[1] }])],
            ['INSERT INTO payroll_audit_log', () => ok()],
        ]);

        test('cancels an approved penalty and releases the reservation', async () => {
            const client = makeStatusClient(penaltyRow());
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await updatePenaltyStatus(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Cancelled', notes: 'approved in error, wrong employee' }
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            const updateCall = client.calls.find((call) => call.text.includes('UPDATE employee_penalties'));
            expect(updateCall.text).toContain("remaining_amount = CASE WHEN $2::varchar(30) = 'Cancelled' THEN 0");
            expect(updateCall.text).toContain("payroll_period_id = CASE WHEN $2::varchar(30) = 'Cancelled' THEN NULL");
            expect(triggerEventForRole).toHaveBeenCalledWith(db, 'PenaltyCancelled', 'HR', expect.objectContaining({
                entityType: 'EmployeePenalty'
            }));
        });

        test('blocks cancellation when the reserving run is already paid', async () => {
            const client = makeStatusClient(penaltyRow(), 'Paid');
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await updatePenaltyStatus(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Cancelled', notes: 'too late attempt' }
            }), res, next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
            expect(client.calls.some((call) => call.text.includes('UPDATE employee_penalties'))).toBe(false);
        });

        test('blocks the creator from cancelling their own penalty and requires a reason', async () => {
            const db = { connect: jest.fn(async () => makeStatusClient(penaltyRow())), query: jest.fn(async () => ok()) };

            await updatePenaltyStatus(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Cancelled', notes: 'valid reason here' },
                user: { user_id: CREATOR_ID, role: 'HR' }
            }), createResponse(), (first) => {
                expect(first).toMatchObject({ statusCode: 403 });
            });

            expect(updatePenaltyStatusSchema.safeParse({ status: 'Cancelled', notes: 'no' }).success).toBe(false);
            expect(updatePenaltyStatusSchema.safeParse({ status: 'Cancelled', notes: 'approved in error' }).success).toBe(true);
        });

        test('rejects invalid transitions like Failed to Processed equivalents', () => {
            expect(updatePenaltyStatusSchema.safeParse({ status: 'Paused' }).success).toBe(false);
        });
    });

    describe('penalty acknowledgement and dispute', () => {
        const penaltyRow = (overrides = {}) => ({
            penalty_id: PENALTY_ID,
            user_id: EMPLOYEE_ID,
            penalty_type: 'Policy',
            amount: 150,
            reason: 'repeated no-show',
            status: 'Approved',
            payroll_period_id: null,
            branch_id: BRANCH_ID,
            acknowledgement_status: 'Pending',
            created_by: CREATOR_ID,
            ...overrides
        });

        test('employee acknowledges their own penalty', async () => {
            const client = makeClient([
                ['SELECT * FROM employee_penalties WHERE penalty_id', () => ok([penaltyRow()])],
                ['UPDATE employee_penalties', (params) => ok([{ ...penaltyRow(), acknowledgement_status: params[1] }])],
                ['INSERT INTO payroll_audit_log', () => ok()],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await acknowledgePenalty(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Acknowledged' },
                user: { user_id: EMPLOYEE_ID, role: 'Technician' }
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ acknowledgement_status: 'Acknowledged' }));
        });

        test('another employee cannot acknowledge someone else penalty', async () => {
            const client = makeClient([
                ['SELECT * FROM employee_penalties WHERE penalty_id', () => ok([penaltyRow()])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const next = jest.fn();

            await acknowledgePenalty(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Acknowledged' },
                user: { user_id: USER_ID, role: 'Technician' }
            }), createResponse(), next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        });

        test('dispute records the reason and notifies HR and Admin', async () => {
            const client = makeClient([
                ['SELECT * FROM employee_penalties WHERE penalty_id', () => ok([penaltyRow()])],
                ['UPDATE employee_penalties', (params) => ok([{ ...penaltyRow(), acknowledgement_status: 'Disputed' }])],
                ['INSERT INTO payroll_audit_log', () => ok()],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await acknowledgePenalty(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Disputed', reason: 'I was on approved leave that day' },
                user: { user_id: EMPLOYEE_ID, role: 'Technician' }
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(triggerEventForRole).toHaveBeenCalledWith(db, 'PenaltyDisputed', 'HR', expect.objectContaining({
                variables: expect.objectContaining({ dispute_reason: 'I was on approved leave that day' })
            }));
            expect(triggerEventForRole).toHaveBeenCalledWith(db, 'PenaltyDisputed', 'Admin', expect.anything());
        });

        test('HR resolves a dispute, optionally rejecting the penalty', async () => {
            const client = makeClient([
                ['SELECT payroll_period_id FROM employee_penalties', () => ok([{ payroll_period_id: null }])],
                ['SELECT * FROM employee_penalties WHERE penalty_id', () => ok([penaltyRow({ acknowledgement_status: 'Disputed' })])],
                ['UPDATE employee_penalties', (params) => ok([{ ...penaltyRow(), acknowledgement_status: 'Resolved', status: params[2] }])],
                ['INSERT INTO payroll_audit_log', () => ok()],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [{ role: 'Technician' }] })) };
            const res = createResponse();
            const next = jest.fn();

            await resolvePenaltyDispute(db)(makeReq({
                params: { penaltyId: PENALTY_ID },
                body: { status: 'Rejected', resolution: 'leave records confirm the dispute' }
            }), res, next);

            expect(next).not.toHaveBeenCalled();
            // The notification fires from an un-awaited promise; flush it.
            await new Promise((resolve) => setImmediate(resolve));
            expect(triggerEvent).toHaveBeenCalledWith(db, 'PenaltyDisputeResolved', expect.objectContaining({
                staffId: EMPLOYEE_ID,
                variables: expect.objectContaining({ outcome: 'Rejected' })
            }));
            expect(resolvePenaltyDisputeSchema.safeParse({ status: 'Cancelled', resolution: 'x' }).success).toBe(false);
        });
    });

    describe('calculation input scoping', () => {
        test('scopes every input query to the period branch and currency', async () => {
            const period = {
                period_id: PERIOD_ID,
                branch_id: OTHER_BRANCH_ID,
                currency_code: 'EGP',
                start_date: '2026-08-01',
                end_date: '2026-08-31'
            };
            const client = makeClient([
                ['FROM users u', () => ok([])],
                ['FROM employee_compensation_profiles cp', () => ok([])],
                ['FROM attendance_logs a', () => ok([])],
                ['FROM staff_shifts s', () => ok([])],
                ['FROM leave_requests l', () => ok([])],
                ['FROM employee_deductions', () => ok([])],
                ['FROM employee_penalties', () => ok([])],
                ['FROM payroll_rules', () => ok([])],
            ]);

            await _private.loadCalculationInputs(client, period);

            const findCall = (fragment) => client.calls.find((call) => call.text.includes(fragment));
            const employeesCall = findCall('ep.payroll_branch_id = $4::uuid');
            expect(employeesCall).toBeTruthy();
            expect(employeesCall.params[3]).toBe(OTHER_BRANCH_ID);
            expect(employeesCall.text).toContain('(u.is_active = TRUE OR ep.termination_date IS NOT NULL)');

            const compensationCall = findCall('cp.branch_id = $3::uuid');
            expect(compensationCall.params[2]).toBe(OTHER_BRANCH_ID);
            expect(compensationCall.text).toContain('cp.currency_code = $4');

            const deductionsCall = findCall('FROM employee_deductions');
            expect(deductionsCall.text).toContain('branch_id = $4::uuid');
            expect(deductionsCall.text).toContain('currency_code = $5');
            expect(deductionsCall.text).toContain('applied_occurrences < max_occurrences');

            const penaltiesCall = findCall("COALESCE(acknowledgement_status, 'Pending') <> 'Disputed'");
            expect(penaltiesCall.text).toContain('branch_id = $2::uuid');
            expect(penaltiesCall.text).toContain('currency_code = $3');

            const rulesCall = findCall('FROM payroll_rules');
            expect(rulesCall.text).toContain('branch_id = $3::uuid');
            expect(rulesCall.text).toContain('currency_code = $4');
        });
    });

    describe('deduction self-approval guard', () => {
        test('creator cannot resume their own paused deduction', async () => {
            const client = makeClient([
                ['SELECT * FROM employee_deductions', () => ok([{
                    deduction_id: 'ded-1', status: 'Paused', created_by: CREATOR_ID, branch_id: BRANCH_ID, payroll_period_id: null
                }])],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const next = jest.fn();

            await updateDeductionStatus(db)(makeReq({
                params: { deductionId: 'ded-1' },
                body: { status: 'Approved' },
                user: { user_id: CREATOR_ID, role: 'HR' }
            }), createResponse(), next);

            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
            expect(client.calls.some((call) => call.text.includes('UPDATE employee_deductions'))).toBe(false);
        });
    });

    describe('employee self-service history', () => {
        test('returns only the employee own paid items', async () => {
            let capturedParams = null;
            const db = {
                query: jest.fn(async (sql, params) => {
                    capturedParams = params;
                    const text = String(sql);
                    if (text.includes('FROM payroll_employee_items i')) {
                        return ok([{ item_id: 'item-1', net_pay: 5000, line_items: [] }]);
                    }
                    return ok();
                })
            };
            const res = createResponse();
            const next = jest.fn();

            await getMyPayrollHistory(db)(makeReq({ user: { user_id: EMPLOYEE_ID, role: 'Technician' } }), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(capturedParams[0]).toBe(EMPLOYEE_ID);
            expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ item_id: 'item-1' })]);
        });
    });

    describe('payroll calculation with missing compensation profiles', () => {
        const periodRow = {
            period_id: PERIOD_ID,
            branch_id: BRANCH_ID,
            currency_code: 'EGP',
            start_date: '2026-08-01',
            end_date: '2026-08-31',
            name: 'August 2026',
            status: 'Draft'
        };

        test('skips employees without profiles instead of blocking the run', async () => {
            let runUpdateParams = null;
            const existingRun = { run_id: 'run-1', period_id: PERIOD_ID, status: 'Draft' };
            const client = makeClient([
                ['SELECT * FROM payroll_periods WHERE period_id', () => ok([periodRow])],
                ['INSERT INTO payroll_runs', () => ok([existingRun])],
                ['DELETE FROM payroll_employee_items', () => ok()],
                ['DELETE FROM payroll_line_items', () => ok()],
                ['UPDATE employee_deductions', () => ok()],
                ['UPDATE employee_penalties', () => ok()],
                ['FROM users u', () => ok([
                    { user_id: 'emp-with-profile', full_name: 'Has Profile', email: 'a@b.c', role: 'Technician', hire_date: '2020-01-01', termination_date: null },
                    { user_id: 'emp-without-profile', full_name: 'No Profile', email: 'd@e.f', role: 'Nurse', hire_date: '2020-01-01', termination_date: null }
                ])],
                ['FROM employee_compensation_profiles cp', () => ok([
                    { profile_id: 'cp-1', user_id: 'emp-with-profile', salary_type: 'Monthly', base_salary: 3000, hourly_rate: 0, standard_hours_per_day: 8, standard_days_per_period: 22, effective_from: '2020-01-01', effective_to: null, is_active: true }
                ])],
                ['FROM attendance_logs a', () => ok([])],
                ['FROM staff_shifts s', () => ok([])],
                ['FROM leave_requests l', () => ok([])],
                ['FROM employee_deductions', () => ok([])],
                ['FROM employee_penalties', () => ok([])],
                ['FROM payroll_rules', () => ok([])],
                ['INSERT INTO payroll_employee_items', () => ok([{ item_id: 'item-1' }])],
                ['INSERT INTO payroll_line_items', () => ok()],
                ['UPDATE payroll_periods', () => ok()],
                ['UPDATE payroll_runs', (params) => {
                    runUpdateParams = params;
                    return ok([{ run_id: 'run-1', status: 'Calculated', skipped_employees: JSON.parse(params[7]) }]);
                }],
                ['INSERT INTO payroll_audit_log', () => ok()],
            ]);
            const db = { connect: jest.fn(async () => client), query: jest.fn(async () => ok()) };
            const res = createResponse();
            const next = jest.fn();

            await calculatePayroll(db)(makeReq({ body: { periodId: PERIOD_ID }, user: { user_id: USER_ID, role: 'HR' } }), res, next);

            expect(next).not.toHaveBeenCalled();
            const skipped = JSON.parse(runUpdateParams[7]);
            expect(skipped).toEqual([
                { userId: 'emp-without-profile', fullName: 'No Profile', reason: 'missing_compensation_profile' }
            ]);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'Calculated',
                skipped_employees: expect.arrayContaining([expect.objectContaining({ userId: 'emp-without-profile' })])
            }));
            // The skip must be loudly visible.
            expect(triggerEventForRole).toHaveBeenCalledWith(db, 'PayrollEmployeesSkipped', 'HR', expect.objectContaining({
                variables: expect.objectContaining({ skipped_count: 1, employee_names: 'No Profile' })
            }));
        });
    });
});
