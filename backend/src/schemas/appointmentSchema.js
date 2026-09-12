const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');

/**
 * Appointment validation schemas
 */

const appointmentSourceSchema = z.enum(['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center']);
const preparationStatusSchema = z.enum(['Not Required', 'Pending', 'Completed', 'Waived']);
const waitlistStatusSchema = z.enum(['Waiting', 'Contacted', 'Offered', 'Scheduled', 'Declined', 'Expired', 'Cancelled']);
const prioritySchema = z.enum(['Routine', 'Urgent', 'Emergency']);
const safetyStatusSchema = z.enum(['Unknown', 'Cleared', 'At Risk', 'Not Applicable']);
const strictBooleanSchema = z.preprocess((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}, z.boolean());
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

    roomId: optionalNullableUuid('room'),

    examTypeId: z.string()
        .uuid('Invalid exam type ID format')
        .optional(),

    startTime: z.preprocess(
        (val) => {
            if (!val || typeof val !== 'string') return val;
            const d = new Date(val);
            return isNaN(d.getTime()) ? val : d.toISOString();
        },
        z.string().datetime('Invalid start time format')
    ),

    endTime: z.preprocess(
        (val) => {
            if (!val || typeof val !== 'string') return val;
            const d = new Date(val);
            return isNaN(d.getTime()) ? val : d.toISOString();
        },
        z.string().datetime('Invalid end time format')
    ),

    notes: optionalNullableTrimmedText(1000, 'Notes'),

    referringDoctor: optionalNullableTrimmedText(255, 'Referring doctor'),
    referringDoctorId: optionalNullableUuid('referring doctor'),

    appointmentSource: appointmentSourceSchema.optional(),
    preparationStatus: preparationStatusSchema.optional(),
    priority: prioritySchema.optional(),
    clinicalIndication: optionalTrimmedText(2000, 'Clinical indication'),
    provisionalDiagnosis: optionalTrimmedText(500, 'Provisional diagnosis'),
    icdCode: z.string().trim().max(30, 'ICD code must be less than 30 characters').optional(),
    bodyPart: z.string().trim().max(100, 'Body part must be less than 100 characters').optional(),
    contrastRequired: strictBooleanSchema.optional(),
    pregnancySafetyStatus: safetyStatusSchema.optional(),
    implantSafetyStatus: safetyStatusSchema.optional(),
    renalSafetyStatus: safetyStatusSchema.optional(),
    isFollowUp: z.boolean().optional(),
    priorExamId: z.string().uuid('Invalid prior exam ID format').nullable().optional(),
    followUpReason: z.string().trim().max(1000, 'Follow-up reason must be less than 1000 characters').nullable().optional(),

    technicianId: optionalNullableUuid('technician'),
    nurseId: optionalNullableUuid('nurse'),
    radiologistId: optionalNullableUuid('radiologist'),
    assignmentReason: z.string().trim().min(3).max(1000).optional(),

    paymentMethod: z.enum(['Cash', 'Credit Card', 'Insurance', 'Card', 'Wallet', 'Bank Transfer', 'Installment', 'Corporate']).optional(),
    paymentAmount: z.coerce.number().min(0, 'Payment amount cannot be negative').nullable().optional(),
    arrived: strictBooleanSchema.optional(),
    waitlistId: optionalNullableUuid('waiting list'),
    idempotencyKey: z.string().optional(),
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
    // Allow same-day appointments up to 24 hours in past for walk-in / quick booking
    return start.getTime() > now.getTime() - 24 * 60 * 60 * 1000;
}, {
    message: 'Start time must be valid',
    path: ['startTime']
}).refine((data) => !data.isFollowUp || Boolean(data.priorExamId), {
    message: 'Select the prior examination for this follow-up',
    path: ['priorExamId']
});

// Update appointment schema
const updateAppointmentSchema = z.object({
    patientId: z.string().uuid('Invalid patient ID format').optional(),
    modalityId: z.string().uuid('Invalid modality ID format').optional(),
    roomId: optionalNullableUuid('room'),
    examTypeId: z.string().uuid('Invalid exam type ID format').optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    status: z.enum(['Scheduled', 'Confirmed', 'Arrived', 'Checked-in']).optional(),
    notes: optionalNullableTrimmedText(1000, 'Notes'),
    referringDoctor: optionalNullableTrimmedText(255, 'Referring doctor'),
    referringDoctorId: optionalNullableUuid('referring doctor'),
    appointmentSource: appointmentSourceSchema.optional(),
    preparationStatus: preparationStatusSchema.optional(),
    priority: prioritySchema.optional(),
    clinicalIndication: optionalTrimmedText(2000, 'Clinical indication'),
    provisionalDiagnosis: optionalTrimmedText(500, 'Provisional diagnosis'),
    icdCode: z.string().trim().max(30, 'ICD code must be less than 30 characters').nullable().optional(),
    bodyPart: z.string().trim().max(100, 'Body part must be less than 100 characters').nullable().optional(),
    contrastRequired: strictBooleanSchema.optional(),
    pregnancySafetyStatus: safetyStatusSchema.optional(),
    implantSafetyStatus: safetyStatusSchema.optional(),
    renalSafetyStatus: safetyStatusSchema.optional(),
    isFollowUp: z.boolean().optional(),
    priorExamId: z.string().uuid('Invalid prior exam ID format').nullable().optional(),
    followUpReason: z.string().trim().max(1000, 'Follow-up reason must be less than 1000 characters').nullable().optional(),
    technicianId: optionalNullableUuid('technician'),
    nurseId: optionalNullableUuid('nurse'),
    radiologistId: optionalNullableUuid('radiologist'),
    assignmentReason: z.string().trim().min(3).max(1000).optional(),
    paymentMethod: z.enum(['Cash', 'Credit Card', 'Insurance', 'Card', 'Wallet', 'Bank Transfer', 'Installment', 'Corporate']).optional(),
    paymentAmount: z.coerce.number().min(0, 'Payment amount cannot be negative').nullable().optional()
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
    roomId: z.string().uuid().optional(),
    roomNumber: z.string().optional(),
    receptionistId: z.string().uuid().optional(),
    status: z.enum(['Scheduled', 'Confirmed', 'Cancelled', 'No-Show', 'Completed', 'Arrived', 'Checked-in']).optional(),
    appointmentSource: appointmentSourceSchema.optional(),
    preparationStatus: preparationStatusSchema.optional(),
    priority: prioritySchema.optional(),
    assignedStaffId: z.string().uuid().optional(),
    date: calendarDateSchema().optional(),
    startDate: calendarDateSchema().optional(),
    endDate: calendarDateSchema().optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

const availabilityQuerySchema = z.object({
    date: calendarDateSchema().optional(),
    startDate: calendarDateSchema().optional(),
    endDate: calendarDateSchema().optional()
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
    modalityId: optionalNullableUuid('modality'),
    examTypeId: optionalNullableUuid('exam type'),
    preferredDate: calendarDateSchema().optional(),
    preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    preferredEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    priority: prioritySchema.optional(),
    source: appointmentSourceSchema.optional(),
    notes: z.string().max(1000).trim().optional()
}).refine((data) => {
    if (data.preferredStartTime && data.preferredEndTime) {
        return data.preferredEndTime > data.preferredStartTime;
    }
    return true;
}, {
    message: 'Preferred end time must be after start time',
    path: ['preferredEndTime']
}).refine((data) => {
    if (data.preferredDate) {
        const today = new Date().toISOString().slice(0, 10);
        return data.preferredDate >= today;
    }
    return true;
}, {
    message: 'Preferred date cannot be in the past',
    path: ['preferredDate']
});

const updateWaitingListSchema = z.object({
    patientId: z.string().uuid('Invalid patient ID format').optional(),
    modalityId: optionalNullableUuid('modality'),
    examTypeId: optionalNullableUuid('exam type'),
    preferredDate: calendarDateSchema().nullable().optional(),
    preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    preferredEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    priority: prioritySchema.optional(),
    source: appointmentSourceSchema.optional(),
    status: waitlistStatusSchema.optional(),
    notes: z.string().max(1000).trim().nullable().optional(),
    assignedAppointmentId: optionalNullableUuid('appointment')
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
}).refine((data) => {
    if (data.preferredStartTime && data.preferredEndTime) {
        return data.preferredEndTime > data.preferredStartTime;
    }
    return true;
}, {
    message: 'Preferred end time must be after start time',
    path: ['preferredEndTime']
});

const getWaitingListQuerySchema = z.object({
    status: waitlistStatusSchema.optional(),
    active: z.enum(['true', 'false']).optional(),
    modalityId: optionalNullableUuid('modality'),
    date: calendarDateSchema().optional(),
    q: z.string().max(100).optional(),
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
