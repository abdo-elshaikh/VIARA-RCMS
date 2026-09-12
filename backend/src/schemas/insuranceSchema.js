const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');

const emptyToUndefined = (value) => value === '' ? undefined : value;
const dateSchema = calendarDateSchema();
const optionalDate = z.preprocess(emptyToUndefined, dateSchema.optional());
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().max(150).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const providerSchema = z.object({
    name: z.string().trim().min(1).max(100),
    payerCode: z.string().trim().max(50).optional(),
    phone: z.string().trim().max(50).optional(),
    email: optionalEmail,
    address: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional()
});

const updateProviderSchema = providerSchema.partial();

const contractSchema = z.object({
    providerId: z.string().uuid().optional(),
    entityName: z.string().trim().min(1).max(100),
    entityType: z.enum(['Insurance', 'Corporate', 'Referral', 'Other']).default('Insurance'),
    contractNumber: z.string().trim().max(100).optional(),
    commissionPercentage: z.coerce.number().min(0).max(100).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    coverageNotes: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional()
}).superRefine((data, context) => {
    if (data.endDate && data.startDate && data.endDate < data.startDate) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Contract end date must be on or after start date' });
    }
    if (data.entityType === 'Insurance' && !data.providerId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['providerId'], message: 'Insurance contracts require a provider' });
    }
});

const updateContractSchema = z.object({
    providerId: z.string().uuid().optional(),
    entityName: z.string().trim().min(1).max(100).optional(),
    entityType: z.enum(['Insurance', 'Corporate', 'Referral', 'Other']).optional(),
    contractNumber: z.string().trim().max(100).optional(),
    commissionPercentage: z.coerce.number().min(0).max(100).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    coverageNotes: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional()
}).superRefine((data, context) => {
    if (data.endDate && data.startDate && data.endDate < data.startDate) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Contract end date must be on or after start date' });
    }
});

const policySchema = z.object({
    patientId: z.string().uuid(),
    providerId: z.string().uuid(),
    contractId: z.string().uuid().optional(),
    policyNumber: z.string().trim().min(1).max(100),
    memberNumber: z.string().trim().max(100).optional(),
    planName: z.string().trim().max(150).optional(),
    holderName: z.string().trim().max(150).optional(),
    relationshipToHolder: z.string().trim().max(50).optional(),
    validFrom: optionalDate,
    validTo: optionalDate,
    isPrimary: z.boolean().optional(),
    approvalDocumentUrl: optionalUrl,
    notes: z.string().trim().max(1000).optional()
}).superRefine((data, context) => {
    if (data.validTo && data.validFrom && data.validTo < data.validFrom) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'Policy valid-to date must be on or after valid-from date' });
    }
});

const updatePolicySchema = z.object({
    providerId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    policyNumber: z.string().trim().min(1).max(100).optional(),
    memberNumber: z.string().trim().max(100).optional(),
    planName: z.string().trim().max(150).optional(),
    holderName: z.string().trim().max(150).optional(),
    relationshipToHolder: z.string().trim().max(50).optional(),
    validFrom: optionalDate,
    validTo: optionalDate,
    isPrimary: z.boolean().optional(),
    approvalDocumentUrl: optionalUrl,
    notes: z.string().trim().max(1000).optional()
}).superRefine((data, context) => {
    if (data.validTo && data.validFrom && data.validTo < data.validFrom) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'Policy valid-to date must be on or after valid-from date' });
    }
});

const coverageRuleSchema = z.object({
    providerId: z.string().uuid(),
    contractId: z.string().uuid().optional(),
    examTypeId: z.string().uuid().optional(),
    modalityType: z.string().trim().max(30).optional(),
    coveragePercentage: z.coerce.number().min(0).max(100).optional(),
    coverageCeiling: z.coerce.number().min(0).optional(),
    copayAmount: z.coerce.number().min(0).optional(),
    preauthorizationRequired: z.boolean().optional(),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    isActive: z.boolean().optional(),
    notes: z.string().trim().max(1000).optional()
}).superRefine((data, context) => {
    if (data.effectiveTo && data.effectiveFrom && data.effectiveTo < data.effectiveFrom) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'Rule effective-to date must be on or after effective-from date' });
    }
    if (!data.examTypeId && !data.modalityType) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['examTypeId'], message: 'Coverage rules require an exam type or modality' });
    }
});

const updateCoverageRuleSchema = z.object({
    providerId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    examTypeId: z.string().uuid().optional(),
    modalityType: z.string().trim().max(30).optional(),
    coveragePercentage: z.coerce.number().min(0).max(100).optional(),
    coverageCeiling: z.coerce.number().min(0).optional(),
    copayAmount: z.coerce.number().min(0).optional(),
    preauthorizationRequired: z.boolean().optional(),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    isActive: z.boolean().optional(),
    notes: z.string().trim().max(1000).optional()
}).superRefine((data, context) => {
    if (data.effectiveTo && data.effectiveFrom && data.effectiveTo < data.effectiveFrom) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveTo'], message: 'Rule effective-to date must be on or after effective-from date' });
    }
});

const approvalSchema = z.object({
    patientId: z.string().uuid(),
    policyId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    appointmentId: z.string().uuid().optional(),
    examId: z.string().uuid().optional(),
    examTypeId: z.string().uuid().optional(),
    status: z.enum(['Not Required', 'Pending']).optional(),
    approvalNumber: z.string().trim().max(100).optional(),
    requestedAmount: z.coerce.number().min(0).optional(),
    documentUrl: optionalUrl,
    expiresAt: optionalDate
}).strict();

const updateApprovalStatusSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    approvalNumber: z.string().trim().min(2).max(100).optional(),
    approvedAmount: z.coerce.number().min(0).optional(),
    rejectionReason: z.string().trim().min(3).max(1000).optional()
}).superRefine((data, context) => {
    if (data.status === 'Approved' && !data.approvalNumber) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['approvalNumber'],
            message: 'Approved authorizations require an approval number'
        });
    }
    if (data.status === 'Rejected' && !data.rejectionReason) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rejectionReason'],
            message: 'Rejected authorizations require a rejection reason'
        });
    }
});

const coverageQuerySchema = z.object({
    providerId: z.string().uuid(),
    contractId: z.string().uuid().optional(),
    policyId: z.string().uuid().optional(),
    examTypeId: z.string().uuid().optional(),
    modalityType: z.string().optional(),
    serviceDate: dateSchema.optional(),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)
});

module.exports = {
    providerSchema,
    updateProviderSchema,
    contractSchema,
    updateContractSchema,
    policySchema,
    updatePolicySchema,
    coverageRuleSchema,
    updateCoverageRuleSchema,
    approvalSchema,
    updateApprovalStatusSchema,
    coverageQuerySchema
};
