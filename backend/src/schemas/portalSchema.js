const { z } = require('zod');

const appointmentRequestSchema = z.object({
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferredTimeWindow: z.string().trim().max(50).optional(),
    modalityType: z.string().trim().max(30).optional(),
    examTypeId: z.string().uuid().optional(),
    clinicalNotes: z.string().trim().max(1500).optional(),
    contactPhone: z.string().trim().max(50).optional(),
    contactEmail: z.string().email().max(150).optional()
}).refine((data) => data.preferredDate || data.modalityType || data.examTypeId || data.clinicalNotes, {
    message: 'At least one appointment request detail is required'
});

const profileUpdateRequestSchema = z.object({
    phone: z.string().trim().max(50).optional(),
    email: z.string().email().max(150).optional(),
    address: z.string().trim().max(500).optional(),
    emergencyContactName: z.string().trim().max(150).optional(),
    emergencyContactPhone: z.string().trim().max(50).optional(),
    preferredLanguage: z.string().trim().max(50).optional(),
    communicationPreference: z.enum(['Phone', 'Email', 'SMS', 'WhatsApp']).optional(),
    notes: z.string().trim().max(1000).optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one profile update field is required'
});

const reviewAppointmentRequestSchema = z.object({
    status: z.enum(['Reviewed', 'Rejected']),
    staffNotes: z.string().trim().min(3).max(1000)
});

const reviewProfileUpdateRequestSchema = z.object({
    status: z.enum(['Approved', 'Rejected']),
    staffNotes: z.string().trim().min(3).max(1000)
});

module.exports = {
    appointmentRequestSchema,
    profileUpdateRequestSchema,
    reviewAppointmentRequestSchema,
    reviewProfileUpdateRequestSchema
};
