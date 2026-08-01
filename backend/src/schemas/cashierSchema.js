const { z } = require('zod');

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const openShiftSchema = z.object({
    openingBalance: z.coerce.number().min(0).optional(),
    notes: z.string().trim().max(1000).optional()
});

const closeShiftSchema = z.object({
    countedCash: z.coerce.number().min(0),
    varianceReason: z.string().trim().min(3).max(1000).optional(),
    notes: z.string().trim().max(1000).optional()
});

const reviewClosureSchema = z.object({
    reviewNotes: z.string().trim().min(3).max(1000)
});

const reconciliationQuerySchema = z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    cashierId: z.string().uuid().optional()
}).superRefine((data, context) => {
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'End date must be on or after start date'
        });
    }
});

module.exports = {
    openShiftSchema,
    closeShiftSchema,
    reviewClosureSchema,
    reconciliationQuerySchema
};
