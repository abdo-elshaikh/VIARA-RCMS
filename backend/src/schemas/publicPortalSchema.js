const { z } = require('zod');

const identifier = z.string().trim().min(3).max(50)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Enter a valid medical record number or order number.');

const publicCaseVerificationRequestSchema = z.object({
    mrn: identifier,
    language: z.enum(['ar', 'en']).optional().default('en'),
    resend: z.boolean().optional().default(false),
}).strict();

const publicCaseVerificationConfirmSchema = z.object({
    challengeId: z.string().uuid(),
    code: z.string().trim().regex(/^\d{6}$/),
}).strict();

const publicCaseStatusRefreshSchema = z.object({
    statusToken: z.string().min(20).max(4096),
}).strict();

const publicAppointmentRequestSchema = z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30).regex(/^\+?[0-9 ()-]+$/),
    mode: z.enum(['center', 'home', 'consult']),
    service: z.string().trim().min(2).max(180),
    preferredDate: z.string().date().optional().nullable(),
    consent: z.literal(true),
    website: z.string().max(0).optional().default(''),
}).strict();

module.exports = {
    publicCaseVerificationRequestSchema,
    publicCaseVerificationConfirmSchema,
    publicCaseStatusRefreshSchema,
    publicAppointmentRequestSchema,
};
