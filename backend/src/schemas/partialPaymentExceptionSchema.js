const { z } = require('zod');

const transactionTypeSchema = z.enum(['ClinicalQueueTransition']);
const statusSchema = z.enum(['Pending', 'Approved', 'Rejected', 'Expired', 'Used']);
const dateTimeString = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const requestPartialPaymentExceptionSchema = z.object({
    transactionType: transactionTypeSchema,
    reason: z.string().trim().min(5).max(1000),
    responsiblePartyId: z.string().uuid().optional(),
    expiresAt: dateTimeString.optional(),
    metadata: z.record(z.any()).optional()
});

const reviewPartialPaymentExceptionSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    reviewNotes: z.string().trim().min(5).max(1000),
    expiresAt: dateTimeString.optional()
});

const getPartialPaymentExceptionsQuerySchema = z.object({
    status: statusSchema.optional(),
    transactionType: transactionTypeSchema.optional(),
    invoiceId: z.string().uuid().optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

module.exports = {
    requestPartialPaymentExceptionSchema,
    reviewPartialPaymentExceptionSchema,
    getPartialPaymentExceptionsQuerySchema
};
