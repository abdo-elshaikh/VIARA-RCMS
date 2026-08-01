const { z } = require('zod');

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format');

const validateRange = (schema) => schema.refine(({ startDate, endDate }) => startDate <= endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate']
});

const analyticsQuerySchema = validateRange(z.object({
    startDate: dateString,
    endDate: dateString,
    groupBy: z.enum(['date', 'modality', 'doctor', 'payer']).optional().default('date')
}));

const analyticsExportQuerySchema = validateRange(z.object({
    type: z.enum(['volume', 'revenue', 'performance', 'referrals']),
    startDate: dateString,
    endDate: dateString,
    groupBy: z.enum(['date', 'modality', 'doctor', 'payer']).optional().default('date')
}));

module.exports = {
    analyticsQuerySchema,
    analyticsExportQuerySchema
};
