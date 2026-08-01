const { updatePayrollRunStatusSchema, updatePayrollRuleStatusSchema } = require('../src/schemas/payrollSchema');
const { _private } = require('../src/controllers/payrollController');

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
});
