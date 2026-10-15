const { z } = require('zod');

const timeZoneSchema = z.string().trim().min(1).max(80).refine((value) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}, 'Invalid IANA timezone');

const getNotificationsQuerySchema = z.object({
    channel: z.enum(['Email', 'SMS', 'WhatsApp', 'InApp']).optional(),
    status: z.enum(['Sent', 'Delivered', 'Failed', 'Pending']).optional(),
    eventType: z.string().trim().max(80).optional(),
    category: z.enum(['Security', 'Clinical', 'Financial', 'Operational', 'Patient', 'System']).optional(),
    priority: z.enum(['Normal', 'Action', 'Warning', 'Critical']).optional(),
    readState: z.enum(['all', 'read', 'unread']).default('all'),
    q: z.string().trim().max(120).optional(),
    patientId: z.string().uuid().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    view: z.enum(['all', 'unread', 'failed']).default('all'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
}).refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate']
});

const getNotificationJobsQuerySchema = z.object({
    status: z.enum(['Pending', 'Processing', 'Sent', 'Failed', 'DeadLetter', 'Cancelled', 'Skipped']).optional(),
    eventType: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0)
});

const notificationTemplateSchema = z.object({
    eventType: z.string().trim().min(1).max(80),
    channel: z.enum(['Email', 'SMS', 'WhatsApp', 'InApp']),
    language: z.enum(['ar', 'en']).default('en'),
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
    inappEnabled: z.boolean().optional(),
    notifyAppointmentCreated: z.boolean().optional(),
    notifyAppointmentReminder: z.boolean().optional(),
    notifyAppointmentRescheduled: z.boolean().optional(),
    notifyAppointmentCancelled: z.boolean().optional(),
    notifyPrepInstructions: z.boolean().optional(),
    notifyPaymentDue: z.boolean().optional(),
    notifyReportReady: z.boolean().optional(),
    notifyResultDelivered: z.boolean().optional(),
    notifyFollowupReminder: z.boolean().optional(),
    notifyMarketing: z.boolean().optional(),
    notifySecurityEvent: z.boolean().optional(),
    notifyStaffLifecycle: z.boolean().optional(),
    notifyOrderEvents: z.boolean().optional(),
    notifyQueueChange: z.boolean().optional(),
    notifyPacsAlert: z.boolean().optional(),
    notifyBackupStatus: z.boolean().optional(),
    notifyPrivacyRequest: z.boolean().optional(),
    notifyChatMessage: z.boolean().optional(),
    notifyInventoryExpiry: z.boolean().optional(),
    notifyClaimUpdate: z.boolean().optional(),
    notifyPaymentUpdate: z.boolean().optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z.number().int().min(0).max(23).optional(),
    quietHoursEnd: z.number().int().min(0).max(23).optional(),
    timeZone: timeZoneSchema.optional()
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

const staffHourSchema = z.union([
    z.number().int().min(0).max(23),
    z.string().regex(/^([01]\d|2[0-3]):00$/, 'Quiet-hour time must use whole hours')
]).transform(value => typeof value === 'number' ? value : Number(value.slice(0, 2)));

const updateStaffPreferencesSchema = z.object({
    email_enabled: z.boolean().optional(),
    sms_enabled: z.boolean().optional(),
    whatsapp_enabled: z.boolean().optional(),
    inapp_enabled: z.boolean().optional(),
    notify_security_event: z.boolean().optional(),
    notify_staff_lifecycle: z.boolean().optional(),
    notify_order_events: z.boolean().optional(),
    notify_queue_change: z.boolean().optional(),
    notify_pacs_alert: z.boolean().optional(),
    notify_backup_status: z.boolean().optional(),
    notify_privacy_request: z.boolean().optional(),
    notify_chat_message: z.boolean().optional(),
    notify_inventory_expiry: z.boolean().optional(),
    notify_claim_update: z.boolean().optional(),
    notify_payment_update: z.boolean().optional(),
    quiet_hours_enabled: z.boolean().optional(),
    quiet_hours_start: staffHourSchema.optional(),
    quiet_hours_end: staffHourSchema.optional(),
    time_zone: timeZoneSchema.optional()
}).strict().refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

const notificationPreferencesQuerySchema = z.object({
    patientId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional()
}).refine(d => Boolean(d.patientId) !== Boolean(d.doctorId), {
    message: 'Provide exactly one of patientId or doctorId'
});

const reminderSchema = z.object({
    appointmentId: z.string().uuid()
}).strict();

const unsubscribeSchema = z.object({
    phone: z.string().trim().min(7).max(50).optional(),
    email: z.string().trim().email().optional(),
    token: z.string().trim().min(20).max(512)
}).refine(d => Boolean(d.phone) !== Boolean(d.email), {
    message: 'Provide exactly one of phone or email'
});

module.exports = {
    getNotificationsQuerySchema,
    getNotificationJobsQuerySchema,
    notificationTemplateSchema,
    updateNotificationTemplateSchema,
    manualSendSchema,
    updatePreferencesSchema,
    updateStaffPreferencesSchema,
    notificationPreferencesQuerySchema,
    reminderSchema,
    unsubscribeSchema
};
