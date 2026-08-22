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
