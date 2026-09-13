const {
    inclusiveDays,
    overlapDays,
    roundMoney,
    monthlyAccrualFactor,
    proratedMonthlyAmount,
    capLineAmounts,
    sumAmount,
    calculateRuleAmount,
    ruleLineType,
    paymentAccount,
    payrollPaymentJournalEntries,
    calculateDeductionAmount,
    cairoDateKey,
    enumerateWeekdays,
    enumerateDates,
    laterDate,
    earlierDate,
    dateFallsWithin
} = require('../src/services/payrollCalculationService');

describe('Payroll Calculation Service Unit Tests', () => {
    describe('Date & Calendar Helpers', () => {
        test('inclusiveDays correctly computes day count including start and end', () => {
            expect(inclusiveDays('2026-01-01', '2026-01-01')).toBe(1);
            expect(inclusiveDays('2026-01-01', '2026-01-31')).toBe(31);
            expect(inclusiveDays('2026-02-01', '2026-02-28')).toBe(28);
        });

        test('overlapDays computes intersection of two date ranges', () => {
            expect(overlapDays('2026-01-01', '2026-01-31', '2026-01-15', '2026-02-15')).toBe(17);
            expect(overlapDays('2026-01-01', '2026-01-10', '2026-01-11', '2026-01-20')).toBe(0);
        });

        test('enumerateWeekdays excludes Friday and Saturday', () => {
            // 2026-01-01 is Thursday, 2026-01-02 is Friday, 2026-01-03 is Saturday, 2026-01-04 is Sunday
            const weekdays = enumerateWeekdays('2026-01-01', '2026-01-04');
            expect(weekdays).toEqual(['2026-01-01', '2026-01-04']);
        });

        test('enumerateDates returns all contiguous days', () => {
            const dates = enumerateDates('2026-01-01', '2026-01-03');
            expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
        });

        test('laterDate and earlierDate resolve bounds correctly', () => {
            expect(laterDate('2026-01-05', '2026-01-10', '2026-01-01')).toEqual(new Date(Date.UTC(2026, 0, 10)));
            expect(earlierDate('2026-01-05', '2026-01-10', '2026-01-01')).toEqual(new Date(Date.UTC(2026, 0, 1)));
        });

        test('dateFallsWithin returns true if date is within range', () => {
            expect(dateFallsWithin('2026-01-15', '2026-01-01', '2026-01-31')).toBe(true);
            expect(dateFallsWithin('2026-02-01', '2026-01-01', '2026-01-31')).toBe(false);
        });
    });

    describe('Money & Proration Helpers', () => {
        test('roundMoney rounds to 2 decimal places using half-up', () => {
            expect(roundMoney(10.555)).toBe(10.56);
            expect(roundMoney(10.554)).toBe(10.55);
            expect(roundMoney(null)).toBe(0);
            expect(roundMoney('invalid')).toBe(0);
        });

        test('monthlyAccrualFactor and proratedMonthlyAmount', () => {
            expect(monthlyAccrualFactor('2026-01-01', '2026-01-31')).toBeCloseTo(1, 6);
            expect(proratedMonthlyAmount(3000, '2026-01-01', '2026-01-31')).toBe(3000);
            expect(proratedMonthlyAmount(3100, '2026-01-16', '2026-01-31')).toBe(1600);
        });

        test('sumAmount calculates total money safely', () => {
            expect(sumAmount([{ amount: 100.5 }, { amount: 200.25 }])).toBe(300.75);
            expect(sumAmount([])).toBe(0);
        });

        test('capLineAmounts caps line items against available funds', () => {
            const lines = [
                { amount: 500, label: 'Deduction 1' },
                { amount: 800, label: 'Deduction 2' }
            ];
            const capped = capLineAmounts(lines, 1000);
            expect(capped[0].amount).toBe(500);
            expect(capped[0].unappliedAmount).toBe(0);
            expect(capped[1].amount).toBe(500);
            expect(capped[1].unappliedAmount).toBe(300);
        });
    });

    describe('Payroll Rules & Deductions', () => {
        test('ruleLineType maps rule types to line item categories', () => {
            expect(ruleLineType('Allowance')).toBe('Earning');
            expect(ruleLineType('Overtime')).toBe('Earning');
            expect(ruleLineType('Deduction')).toBe('Deduction');
            expect(ruleLineType('Late')).toBe('Deduction');
            expect(ruleLineType('EarlyLeave')).toBe('Deduction');
            expect(ruleLineType('Absence')).toBe('Deduction');
            expect(ruleLineType('Penalty')).toBe('Penalty');
            expect(ruleLineType('EmployerContribution')).toBe('EmployerContribution');
            expect(ruleLineType('Unknown')).toBe('Adjustment');
        });

        test('calculateRuleAmount handles multiple calculation methods', () => {
            const context = {
                baseGross: 10000,
                gross: 12000,
                overtimeHours: 5,
                hourlyRate: 100,
                absenceDays: 2,
                dailyRate: 400,
                lateMinutes: 30,
                earlyLeaveMinutes: 15
            };

            // FixedAmount
            expect(calculateRuleAmount({ rule_type: 'Allowance', calculation_method: 'FixedAmount', value: 500 }, context)).toBe(500);

            // PercentageOfBase
            expect(calculateRuleAmount({ rule_type: 'Allowance', calculation_method: 'PercentageOfBase', value: 10 }, context)).toBe(1000);

            // PercentageOfGross
            expect(calculateRuleAmount({ rule_type: 'Allowance', calculation_method: 'PercentageOfGross', value: 10 }, context)).toBe(1200);

            // HourlyMultiplier for overtime (1.5x -> extra 0.5x on top of regular hour)
            expect(calculateRuleAmount({ rule_type: 'Overtime', calculation_method: 'HourlyMultiplier', value: 1.5 }, context)).toBe(250);

            // PerDay for absence
            expect(calculateRuleAmount({ rule_type: 'Absence', calculation_method: 'PerDay', value: 1 }, context)).toBe(800);

            // PerMinute for late
            expect(calculateRuleAmount({ rule_type: 'Late', calculation_method: 'PerMinute', value: 2 }, context)).toBe(60);
        });

        test('calculateDeductionAmount handles percentage, installment, and fixed deductions', () => {
            expect(calculateDeductionAmount({ deduction_type: 'Percentage', percentage: 5 }, 10000)).toBe(500);
            expect(calculateDeductionAmount({ deduction_type: 'Installment', amount: 1000, remaining_amount: 400 }, 10000)).toBe(400);
            expect(calculateDeductionAmount({ deduction_type: 'Fixed', amount: 250 }, 10000)).toBe(250);
        });
    });

    describe('Accounting & Journal Posting Helpers', () => {
        test('paymentAccount returns correct GL account code and name', () => {
            expect(paymentAccount('Cash')).toEqual(['1000', 'Cash on hand']);
            expect(paymentAccount('Check')).toEqual(['1015', 'Checks clearing']);
            expect(paymentAccount('Wallet')).toEqual(['1020', 'Wallet clearing']);
            expect(paymentAccount('BankTransfer')).toEqual(['1010', 'Bank transfer clearing']);
        });

        test('payrollPaymentJournalEntries generates balanced journal lines', () => {
            const run = {
                total_gross: 50000,
                total_deductions: 5000,
                total_penalties: 1000,
                total_employer_contributions: 4000,
                total_net: 44000
            };
            const entries = payrollPaymentJournalEntries(run, 'BankTransfer');

            const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
            const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

            // Gross (50k) + EmployerContrib (4k) = 54k debit
            // Net (44k) + Deductions (5k) + Penalties (1k) + EmployerPayable (4k) = 54k credit
            expect(totalDebit).toBe(54000);
            expect(totalCredit).toBe(54000);
        });
    });
});
