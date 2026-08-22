const { z } = require('zod');

const paymentMethodSchema = z.enum(['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate']);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const validateDateRange = (schema) => schema.superRefine((data, context) => {
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'End date must be on or after start date'
        });
    }
});

const invoiceItemSchema = z.object({
    examId: z.string().uuid().optional(),
    examTypeId: z.string().uuid().optional(),
    description: z.string().trim().min(1).max(255),
    quantity: z.coerce.number().positive().default(1),
    unitPrice: z.coerce.number().min(0),
    discountAmount: z.coerce.number().min(0).optional(),
    taxAmount: z.coerce.number().min(0).optional()
});

const createInvoiceSchema = z.object({
    appointmentId: z.string().uuid().optional(),
    examId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    items: z.array(invoiceItemSchema).optional(),
    insuranceCoveredAmount: z.coerce.number().min(0).optional(),
    insurancePolicyId: z.string().uuid().optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    discountReason: z.string().trim().max(1000).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    packageCode: z.string().trim().max(100).optional(),
    packageName: z.string().trim().max(150).optional(),
    dueDate: dateString.optional(),
    notes: z.string().trim().max(1000).optional()
}).refine((data) => data.appointmentId || data.examId || data.patientId, {
    message: 'Appointment, exam, or patient is required'
}).superRefine((data, context) => {
    if ((Number(data.discountAmount || 0) > 0 || Number(data.discountPercentage || 0) > 0)
        && (!data.discountReason || data.discountReason.trim().length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['discountReason'], message: 'A discount reason of at least 3 characters is required' });
    }
});

const updateInvoiceSchema = z.object({
    invoiceStatus: z.literal('Voided').optional(),
    insuranceCoveredAmount: z.coerce.number().min(0).optional(),
    insurancePolicyId: z.string().uuid().nullable().optional(),
    discountAmount: z.coerce.number().min(0).optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    discountReason: z.string().trim().max(1000).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    packageCode: z.string().trim().max(100).nullable().optional(),
    packageName: z.string().trim().max(150).nullable().optional(),
    dueDate: dateString.nullable().optional(),
    voidReason: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).nullable().optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
}).superRefine((data, context) => {
    if ((Number(data.discountAmount || 0) > 0 || Number(data.discountPercentage || 0) > 0)
        && (!data.discountReason || data.discountReason.trim().length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['discountReason'], message: 'A discount reason of at least 3 characters is required' });
    }
    if (data.invoiceStatus === 'Voided' && (!data.voidReason || data.voidReason.trim().length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['voidReason'], message: 'A void reason of at least 3 characters is required' });
    }
});

const getInvoicesQuerySchema = validateDateRange(z.object({
    status: z.enum(['Draft', 'Pending', 'Partial', 'Paid', 'Refunded', 'Voided']).optional(),
    patientId: z.string().uuid().optional(),
    q: z.string().trim().max(100).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    appointmentDate: dateString.optional(),
    openOnly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    includeMeta: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    sortBy: z.enum(['number', 'date', 'total', 'paid', 'balance', 'status']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
}));

const collectPaymentSchema = z.object({
    amount: z.coerce.number().min(0),
    method: paymentMethodSchema.optional(),
    paymentReference: z.string().trim().max(150).optional(),
    discountAmount: z.coerce.number().min(0).optional().default(0),
    discountReason: z.string().trim().max(1000).optional(),
    verificationChecklist: z.record(z.boolean()).optional()
}).superRefine((data, context) => {
    if (data.amount <= 0 && data.discountAmount <= 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'A payment or discount amount is required' });
    }
    if (data.discountAmount > 0 && (!data.discountReason || data.discountReason.length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['discountReason'], message: 'A discount reason of at least 3 characters is required' });
    }
    if (data.amount > 0 && !data.method) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['method'], message: 'A payment method is required when collecting money' });
    }
    if (data.amount > 0 && data.method !== 'Cash' && (!data.paymentReference || data.paymentReference.length < 3)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentReference'], message: 'A payment reference is required for non-cash payments' });
    }
});

const refundSchema = z.object({
    paymentId: z.string().uuid().optional(),
    amount: z.coerce.number().positive(),
    method: paymentMethodSchema.optional(),
    reason: z.string().trim().min(3).max(1000)
});

const getRefundsQuerySchema = validateDateRange(z.object({
    status: z.enum(['Pending', 'Approved', 'Rejected', 'Processed']).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
}));

const reviewRefundSchema = z.object({
    status: z.enum(['Approved', 'Processed', 'Rejected']),
    reason: z.string().trim().min(3).max(1000)
});

module.exports = {
    createInvoiceSchema,
    updateInvoiceSchema,
    getInvoicesQuerySchema,
    collectPaymentSchema,
    refundSchema,
    getRefundsQuerySchema,
    reviewRefundSchema
};
