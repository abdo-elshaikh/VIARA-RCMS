const { z } = require('zod');

// ─── Integration Schemas ────────────────────────────────────────────────────

const updateIntegrationSchema = z.object({
    api_key: z.string().max(500).optional().nullable(),
    api_secret: z.string().max(500).optional().nullable(),
    webhook_url: z.string().url().optional().nullable(),
    is_active: z.boolean().optional()
});

const triggerTestSmsSchema = z.object({
    phone: z.string().min(7).max(20),
    message: z.string().min(1).max(500)
});

module.exports = {
    updateIntegrationSchema,
    triggerTestSmsSchema
};
