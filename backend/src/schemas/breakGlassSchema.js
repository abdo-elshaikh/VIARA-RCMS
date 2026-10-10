const { z } = require('zod');

const requestBreakGlassSchema = z.object({
    reason: z.string()
        .trim()
        .min(20, 'A detailed clinical justification of at least 20 characters is required')
        .max(1000, 'Clinical justification must not exceed 1000 characters'),
    currentPassword: z.string()
        .min(1, 'Current password is required')
        .max(200, 'Current password is too long')
}).strict();

const revokeBreakGlassSchema = z.object({
    reason: z.string()
        .trim()
        .min(10, 'A revocation reason of at least 10 characters is required')
        .max(500, 'Revocation reason must not exceed 500 characters')
}).strict();

module.exports = { requestBreakGlassSchema, revokeBreakGlassSchema };
