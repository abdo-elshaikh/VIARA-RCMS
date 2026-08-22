const { z } = require('zod');
const { calendarDateSchema } = require('../utils/dateValidation');

/**
 * Patient validation schemas
 */

const optionalTrimmed = (max, message) => z.string()
    .max(max, message)
    .trim()
    .optional();

const optionalNullableTrimmed = (max) => z.string()
    .max(max)
    .trim()
    .nullable()
    .optional();

const phoneSchema = z.string()
    .regex(/^\d{10,15}$/, 'Phone must be 10-15 digits')
    .trim();

const communicationPreferenceSchema = z.enum(['Phone', 'Email', 'SMS', 'WhatsApp']);
const mutablePatientStatusSchema = z.enum(['Active', 'Inactive', 'Deceased', 'Merged', 'Restricted']);
const patientStatusSchema = z.enum(['Active', 'Inactive', 'Deceased', 'Merged', 'Restricted', 'Anonymized']);
const pregnancyStatusSchema = z.enum(['Unknown', 'Not Pregnant', 'Pregnant', 'Possibly Pregnant', 'Not Applicable']);

// Create patient schema
const createPatientSchema = z.object({
    mrn: z.string()
        .max(50, 'MRN must be less than 50 characters')
        .trim()
        .optional(),

    firstName: z.string()
        .min(1, 'First name is required')
        .max(100, 'First name must be less than 100 characters')
        .trim(),

    lastName: z.string()
        .min(1, 'Last name is required')
        .max(100, 'Last name must be less than 100 characters')
        .trim(),

    dateOfBirth: calendarDateSchema('Date of birth must be a valid YYYY-MM-DD date')
        .refine((date) => {
            const dob = new Date(date);
            const now = new Date();
            return dob < now;
        }, 'Date of birth must be in the past'),

    phone: phoneSchema,

    address: z.string()
        .min(5, 'Address must be at least 5 characters')
        .max(500, 'Address must be less than 500 characters')
        .trim()
        .optional(),

    gender: z.enum(['Male', 'Female', 'Other'], {
        errorMap: () => ({ message: 'Gender must be Male, Female, or Other' })
    }).optional(),

    email: z.string()
        .email('Invalid email format')
        .max(150, 'Email must be less than 150 characters')
        .optional(),

    nationalId: optionalTrimmed(50, 'National ID must be less than 50 characters'),
    passportNumber: optionalTrimmed(50, 'Passport number must be less than 50 characters'),
    emergencyContactName: optionalTrimmed(150, 'Emergency contact name must be less than 150 characters'),
    emergencyContactPhone: phoneSchema.optional(),
    emergencyContactRelationship: optionalTrimmed(100, 'Relationship must be less than 100 characters'),
    emergencyContactAddress: optionalTrimmed(500, 'Emergency contact address must be less than 500 characters'),

    allergies: optionalTrimmed(1000, 'Allergies must be less than 1000 characters'),
    chronicDiseases: optionalTrimmed(1000, 'Chronic diseases must be less than 1000 characters'),
    priorSurgeries: optionalTrimmed(1000, 'Prior surgeries must be less than 1000 characters'),
    pregnancyStatus: pregnancyStatusSchema.optional(),
    implantsDevices: optionalTrimmed(1000, 'Implants/devices must be less than 1000 characters'),
    renalFunctionNotes: optionalTrimmed(1000, 'Renal function notes must be less than 1000 characters'),

    preferredLanguage: optionalTrimmed(50, 'Preferred language must be less than 50 characters'),
    communicationPreference: communicationPreferenceSchema.optional(),
    consentSms: z.boolean().optional(),
    consentEmail: z.boolean().optional(),
    consentWhatsapp: z.boolean().optional(),
    consentMarketing: z.boolean().optional(),
    patientStatus: mutablePatientStatusSchema.optional(),

    assignedManagerId: z.string()
        .uuid('Invalid manager ID format')
        .optional(),

    leadStatus: z.enum(['New', 'Processed', 'Qualified', 'Deferred'])
        .optional(),

    plannedActivity: z.string()
        .max(255, 'Planned activity must be less than 255 characters')
        .trim()
        .optional()
});

// Update patient schema (all fields optional)
const updatePatientSchema = z.object({
    mrn: z.string().max(50).trim().optional(),
    firstName: z.string().min(1).max(100).trim().optional(),
    lastName: z.string().min(1).max(100).trim().optional(),
    dateOfBirth: calendarDateSchema().refine(date => new Date(`${date}T00:00:00.000Z`) < new Date(), 'Date of birth must be in the past').optional(),
    phone: phoneSchema.optional(),
    address: z.string().min(5).max(500).trim().optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    email: z.string().email().max(150).optional(),
    nationalId: optionalNullableTrimmed(50),
    passportNumber: optionalNullableTrimmed(50),
    emergencyContactName: optionalNullableTrimmed(150),
    emergencyContactPhone: phoneSchema.nullable().optional(),
    emergencyContactRelationship: optionalNullableTrimmed(100),
    emergencyContactAddress: optionalNullableTrimmed(500),
    allergies: optionalNullableTrimmed(1000),
    chronicDiseases: optionalNullableTrimmed(1000),
    priorSurgeries: optionalNullableTrimmed(1000),
    pregnancyStatus: pregnancyStatusSchema.nullable().optional(),
    implantsDevices: optionalNullableTrimmed(1000),
    renalFunctionNotes: optionalNullableTrimmed(1000),
    preferredLanguage: optionalNullableTrimmed(50),
    communicationPreference: communicationPreferenceSchema.optional(),
    consentSms: z.boolean().optional(),
    consentEmail: z.boolean().optional(),
    consentWhatsapp: z.boolean().optional(),
    consentMarketing: z.boolean().optional(),
    patientStatus: mutablePatientStatusSchema.optional(),
    assignedManagerId: z.string().uuid().nullable().optional(),
    leadStatus: z.enum(['New', 'Processed', 'Qualified', 'Deferred']).optional(),
    plannedActivity: z.string().max(255).trim().nullable().optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Get patients query schema
const getPatientsQuerySchema = z.object({
    search: z.string().optional(),
    q: z.string().optional(),
    page: z.string().regex(/^\d+$/).transform(Number).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional(),
    status: patientStatusSchema.optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    sortBy: z.enum(['mrn', 'gender', 'dateOfBirth', 'createdAt']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional()
});

const getDuplicatePatientsQuerySchema = z.object({
    mrn: z.string().trim().optional(),
    nationalId: z.string().trim().optional(),
    passportNumber: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    dateOfBirth: calendarDateSchema().optional()
}).refine((data) => Object.values(data).some(Boolean), {
    message: 'At least one duplicate search field is required'
});

const mergePatientsSchema = z.object({
    sourcePatientId: z.string().uuid('Invalid source patient ID'),
    reason: z.string().min(5).max(500).trim()
});

module.exports = {
    createPatientSchema,
    updatePatientSchema,
    getPatientsQuerySchema,
    getDuplicatePatientsQuerySchema,
    mergePatientsSchema
};
