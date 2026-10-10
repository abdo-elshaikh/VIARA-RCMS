const {
    cancelPayrollPeriodSchema,
    createDeductionSchema,
    createPayrollPeriodSchema,
    createPayrollRuleSchema,
    updatePayrollRunStatusSchema,
    updatePayrollRuleStatusSchema
} = require('../src/schemas/payrollSchema');
const {
    updateDeductionStatus,
    updatePayrollRuleStatus,
    _private
} = require('../src/controllers/payrollController');

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

describe('payroll controller safeguards', () => {
    test('caps deductions and penalties to payable gross so journals stay balanced', () => {
        const deductions = _private.capLineAmounts([
            { type: 'Deduction', amount: 750 },
            { type: 'Deduction', amount: 500 }
        ], 1000);
        const penalties = _private.capLineAmounts([
            { type: 'Penalty', amount: 300 }
        ], 1000 - deductions.reduce((sum, line) => sum + line.amount, 0));

        expect(deductions.map((line) => line.amount)).toEqual([750, 250]);
        expect(deductions.map((line) => line.unappliedAmount)).toEqual([0, 250]);
        expect(penalties[0]).toMatchObject({ amount: 0, unappliedAmount: 300 });

        const run = {
            total_gross: 1000,
            total_deductions: deductions.reduce((sum, line) => sum + line.amount, 0),
            total_penalties: penalties.reduce((sum, line) => sum + line.amount, 0),
            total_net: 0
        };
        const entries = _private.payrollPaymentJournalEntries(run, 'BankTransfer');
        const debit = entries.reduce((sum, entry) => sum + entry.debit, 0);
        const credit = entries.reduce((sum, entry) => sum + entry.credit, 0);

        expect(debit).toBe(1000);
        expect(credit).toBe(1000);
    });

    test('applies explicit attendance-driven rules without penalizing missing logs', () => {
        const absenceRule = {
            rule_type: 'Absence',
            calculation_method: 'PerDay',
            value: 1
        };
        const noAbsence = _private.calculateRuleAmount(absenceRule, {
            baseGross: 1000,
            gross: 1000,
            dailyRate: 100,
            absenceDays: 0,
            overtimeHours: 0,
            lateMinutes: 0,
            hourlyRate: 0
        });
        const oneAbsence = _private.calculateRuleAmount(absenceRule, {
            baseGross: 1000,
            gross: 1000,
            dailyRate: 100,
            absenceDays: 1,
            overtimeHours: 0,
            lateMinutes: 0,
            hourlyRate: 0
        });

        expect(noAbsence).toBe(0);
        expect(oneAbsence).toBe(100);
    });

    test('uses early-leave minutes only for early-leave rules', () => {
        expect(_private.calculateRuleAmount({
            rule_type: 'EarlyLeave', calculation_method: 'PerMinute', value: 2
        }, {
            earlyLeaveMinutes: 15,
            lateMinutes: 90,
            absenceDays: 0,
            overtimeHours: 0
        })).toBe(30);
    });

    test('prorates monthly salaries by actual calendar-month days', () => {
        expect(_private.proratedMonthlyAmount(3100, '2026-01-16', '2026-01-31')).toBe(1600);
        expect(_private.proratedMonthlyAmount(2800, '2026-02-01', '2026-02-28')).toBe(2800);
        expect(_private.proratedMonthlyAmount(3100, '2026-01-31', '2026-02-01')).toBe(210.71);
        expect(_private.monthlyAccrualFactor('2026-01-01', '2026-02-28')).toBeCloseTo(2, 10);
    });

    test('clips unpaid leave to the payroll period and excludes weekends', () => {
        const summary = _private.summarizeAttendance({
            attendance: null,
            shifts: [],
            leaves: [{ leave_type: 'Unpaid', start_date: '2026-07-01', end_date: '2026-09-30' }],
            periodStart: '2026-08-02',
            periodEnd: '2026-08-08'
        });

        expect(summary.unpaid_leave_days).toBe(5);
        expect(summary.absent_days).toBe(5);
    });

    test('treats uncovered scheduled shifts as absence but paid leave as covered', () => {
        const shift = {
            shift_id: 'shift-1',
            start_time: '2026-08-03T06:00:00.000Z',
            end_time: '2026-08-03T14:00:00.000Z'
        };
        const absent = _private.summarizeAttendance({
            attendance: null,
            shifts: [shift],
            leaves: [],
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31'
        });
        const excused = _private.summarizeAttendance({
            attendance: null,
            shifts: [shift],
            leaves: [{ leave_type: 'Annual', start_date: '2026-08-03', end_date: '2026-08-03' }],
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31'
        });

        expect(absent.absent_days).toBe(1);
        expect(excused.absent_days).toBe(0);
    });

    test('pays scheduled leave hours for hourly profiles and deducts monthly unpaid leave once', () => {
        const period = { start_date: '2026-08-01', end_date: '2026-08-31' };
        const employee = { hire_date: '2026-01-01', termination_date: null };
        const hourlyProfile = { salary_type: 'Hourly', effective_from: '2026-01-01', effective_to: null };
        const monthlyProfile = {
            salary_type: 'Monthly', base_salary: 2200, standard_days_per_period: 22,
            effective_from: '2026-01-01', effective_to: null
        };
        const attendance = {
            paid_leave_shifts: [{
                start_time: '2026-08-03T06:00:00.000Z', end_time: '2026-08-03T14:00:00.000Z'
            }],
            unpaid_leave_dates: ['2026-08-04', '2026-08-05']
        };

        expect(_private.paidLeaveHoursForProfile({ profile: hourlyProfile, attendance, employee, period })).toBe(8);
        expect(_private.unpaidLeaveDeductionForProfile({ profile: monthlyProfile, attendance, employee, period })).toBe(200);
    });

    test('validates real dates, coherent deductions, and compatible positive rules', () => {
        expect(createPayrollPeriodSchema.safeParse({
            name: 'Invalid February', startDate: '2026-02-30', endDate: '2026-03-01', currencyCode: 'egp'
        }).success).toBe(false);
        expect(createDeductionSchema.safeParse({
            userId: '00000000-0000-4000-8000-000000000001',
            name: 'Silent deduction', deductionType: 'Fixed', amount: 0, percentage: 0, startDate: '2026-08-01'
        }).success).toBe(false);
        expect(createDeductionSchema.safeParse({
            userId: '00000000-0000-4000-8000-000000000001',
            name: 'Percentage', deductionType: 'Percentage', amount: 10, percentage: 5, startDate: '2026-08-01'
        }).success).toBe(false);
        expect(createPayrollRuleSchema.safeParse({
            ruleType: 'Late', name: 'Invalid late rule', calculationMethod: 'PerDay', value: 1,
            effectiveFrom: '2026-08-01', requiresApproval: true
        }).success).toBe(false);
        expect(createPayrollRuleSchema.safeParse({
            ruleType: 'Allowance', name: 'Zero allowance', calculationMethod: 'FixedAmount', value: 0,
            effectiveFrom: '2026-08-01', requiresApproval: true
        }).success).toBe(false);
    });

    test('includes employer contributions without reducing employee net pay', () => {
        const entries = _private.payrollPaymentJournalEntries({
            total_gross: 1000,
            total_deductions: 100,
            total_penalties: 0,
            total_net: 900,
            total_employer_contributions: 120
        }, 'BankTransfer');
        expect(entries.find((entry) => entry.accountCode === '6110')).toMatchObject({ debit: 120, credit: 0 });
        expect(entries.find((entry) => entry.accountCode === '2160')).toMatchObject({ debit: 0, credit: 120 });
        expect(entries.reduce((sum, entry) => sum + entry.debit, 0)).toBe(1120);
        expect(entries.reduce((sum, entry) => sum + entry.credit, 0)).toBe(1120);
    });

    test('enforces maker-checker transitions with Developer reasoned override', () => {
        const run = {
            calculated_by: '00000000-0000-4000-8000-000000000010',
            reviewed_by: '00000000-0000-4000-8000-000000000011'
        };

        expect(() => _private.assertMakerChecker({
            run,
            status: 'Reviewed',
            userId: run.calculated_by,
            role: 'HR'
        })).toThrow(/Maker-checker/);

        expect(() => _private.assertMakerChecker({
            run,
            status: 'Reviewed',
            userId: run.calculated_by,
            role: 'Developer'
        })).toThrow(/override requires/);

        expect(_private.assertMakerChecker({
            run,
            status: 'Reviewed',
            userId: run.calculated_by,
            role: 'Developer',
            notes: 'Emergency payroll correction'
        })).toBe(true);
    });

    test('requires payment reference for non-cash payroll payments', () => {
        expect(updatePayrollRunStatusSchema.safeParse({
            status: 'Paid',
            paymentMethod: 'BankTransfer',
            idempotencyKey: '00000000-0000-4000-8000-000000000020'
        }).success).toBe(false);

        expect(updatePayrollRunStatusSchema.safeParse({
            status: 'Paid',
            paymentMethod: 'Cash',
            idempotencyKey: '00000000-0000-4000-8000-000000000020'
        }).success).toBe(true);

        expect(updatePayrollRunStatusSchema.safeParse({
            status: 'Paid',
            paymentMethod: 'BankTransfer',
            referenceNumber: 'BANK-20260729-001',
            idempotencyKey: '00000000-0000-4000-8000-000000000020'
        }).success).toBe(true);
    });

    test('limits payroll rule approvals to final approval decisions', () => {
        expect(updatePayrollRuleStatusSchema.safeParse({
            status: 'Approved',
            notes: 'Reviewed payroll control rule'
        }).success).toBe(true);

        expect(updatePayrollRuleStatusSchema.safeParse({
            status: 'Pending Approval'
        }).success).toBe(false);
    });

    test('requires a documented reason when cancelling a payroll period or run', () => {
        expect(cancelPayrollPeriodSchema.safeParse({ status: 'Cancelled', notes: '' }).success).toBe(false);
        expect(cancelPayrollPeriodSchema.safeParse({
            status: 'Cancelled',
            notes: 'Period was opened for the wrong month'
        }).success).toBe(true);
        expect(updatePayrollRunStatusSchema.safeParse({ status: 'Cancelled' }).success).toBe(false);
        expect(updatePayrollRunStatusSchema.safeParse({ status: 'Cancelled', notes: 'no' }).success).toBe(false);
        expect(updatePayrollRunStatusSchema.safeParse({
            status: 'Cancelled',
            notes: 'Attendance corrections require recalculation'
        }).success).toBe(true);
    });

    test('blocks payroll rule creators from rejecting their own approval request', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT * FROM payroll_rules')) {
                    return {
                        rows: [{
                            rule_id: '00000000-0000-4000-8000-000000000030',
                            status: 'Pending Approval',
                            created_by: '00000000-0000-4000-8000-000000000031'
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await updatePayrollRuleStatus(db)({
            params: { ruleId: '00000000-0000-4000-8000-000000000030' },
            body: { status: 'Rejected', notes: 'Incorrect rule' },
            user: { user_id: '00000000-0000-4000-8000-000000000031', role: 'HR' }
        }, createResponse(), next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 403,
            message: expect.stringMatching(/creator cannot approve or reject/i)
        }));
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE payroll_rules'))).toBe(false);
    });

    test('prevents draft deductions from being paused without an approval decision', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
                if (text.includes('SELECT * FROM employee_deductions')) {
                    return {
                        rows: [{
                            deduction_id: '00000000-0000-4000-8000-000000000040',
                            status: 'Draft',
                            created_by: '00000000-0000-4000-8000-000000000041'
                        }]
                    };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn(async () => client) };
        const next = jest.fn();

        await updateDeductionStatus(db)({
            params: { deductionId: '00000000-0000-4000-8000-000000000040' },
            body: { status: 'Paused', notes: 'Pause before approval' },
            user: { user_id: '00000000-0000-4000-8000-000000000042', role: 'Accountant' }
        }, createResponse(), next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            statusCode: 409,
            message: expect.stringMatching(/cannot move from Draft to Paused/i)
        }));
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE employee_deductions'))).toBe(false);
    });
});
