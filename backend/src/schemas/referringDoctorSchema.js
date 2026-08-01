const { z } = require('zod');

const contactMethodSchema = z.enum(['Phone', 'Email', 'SMS', 'WhatsApp']);

const createReferringDoctorSchema = z.object({
    fullName: z.string().min(1, 'Doctor name is required').max(150).trim(),
    specialty: z.string().max(100).trim().optional(),
    clinicHospital: z.string().max(150).trim().optional(),
    phone: z.string().max(50).trim().optional(),
    email: z.string().email().max(150).optional(),
    address: z.string().max(1000).trim().optional(),
    taxId: z.string().max(100).trim().optional(),
    contractId: z.string().uuid('Invalid contract ID format').optional(),
    referralSourceCategory: z.string().max(50).trim().optional(),
    commissionPercentage: z.coerce.number().min(0).max(100).optional(),
    preferredContactMethod: contactMethodSchema.optional(),
    notes: z.string().max(1000).trim().optional()
});

const updateReferringDoctorSchema = z.object({
    fullName: z.string().min(1).max(150).trim().optional(),
    specialty: z.string().max(100).trim().nullable().optional(),
    clinicHospital: z.string().max(150).trim().nullable().optional(),
    phone: z.string().max(50).trim().nullable().optional(),
    email: z.string().email().max(150).nullable().optional(),
    address: z.string().max(1000).trim().nullable().optional(),
    taxId: z.string().max(100).trim().nullable().optional(),
    contractId: z.string().uuid('Invalid contract ID format').nullable().optional(),
    referralSourceCategory: z.string().max(50).trim().nullable().optional(),
    commissionPercentage: z.coerce.number().min(0).max(100).optional(),
    preferredContactMethod: contactMethodSchema.optional(),
    isActive: z.boolean().optional(),
    notes: z.string().max(1000).trim().nullable().optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

const getReferringDoctorsQuerySchema = z.object({
    search: z.string().trim().optional(),
    active: z.enum(['true', 'false']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional()
});

module.exports = {
    createReferringDoctorSchema,
    updateReferringDoctorSchema,
    getReferringDoctorsQuerySchema
};
