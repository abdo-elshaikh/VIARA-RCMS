const { z } = require('zod');

// ─── Integration Schemas ────────────────────────────────────────────────────

const httpUrl = z.string().max(2048).url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
}, 'URL must use HTTP or HTTPS');

const providerConfigSchema = z.object({
    realm_id: z.string().trim().max(100).optional(),
    environment: z.enum(['sandbox', 'production']).optional(),
    orthanc_url: httpUrl.optional()
}).strict();

const updateIntegrationSchema = z.object({
    api_key: z.string().max(4000).optional().nullable(),
    api_secret: z.string().max(4000).optional().nullable(),
    webhook_url: httpUrl.or(z.literal('')).optional().nullable(),
    webhook_secret: z.string().max(4000).or(z.literal('')).optional().nullable(),
    sender_identity: z.string().max(100).or(z.literal('')).optional().nullable(),
    is_active: z.boolean().optional(),
    config_version: z.number().int().positive().optional(),
    extra_config: providerConfigSchema.optional().nullable(),
    clear_fields: z.array(z.enum(['api_key', 'api_secret', 'webhook_url', 'webhook_secret', 'sender_identity'])).optional()
});

const triggerTestSmsSchema = z.object({
    phone: z.string().min(7).max(20),
    message: z.string().min(1).max(500)
});

const exportAccountingQuerySchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid start date format (YYYY-MM-DD)').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date format (YYYY-MM-DD)').optional()
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: 'startDate must be before or equal to endDate'
});

module.exports = {
    updateIntegrationSchema,
    triggerTestSmsSchema,
    exportAccountingQuerySchema
};
