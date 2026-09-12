const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');

const dateString = calendarDateSchema('Date must be a valid YYYY-MM-DD calendar date');

const validateRange = (schema) => schema.refine(({ startDate, endDate }) => startDate <= endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate']
});

const analyticsQuerySchema = validateRange(z.object({
    startDate: dateString,
    endDate: dateString,
    groupBy: z.enum(['date', 'modality', 'doctor', 'payer', 'room', 'reception']).optional().default('date'),
    modalityId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
}));

const analyticsExportQuerySchema = validateRange(z.object({
    type: z.enum(['volume', 'revenue', 'performance', 'referrals', 'peak-hours', 'equipment-utilization', 'top-procedures']),
    startDate: dateString,
    endDate: dateString,
    groupBy: z.enum(['date', 'modality', 'doctor', 'payer', 'room', 'reception']).optional().default('date'),
    modalityId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
}));

module.exports = {
    analyticsQuerySchema,
    analyticsExportQuerySchema
};
