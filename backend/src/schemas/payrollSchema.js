const { z } = require('zod');

const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);
const optionalString = (max = 255) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const money = z.coerce.number().min(0).max(999999999999.99);
const percentage = z.coerce.number().min(0).max(100);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createPayrollPeriodSchema = z.object({
    name: z.string().trim().min(2).max(120),
    startDate: dateString,
    endDate: dateString,
    currencyCode: z.string().trim().length(3).default('EGP'),
    branchId: optionalUuid,
    notes: optionalString(2000)
}).refine((data) => data.endDate >= data.startDate, {
    path: ['endDate'],
    message: 'Payroll period end date must be on or after start date'
});

const createCompensationProfileSchema = z.object({
    userId: z.string().uuid(),
    salaryType: z.enum(['Monthly', 'Hourly']).default('Monthly'),
    baseSalary: money.default(0),
    hourlyRate: money.default(0),
    standardHoursPerDay: z.coerce.number().min(0.25).max(24).default(8),
    standardDaysPerPeriod: z.coerce.number().min(1).max(31).default(22),
    effectiveFrom: dateString,
    effectiveTo: z.preprocess(emptyToUndefined, dateString.optional()),
    isActive: z.coerce.boolean().default(true),
    notes: optionalString(2000)
}).refine((data) => !data.effectiveTo || data.effectiveTo >= data.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'Effective end date must be on or after effective start date'
});

const createPayrollRuleSchema = z.object({
    ruleType: z.enum(['Overtime', 'Late', 'EarlyLeave', 'Absence', 'Allowance', 'Deduction', 'Penalty', 'EmployerContribution']),
    name: z.string().trim().min(2).max(120),
    calculationMethod: z.enum(['FixedAmount', 'PercentageOfBase', 'PercentageOfGross', 'HourlyMultiplier', 'PerMinute', 'PerDay']),
    value: z.coerce.number().min(0).max(999999999999.9999),
    taxable: z.coerce.boolean().default(true),
    requiresApproval: z.coerce.boolean().default(true),
    effectiveFrom: dateString,
    effectiveTo: z.preprocess(emptyToUndefined, dateString.optional()),
    isActive: z.coerce.boolean().default(true),
    metadata: z.record(z.any()).default({})
}).refine((data) => !data.effectiveTo || data.effectiveTo >= data.effectiveFrom, {
    path: ['effectiveTo'],
    message: 'Effective end date must be on or after effective start date'
});

const updatePayrollRuleStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    notes: optionalString(2000)
});

const createDeductionSchema = z.object({
    userId: z.string().uuid(),
    name: z.string().trim().min(2).max(140),
    deductionType: z.enum(['Fixed', 'Percentage', 'Installment', 'Advance', 'Loan', 'Tax', 'SocialInsurance', 'Other']).default('Fixed'),
    amount: money.default(0),
    percentage: percentage.default(0),
    totalAmount: z.preprocess(emptyToUndefined, money.optional()),
    remainingAmount: z.preprocess(emptyToUndefined, money.optional()),
    startDate: dateString,
    endDate: z.preprocess(emptyToUndefined, dateString.optional()),
    status: z.enum(['Draft', 'Approved', 'Paused', 'Completed', 'Cancelled']).default('Draft'),
    notes: optionalString(2000)
}).refine((data) => !data.endDate || data.endDate >= data.startDate, {
    path: ['endDate'],
    message: 'Deduction end date must be on or after start date'
}).refine((data) => data.amount > 0 || data.percentage > 0, {
    path: ['amount'],
    message: 'Deduction requires an amount or percentage'
});

const createPenaltySchema = z.object({
    userId: z.string().uuid(),
    attendanceId: optionalUuid,
    payrollPeriodId: optionalUuid,
    penaltyType: z.string().trim().min(2).max(60).default('Policy'),
    amount: money,
    reason: z.string().trim().min(3).max(2000),
    source: z.enum(['Manual', 'Attendance', 'Policy', 'Import']).default('Manual'),
    status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Applied', 'Cancelled']).default('Draft')
});

const updatePenaltyStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    notes: optionalString(2000)
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
    paymentMethod: z.enum(['Cash', 'BankTransfer', 'Check', 'Wallet', 'Other']).optional(),
    referenceNumber: optionalString(120),
    paidAmount: z.preprocess(emptyToUndefined, money.optional()),
    paidDate: z.preprocess(emptyToUndefined, dateString.optional()),
    notes: optionalString(2000),
    idempotencyKey: optionalUuid
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
    branchId: optionalUuid,
    limit: z.coerce.number().int().min(1).max(500).default(100)
});

module.exports = {
    createPayrollPeriodSchema,
    createCompensationProfileSchema,
    createPayrollRuleSchema,
    updatePayrollRuleStatusSchema,
    createDeductionSchema,
    updateDeductionStatusSchema,
    createPenaltySchema,
    updatePenaltyStatusSchema,
    calculatePayrollSchema,
    updatePayrollRunStatusSchema,
    payrollQuerySchema
};
