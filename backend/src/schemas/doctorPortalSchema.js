const { z } = require('zod');

const doctorLoginSchema = z.object({
    email: z.string().email().max(150),
    password: z.string().min(1).max(200)
});

const portalPasswordSchema = z.string().min(8).max(100)
        .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Must contain at least one number');

const setPortalPasswordSchema = z.object({
    password: portalPasswordSchema.optional()
});

const doctorOrderSchema = z.object({
    patientMrn: z.string().trim().min(1).max(50),
    modalityType: z.string().trim().max(30).optional(),
    examTypeId: z.string().uuid().optional(),
    clinicalNotes: z.string().trim().max(2000).optional(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferredTimeWindow: z.string().trim().max(50).optional(),
    contactPhone: z.string().trim().max(50).optional()
}).refine((d) => d.modalityType || d.examTypeId || d.clinicalNotes, {
    message: 'At least one of modalityType, examTypeId, or clinicalNotes is required'
});

const doctorMessageSchema = z.object({
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().min(1).max(3000),
    appointmentId: z.string().uuid().optional(),
    examId: z.string().uuid().optional()
});

module.exports = {
    doctorLoginSchema,
    setPortalPasswordSchema,
    doctorOrderSchema,
    doctorMessageSchema
};
