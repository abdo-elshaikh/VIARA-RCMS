const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');

// ─── CRM Activities ───────────────────────────────────────────────────────────

const createCrmActivitySchema = z.object({
    patientId: z.string().uuid(),
    assignedTo: z.string().uuid().optional().nullable(),
    activityType: z.enum(['Call', 'WhatsApp', 'Visit', 'Email', 'Feedback Follow-up', 'Patient Reminder']),
    dueDate: z.string().datetime().optional(),
    notes: z.string().optional()
}).superRefine((data, ctx) => {
    if (data.activityType === 'Patient Reminder' && !data.dueDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dueDate'],
            message: 'Patient reminders require a follow-up date'
        });
    }
});

const updateCrmActivitySchema = z.object({
    status: z.enum(['Pending', 'Completed', 'Cancelled']).optional(),
    notes: z.string().optional(),
    dueDate: z.string().datetime().optional()
});

// ─── Patient Segments ─────────────────────────────────────────────────────────

const createSegmentSchema = z.object({
    name: z.string().min(2).max(100),
    description: z.string().optional()
});

const addSegmentMemberSchema = z.object({
    patientId: z.string().uuid()
});

// ─── Marketing Campaigns ──────────────────────────────────────────────────────

const createCampaignSchema = z.object({
    name: z.string().min(2).max(150),
    messageSubject: z.string().max(200).optional().nullable(),
    messageBody: z.string().trim().min(10).max(1600),
    targetSegment: z.string().uuid().optional().nullable(),
    channel: z.enum(['SMS', 'Email', 'WhatsApp']),
    budget: z.number().min(0).optional(),
    startDate: calendarDateSchema().optional(),
    endDate: calendarDateSchema().optional()
}).superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'Campaign end date must be on or after the start date'
        });
    }
});

const updateCampaignStatusSchema = z.object({
    status: z.enum(['Active', 'Completed', 'Cancelled'])
});

// ─── Feedback & Loyalty ───────────────────────────────────────────────────────

const submitFeedbackSchema = z.object({
    patientId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comments: z.string().optional(),
    source: z.enum(['Survey', 'Kiosk', 'Phone', 'Portal']).optional()
});

const updateLoyaltySchema = z.object({
    points: z.number().int().min(-100000).max(100000).refine(value => value !== 0, 'Points adjustment cannot be zero')
});

module.exports = {
    createCrmActivitySchema, updateCrmActivitySchema,
    createSegmentSchema, addSegmentMemberSchema,
    createCampaignSchema, updateCampaignStatusSchema,
    submitFeedbackSchema, updateLoyaltySchema
};
