const { z } = require('zod');

/**
 * Appointment validation schemas
 */

const appointmentSourceSchema = z.enum(['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center']);
const preparationStatusSchema = z.enum(['Not Required', 'Pending', 'Completed', 'Waived']);
const waitlistStatusSchema = z.enum(['Waiting', 'Contacted', 'Scheduled', 'Cancelled']);
const prioritySchema = z.enum(['Routine', 'Urgent', 'Emergency']);
const safetyStatusSchema = z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']);
const optionalTrimmedText = (max, label) => z.string()
    .trim()
    .max(max, `${label} must be less than ${max} characters`)
    .optional();
const optionalNullableTrimmedText = (max, label) => z.preprocess(
    value => value === '' ? null : value,
    z.string().trim().max(max, `${label} must be less than ${max} characters`).nullable().optional()
);
const normalizeNullableInput = (value) => {
    if (value === null || value === '') return null;
    if (typeof value !== 'string') return value;

    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'null' || normalized === 'undefined'
        ? null
        : value;
};
const optionalNullableUuid = (label) => z.preprocess(
    normalizeNullableInput,
    z.string().uuid(`Invalid ${label} ID format`).nullable().optional()
);

// Create appointment schema
const createAppointmentSchema = z.object({
    patientId: z.string()
        .uuid('Invalid patient ID format'),

    modalityId: z.string()
        .uuid('Invalid modality ID format'),

    examTypeId: z.string()
        .uuid('Invalid exam type ID format')
        .optional(),

    startTime: z.string()
        .datetime('Invalid start time format'),

    endTime: z.string()
        .datetime('Invalid end time format'),

    notes: z.string()
        .max(1000, 'Notes must be less than 1000 characters')
        .optional(),

    referringDoctor: optionalNullableTrimmedText(255, 'Referring doctor'),
    referringDoctorId: optionalNullableUuid('referring doctor'),

    appointmentSource: appointmentSourceSchema.optional(),
    preparationStatus: preparationStatusSchema.optional(),
    priority: prioritySchema.optional(),
    clinicalIndication: optionalTrimmedText(2000, 'Clinical indication'),
    provisionalDiagnosis: optionalTrimmedText(500, 'Provisional diagnosis'),
    icdCode: z.string().trim().max(30, 'ICD code must be less than 30 characters').optional(),
    bodyPart: z.string().trim().max(100, 'Body part must be less than 100 characters').optional(),
    contrastRequired: z.coerce.boolean().optional(),
    pregnancySafetyStatus: safetyStatusSchema.optional(),
    implantSafetyStatus: safetyStatusSchema.optional(),
    renalSafetyStatus: safetyStatusSchema.optional(),
    isFollowUp: z.boolean().optional(),
    priorExamId: z.string().uuid('Invalid prior exam ID format').nullable().optional(),
    followUpReason: z.string().trim().max(1000, 'Follow-up reason must be less than 1000 characters').nullable().optional(),

    technicianId: optionalNullableUuid('technician'),
    nurseId: optionalNullableUuid('nurse'),
    radiologistId: optionalNullableUuid('radiologist'),

    paymentMethod: z.enum(['Cash', 'Credit Card', 'Insurance', 'Card', 'Wallet', 'Bank Transfer', 'Installment', 'Corporate']).optional(),
    paymentAmount: z.coerce.number().min(0, 'Payment amount cannot be negative').optional(),
    arrived: z.coerce.boolean().optional(),
}).refine((data) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    return end > start;
}, {
    message: 'End time must be after start time',
    path: ['endTime']
}).refine((data) => {
    if (data.arrived) return true;
    const start = new Date(data.startTime);
    const now = new Date();
    return start.getTime() > now.getTime() - 5 * 60 * 1000;
}, {
    message: 'Start time must be in the future',
    path: ['startTime']
}).refine((data) => !data.isFollowUp || Boolean(data.priorExamId), {
    message: 'Select the prior examination for this follow-up',
    path: ['priorExamId']
});

// Update appointment schema
const updateAppointmentSchema = z.object({
    patientId: z.string().uuid('Invalid patient ID format').optional(),
    modalityId: z.string().uuid('Invalid modality ID format').optional(),
    examTypeId: z.string().uuid('Invalid exam type ID format').optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    status: z.enum(['Confirmed', 'Cancelled', 'No-Show', 'Completed', 'Arrived', 'Checked-in']).optional(),
    notes: z.string().max(1000).optional(),
    referringDoctor: optionalNullableTrimmedText(255, 'Referring doctor'),
    referringDoctorId: optionalNullableUuid('referring doctor'),
    appointmentSource: appointmentSourceSchema.optional(),
    preparationStatus: preparationStatusSchema.optional(),
    priority: prioritySchema.optional(),
    clinicalIndication: optionalTrimmedText(2000, 'Clinical indication'),
    provisionalDiagnosis: optionalTrimmedText(500, 'Provisional diagnosis'),
    icdCode: z.string().trim().max(30, 'ICD code must be less than 30 characters').nullable().optional(),
    bodyPart: z.string().trim().max(100, 'Body part must be less than 100 characters').nullable().optional(),
    contrastRequired: z.coerce.boolean().optional(),
    pregnancySafetyStatus: safetyStatusSchema.optional(),
    implantSafetyStatus: safetyStatusSchema.optional(),
    renalSafetyStatus: safetyStatusSchema.optional(),
    isFollowUp: z.boolean().optional(),
    priorExamId: z.string().uuid('Invalid prior exam ID format').nullable().optional(),
    followUpReason: z.string().trim().max(1000, 'Follow-up reason must be less than 1000 characters').nullable().optional(),
    cancellationReason: z.string().max(1000).optional(),
    technicianId: optionalNullableUuid('technician'),
    nurseId: optionalNullableUuid('nurse'),
    radiologistId: optionalNullableUuid('radiologist'),
    paymentMethod: z.enum(['Cash', 'Credit Card', 'Insurance', 'Card', 'Wallet', 'Bank Transfer', 'Installment', 'Corporate']).optional(),
    paymentAmount: z.coerce.number().min(0, 'Payment amount cannot be negative').optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
}).refine((data) => {
    if (!data.startTime || !data.endTime) return true;
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    return end > start;
}, {
    message: 'End time must be after start time',
    path: ['endTime']
});

// Get appointments query schema
const getAppointmentsQuerySchema = z.object({
    patientId: z.string().uuid().optional(),
    modalityId: z.string().uuid().optional(),
    // #23 — 'Scheduled' added to allow filtering by that status without a 400 error
    status: z.enum(['Scheduled', 'Confirmed', 'Cancelled', 'No-Show', 'Completed', 'Arrived', 'Checked-in']).optional(),
    appointmentSource: appointmentSourceSchema.optional(),
    preparationStatus: preparationStatusSchema.optional(),
    priority: prioritySchema.optional(),
    assignedStaffId: z.string().uuid().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

const availabilityQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const noShowAppointmentSchema = z.object({
    reason: z.string().max(1000).trim().optional()
});

const rescheduleAppointmentSchema = z.object({
    startTime: z.string().datetime('Invalid start time format'),
    endTime: z.string().datetime('Invalid end time format'),
    reason: z.string().max(1000).trim().optional()
}).refine((data) => {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    return end > start;
}, {
    message: 'End time must be after start time',
    path: ['endTime']
});

const createWaitingListSchema = z.object({
    patientId: z.string().uuid('Invalid patient ID format'),
    modalityId: z.string().uuid('Invalid modality ID format').optional(),
    examTypeId: z.string().uuid('Invalid exam type ID format').optional(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    preferredEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    priority: prioritySchema.optional(),
    source: appointmentSourceSchema.optional(),
    notes: z.string().max(1000).trim().optional()
});

const updateWaitingListSchema = z.object({
    patientId: z.string().uuid('Invalid patient ID format').optional(),
    modalityId: z.string().uuid('Invalid modality ID format').nullable().optional(),
    examTypeId: z.string().uuid('Invalid exam type ID format').nullable().optional(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    preferredEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    priority: prioritySchema.optional(),
    source: appointmentSourceSchema.optional(),
    status: waitlistStatusSchema.optional(),
    notes: z.string().max(1000).trim().nullable().optional(),
    assignedAppointmentId: z.string().uuid('Invalid appointment ID format').nullable().optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

const getWaitingListQuerySchema = z.object({
    status: waitlistStatusSchema.optional(),
    modalityId: z.string().uuid().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

module.exports = {
    createAppointmentSchema,
    updateAppointmentSchema,
    getAppointmentsQuerySchema,
    availabilityQuerySchema,
    noShowAppointmentSchema,
    rescheduleAppointmentSchema,
    createWaitingListSchema,
    updateWaitingListSchema,
    getWaitingListQuerySchema
};
