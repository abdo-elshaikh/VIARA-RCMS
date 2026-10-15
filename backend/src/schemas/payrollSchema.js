const { z } = require('zod');

const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);
const optionalString = (max = 255) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const money = z.coerce.number().min(0).max(999999999999.99);
const positiveMoney = z.coerce.number().gt(0).max(999999999999.99);
const percentage = z.coerce.number().min(0).max(100);
const PAYROLL_EMPLOYEE_ROLES = [
    'Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse',
    'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'
];
const strictBoolean = (defaultValue) => z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}, z.boolean());
const dateString = z.string().refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Invalid calendar date');

const createPayrollPeriodSchema = z.object({
    name: z.string().trim().min(2).max(120),
    startDate: dateString,
    endDate: dateString,
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('EGP'),
    branchId: optionalUuid,
    notes: optionalString(2000)
}).refine((data) => data.endDate >= data.startDate, {
    path: ['endDate'],
    message: 'Payroll period end date must be on or after start date'
});

const createCompensationProfileSchema = z.object({
    userId: z.string().uuid(),
    branchId: optionalUuid,
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('EGP'),
    salaryType: z.enum(['Monthly', 'Hourly', 'Daily', 'PerShift', 'PerCase', 'ShiftAndCase', 'Percentage']).default('Monthly'),
    baseSalary: money.default(0),
    hourlyRate: money.default(0),
    dailyRate: money.default(0),
    shiftRate: money.default(0),
    caseRate: money.default(0),
    percentageRate: percentage.default(0),
    standardHoursPerDay: z.coerce.number().min(0.25).max(24).default(8),
    standardDaysPerPeriod: z.coerce.number().min(1).max(31).default(22),
    effectiveFrom: dateString,
    effectiveTo: z.preprocess(emptyToUndefined, dateString.optional()),
    isActive: strictBoolean(true),
    notes: optionalString(2000)
}).refine((data) => !data.effectiveTo || data.effectiveTo >= data.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'Effective end date must be on or after effective start date'
}).superRefine((data, ctx) => {
    if (data.salaryType === 'Monthly' && data.baseSalary <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseSalary'], message: 'Monthly compensation requires a positive base salary' });
    }
    if (data.salaryType === 'Hourly' && data.hourlyRate <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hourlyRate'], message: 'Hourly compensation requires a positive hourly rate' });
    }
    if (data.salaryType === 'Daily' && data.dailyRate <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dailyRate'], message: 'Daily compensation requires a positive daily rate' });
    }
    if (data.salaryType === 'PerShift' && data.shiftRate <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shiftRate'], message: 'Per-shift compensation requires a positive shift rate' });
    }
    if (data.salaryType === 'PerCase' && data.caseRate <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['caseRate'], message: 'Per-case compensation requires a positive case rate' });
    }
    if (data.salaryType === 'ShiftAndCase' && (data.shiftRate <= 0 || data.caseRate <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shiftRate'], message: 'Combined shift and case compensation requires positive rates for both units' });
    }
    if (data.salaryType === 'Percentage' && data.percentageRate <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percentageRate'], message: 'Percentage compensation requires a positive percentage' });
    }
});

const cancelPayrollPeriodSchema = z.object({
    status: z.literal('Cancelled'),
    notes: z.string().trim().min(3).max(2000)
});

const updateCompensationProfileSchema = z.object({
    effectiveTo: dateString,
    isActive: strictBoolean(false),
    notes: optionalString(2000)
});

const createPayrollRuleSchema = z.object({
    branchId: optionalUuid,
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('EGP'),
    ruleType: z.enum(['Overtime', 'Late', 'EarlyLeave', 'Absence', 'Allowance', 'Bonus', 'Deduction', 'Penalty', 'EmployerContribution']),
    name: z.string().trim().min(2).max(120),
    calculationMethod: z.enum([
        'FixedAmount', 'PercentageOfBase', 'PercentageOfGross', 'PercentageOfCollections',
        'HourlyMultiplier', 'PerMinute', 'PerDay', 'PerShift', 'PerCase'
    ]),
    value: z.coerce.number().gt(0).max(999999999999.9999),
    taxable: strictBoolean(true),
    requiresApproval: z.literal(true).default(true),
    effectiveFrom: dateString,
    effectiveTo: z.preprocess(emptyToUndefined, dateString.optional()),
    isActive: strictBoolean(true),
    metadata: z.record(z.any()).default({}),
    targetUserIds: z.array(z.string().uuid()).max(200).default([]),
    targetRoles: z.array(z.enum(PAYROLL_EMPLOYEE_ROLES)).max(PAYROLL_EMPLOYEE_ROLES.length).default([]),
    bonusFrequency: z.enum(['OneTime', 'Recurring']).default('OneTime')
}).refine((data) => !data.effectiveTo || data.effectiveTo >= data.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'Effective end date must be on or after effective start date'
}).superRefine((data, ctx) => {
    const allowedMethods = {
        Overtime: new Set(['HourlyMultiplier', 'FixedAmount', 'PercentageOfBase']),
        Late: new Set(['PerMinute', 'FixedAmount']),
        EarlyLeave: new Set(['PerMinute', 'FixedAmount']),
        Absence: new Set(['PerDay', 'FixedAmount']),
        Allowance: new Set(['FixedAmount', 'PercentageOfBase', 'PercentageOfGross', 'PercentageOfCollections', 'PerDay', 'PerShift', 'PerCase']),
        Bonus: new Set(['FixedAmount', 'PercentageOfBase', 'PercentageOfGross', 'PercentageOfCollections', 'PerDay', 'PerShift', 'PerCase']),
        Deduction: new Set(['FixedAmount', 'PercentageOfBase', 'PercentageOfGross']),
        Penalty: new Set(['FixedAmount', 'PercentageOfBase', 'PercentageOfGross']),
        EmployerContribution: new Set(['FixedAmount', 'PercentageOfBase', 'PercentageOfGross'])
    };
    if (!allowedMethods[data.ruleType]?.has(data.calculationMethod)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['calculationMethod'], message: `Calculation method is not valid for ${data.ruleType}` });
    }
    if (data.calculationMethod === 'HourlyMultiplier' && data.value <= 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Overtime multiplier must be greater than 1' });
    }
    if (data.calculationMethod.startsWith('Percentage') && data.value > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Percentage calculation values cannot exceed 100' });
    }
    if (data.ruleType !== 'Bonus'
        && (data.targetUserIds.length || data.targetRoles.length || data.bonusFrequency !== 'OneTime')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetUserIds'], message: 'Employee targeting and frequency apply only to bonuses' });
    }
});

const updatePayrollRuleStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected', 'Cancelled']),
    notes: optionalString(2000)
});

const createDeductionSchema = z.object({
    userId: z.string().uuid(),
    branchId: optionalUuid,
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('EGP'),
    name: z.string().trim().min(2).max(140),
    deductionType: z.enum(['Fixed', 'Percentage', 'Installment', 'Advance', 'Loan', 'Tax', 'SocialInsurance', 'Other']).default('Fixed'),
    amount: money.default(0),
    percentage: percentage.default(0),
    totalAmount: z.preprocess(emptyToUndefined, money.optional()),
    remainingAmount: z.preprocess(emptyToUndefined, money.optional()),
    recurrenceType: z.enum(['OneTime', 'Recurring', 'Installment']).default('OneTime'),
    maxOccurrences: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(120).optional()),
    startDate: dateString,
    endDate: z.preprocess(emptyToUndefined, dateString.optional()),
    status: z.literal('Draft').default('Draft'),
    notes: optionalString(2000)
}).refine((data) => !data.endDate || data.endDate >= data.startDate, {
    path: ['endDate'],
    message: 'Deduction end date must be on or after start date'
}).refine((data) => data.amount > 0 || data.percentage > 0, {
    path: ['amount'],
    message: 'Deduction requires an amount or percentage'
}).superRefine((data, ctx) => {
    if (data.deductionType === 'Percentage') {
        if (data.percentage <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percentage'], message: 'Percentage deduction requires a positive percentage' });
        if (data.amount !== 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Percentage deduction must not include a fixed amount' });
    } else if (data.amount <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: `${data.deductionType} deduction requires a positive amount` });
    }
    if (['Installment', 'Advance', 'Loan'].includes(data.deductionType)) {
        const total = data.totalAmount ?? 0;
        const remaining = data.remainingAmount ?? total;
        if (total <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalAmount'], message: 'Installment deductions require a positive total amount' });
        if (remaining > total) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['remainingAmount'], message: 'Remaining amount cannot exceed total amount' });
        if (data.amount > remaining) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Installment amount cannot exceed remaining amount' });
        if (data.recurrenceType !== 'Installment') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recurrenceType'], message: 'Installment, advance, and loan deductions require installment recurrence' });
    }
    if (data.recurrenceType === 'Installment' && !['Installment', 'Advance', 'Loan'].includes(data.deductionType)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recurrenceType'], message: 'Installment recurrence requires an installment, advance, or loan deduction type' });
    }
});

const createPenaltySchema = z.object({
    userId: z.string().uuid(),
    branchId: optionalUuid,
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('EGP'),
    attendanceId: optionalUuid,
    payrollPeriodId: optionalUuid,
    penaltyType: z.string().trim().min(2).max(60).default('Policy'),
    amount: positiveMoney,
    incidentDate: dateString.default(() => new Date().toISOString().slice(0, 10)),
    reason: z.string().trim().min(3).max(2000),
    source: z.enum(['Manual', 'Attendance', 'Policy', 'Import']).default('Manual'),
    status: z.literal('Pending Approval').default('Pending Approval')
});

const updatePenaltyStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected', 'Cancelled']),
    notes: optionalString(2000)
}).refine((data) => data.status !== 'Cancelled' || (data.notes?.trim().length ?? 0) >= 3, {
    path: ['notes'],
    message: 'Cancelled penalties require a reason'
});

const resolvePenaltyDisputeSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    resolution: z.string().trim().min(3).max(2000)
});

const acknowledgePenaltySchema = z.object({
    status: z.enum(['Acknowledged', 'Disputed']),
    reason: optionalString(2000)
}).refine((data) => data.status !== 'Disputed' || (data.reason?.length ?? 0) >= 3, {
    path: ['reason'],
    message: 'A dispute reason of at least 3 characters is required'
});

const updateDeductionStatusSchema = z.object({
    status: z.enum(['Approved', 'Paused', 'Cancelled']),
    notes: optionalString(2000)
});

const calculatePayrollSchema = z.object({
    periodId: z.string().uuid()
});

const updatePayrollRunStatusSchema = z.object({
    status: z.enum(['Reviewed', 'Approved', 'Paid', 'Locked', 'Cancelled']),
    paymentMethod: z.enum(['Cash', 'BankTransfer', 'Check', 'Wallet']).optional(),
    referenceNumber: optionalString(120),
    paidAmount: z.preprocess(emptyToUndefined, money.optional()),
    paidDate: z.preprocess(emptyToUndefined, dateString.optional()),
    notes: optionalString(2000),
    idempotencyKey: optionalUuid
}).refine((data) => data.status !== 'Cancelled' || (data.notes?.trim().length ?? 0) >= 3, {
    path: ['notes'],
    message: 'Cancelled payroll transitions require a reason'
}).refine((data) => data.status !== 'Paid' || Boolean(data.idempotencyKey), {
    path: ['idempotencyKey'],
    message: 'Paid payroll transitions require an idempotency key'
}).refine((data) => data.status !== 'Paid'
    || data.paymentMethod === 'Cash'
    || Boolean(data.referenceNumber), {
    path: ['referenceNumber'],
    message: 'A payment reference is required for non-cash payroll payments'
});

const payrollQuerySchema = z.object({
    status: optionalString(30),
    startDate: z.preprocess(emptyToUndefined, dateString.optional()),
    endDate: z.preprocess(emptyToUndefined, dateString.optional()),
    userId: optionalUuid,
    periodId: optionalUuid,
    branchId: optionalUuid,
    currencyCode: z.preprocess(emptyToUndefined, z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional()),
    limit: z.coerce.number().int().min(1).max(500).default(100)
});

module.exports = {
    createPayrollPeriodSchema,
    cancelPayrollPeriodSchema,
    createCompensationProfileSchema,
    updateCompensationProfileSchema,
    createPayrollRuleSchema,
    updatePayrollRuleStatusSchema,
    createDeductionSchema,
    updateDeductionStatusSchema,
    createPenaltySchema,
    updatePenaltyStatusSchema,
    acknowledgePenaltySchema,
    resolvePenaltyDisputeSchema,
    calculatePayrollSchema,
    updatePayrollRunStatusSchema,
    payrollQuerySchema
};
