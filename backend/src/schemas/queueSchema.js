const { z } = require('zod');

const queueStageSchema = z.enum([
    'Registered',
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Reporting',
    'Finalized',
    'Delivered',
    'Cancelled'
]);

const stationSchema = z.enum(['Reception', 'Cashier', 'Nurse', 'Modality', 'Radiologist', 'Delivery']);

const getQueueQuerySchema = z.object({
    stage: queueStageSchema.optional(),
    station: stationSchema.optional(),
    priority: z.enum(['Routine', 'Urgent', 'Emergency']).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    includeDelivered: z.enum(['true', 'false']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

const transitionQueueSchema = z.object({
    toStage: queueStageSchema.optional(),
    action: z.enum(['hold', 'release', 'update_complaint', 'update_safety']).optional(),
    reason: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
    complaint: z.string().trim().max(5000).optional(),
    pregnancySafetyStatus: z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']).optional(),
    implantSafetyStatus: z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']).optional(),
    renalSafetyStatus: z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']).optional()
}).refine((data) => data.toStage || data.action, {
    message: 'Provide either a queue stage or a hold/release/update action'
});

module.exports = {
    getQueueQuerySchema,
    transitionQueueSchema
};
