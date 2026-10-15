const { z } = require('zod');

const queueStageSchema = z.enum([
    'Registered',
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Images Ready',
    'Images Delivered',
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
    scope: z.enum(['all', 'mine', 'available']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

const assignQueueTaskSchema = z.object({
    userId: z.string().uuid('Invalid user ID format'),
    reason: z.string().trim().min(3).max(1000).optional()
});

const releaseQueueTaskSchema = z.object({
    reason: z.string().trim().min(3).max(1000)
});

const transitionQueueSchema = z.object({
    toStage: queueStageSchema.optional(),
    action: z.enum(['hold', 'release', 'start_task', 'update_complaint', 'update_safety']).optional(),
    reason: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
    complaint: z.string().trim().max(5000).optional(),
    pregnancySafetyStatus: z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']).optional(),
    implantSafetyStatus: z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']).optional(),
    renalSafetyStatus: z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']).optional()
}).refine((data) => data.toStage || data.action, {
    message: 'Provide either a queue stage (toStage) or a hold/release/update action',
    path: ['toStage']
});

module.exports = {
    getQueueQuerySchema,
    transitionQueueSchema,
    assignQueueTaskSchema,
    releaseQueueTaskSchema
};
