const { z } = require('zod');

const getNotificationsQuerySchema = z.object({
    channel: z.enum(['Email', 'SMS', 'WhatsApp', 'InApp']).optional(),
    status: z.enum(['Sent', 'Delivered', 'Failed', 'Pending']).optional(),
    eventType: z.string().trim().max(80).optional(),
    q: z.string().trim().max(120).optional(),
    patientId: z.string().uuid().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
}).refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate']
});

const getNotificationJobsQuerySchema = z.object({
    status: z.enum(['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled', 'Skipped']).optional(),
    eventType: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});

const notificationTemplateSchema = z.object({
    eventType: z.string().trim().min(1).max(80),
    channel: z.enum(['Email', 'SMS', 'WhatsApp', 'InApp']),
    language: z.string().trim().max(10).default('en'),
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1).max(5000),
    isActive: z.boolean().default(true)
});

const updateNotificationTemplateSchema = z.object({
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    isActive: z.boolean().optional()
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

const manualSendSchema = z.object({
    recipientEmail: z.string().email().optional(),
    recipientPhone: z.string().trim().max(50).optional(),
    channel: z.enum(['Email', 'SMS', 'WhatsApp']),
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1).max(3000),
    patientId: z.string().uuid().optional(),
    entityType: z.string().trim().max(50).optional(),
    entityId: z.string().uuid().optional()
}).refine(d => d.recipientEmail || d.recipientPhone || d.patientId, {
    message: 'Provide recipientEmail, recipientPhone, or patientId'
}).refine(d => d.patientId || d.channel !== 'Email' || !!d.recipientEmail, {
    message: 'Email notifications require recipientEmail or patientId'
}).refine(d => d.patientId || d.channel === 'Email' || !!d.recipientPhone, {
    message: 'SMS and WhatsApp notifications require recipientPhone or patientId'
});

const updatePreferencesSchema = z.object({
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    notifyAppointmentCreated: z.boolean().optional(),
    notifyAppointmentReminder: z.boolean().optional(),
    notifyAppointmentRescheduled: z.boolean().optional(),
    notifyAppointmentCancelled: z.boolean().optional(),
    notifyPrepInstructions: z.boolean().optional(),
    notifyPaymentDue: z.boolean().optional(),
    notifyReportReady: z.boolean().optional(),
    notifyResultDelivered: z.boolean().optional(),
    notifyFollowupReminder: z.boolean().optional(),
    notifyMarketing: z.boolean().optional()
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

const notificationPreferencesQuerySchema = z.object({
    patientId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional()
}).refine(d => Boolean(d.patientId) !== Boolean(d.doctorId), {
    message: 'Provide exactly one of patientId or doctorId'
});

const reminderSchema = z.object({
    appointmentId: z.string().uuid().optional(),
    recipientEmail: z.string().email(),
    patientName: z.string().trim().min(1).max(200),
    time: z.string().datetime({ offset: true })
});

const unsubscribeSchema = z.object({
    phone: z.string().trim().min(7).max(50).optional(),
    email: z.string().trim().email().optional()
}).refine(d => d.phone || d.email, {
    message: 'Provide phone or email'
});

module.exports = {
    getNotificationsQuerySchema,
    getNotificationJobsQuerySchema,
    notificationTemplateSchema,
    updateNotificationTemplateSchema,
    manualSendSchema,
    updatePreferencesSchema,
    notificationPreferencesQuerySchema,
    reminderSchema,
    unsubscribeSchema
};
