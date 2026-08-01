const { z } = require('zod');

// ─── Center Settings Schema ─────────────────────────────────────────────────

const updateCenterSettingsSchema = z.object({
    center_name: z.string().min(1).max(200).optional(),
    branch_name: z.string().max(200).optional().nullable(),
    logo_url: z.string().optional().nullable(),
    contact_person: z.string().max(200).optional().nullable(),
    other_details: z.string().optional().nullable(),
    tax_id: z.string().max(50).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    email: z.string().email().optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    invoice_prefix: z.string().max(20).optional().nullable(),
    report_header: z.string().max(500).optional().nullable(),
    report_footer: z.string().max(500).optional().nullable(),
    working_hours: z.object({}).passthrough().optional().nullable(),
    print_settings: z.object({
        stickerWidth: z.string().optional(),
        stickerHeight: z.string().optional(),
        receiptWidth: z.string().optional(),
        receiptHeader: z.string().optional(),
        receiptFooter: z.string().optional(),
        showQR: z.boolean().optional(),
        themeColor: z.string().max(30).optional(),
        fontFamily: z.string().max(80).optional(),
        invoiceTerms: z.string().optional(),
        showWatermark: z.boolean().optional(),
        headerLayout: z.string().max(40).optional(),
    }).passthrough().optional().nullable(),
    homepage_settings: z.object({
        enabled: z.boolean().optional(),
        heroTitle: z.string().max(220).optional().nullable(),
        heroSubtitle: z.string().max(700).optional().nullable(),
        announcement: z.string().max(220).optional().nullable(),
        heroImageUrl: z.string().max(1000).optional().nullable(),
        accentColor: z.string().max(30).optional().nullable(),
        primaryCtaLabel: z.string().max(80).optional().nullable(),
        primaryCtaUrl: z.string().max(500).optional().nullable(),
        secondaryCtaLabel: z.string().max(80).optional().nullable(),
        secondaryCtaUrl: z.string().max(500).optional().nullable(),
        services: z.array(z.object({}).passthrough()).optional(),
        stats: z.array(z.object({}).passthrough()).optional(),
        highlights: z.array(z.string().max(160)).optional(),
    }).passthrough().optional().nullable()
});

const aiProviderSchema = z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(['anthropic', 'openai', 'gemini', 'openrouter', 'groq', 'custom']).optional(),
    apiKey: z.string().max(1000).optional().nullable(),
    clearApiKey: z.boolean().optional(),
    model: z.string().max(160).optional().nullable(),
    baseUrl: z.string().max(1000).optional().nullable()
});

const pacsAiProviderSchema = z.object({
    enabled: z.boolean().optional(),
    provider: z.enum([
        'cloud-gemini',
        'cloud-openrouter',
        'cloud-openai',
        'cloud-custom',
        'local-torchxrayvision',
        'local-medgemma',
        'custom'
    ]).optional().nullable(),
    apiKey: z.string().max(1000).optional().nullable(),
    clearApiKey: z.boolean().optional(),
    model: z.string().max(160).optional().nullable(),
    modelVersion: z.string().max(80).optional().nullable(),
    workerUrl: z.string().max(1000).optional().nullable(),
    baseUrl: z.string().max(1000).optional().nullable()
});

const updateAiSettingsSchema = z.object({
    report: aiProviderSchema.optional(),
    pacs: pacsAiProviderSchema.optional()
});

const testAiSettingsSchema = z.object({
    target: z.enum(['report', 'pacs']).default('report')
});

const aiProfileSchema = z.object({
    target: z.enum(['report', 'pacs']),
    name: z.string().trim().min(2).max(80),
    enabled: z.boolean().optional(),
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().max(160).optional().nullable(),
    modelVersion: z.string().trim().max(80).optional().nullable(),
    baseUrl: z.string().trim().max(1000).optional().nullable(),
    workerUrl: z.string().trim().max(1000).optional().nullable(),
    apiKey: z.string().max(1000).optional().nullable(),
    clearApiKey: z.boolean().optional()
});

const updateAiProfileSchema = aiProfileSchema.partial().omit({ target: true });

const sslModes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];

const databaseConfigSchema = z.object({
    host: z.string().trim().min(1).max(255),
    port: z.coerce.number().int().min(1).max(65535).default(5432),
    database: z.string().trim().min(1).max(100),
    username: z.string().trim().min(1).max(100),
    password: z.string().max(1000).optional().nullable(),
    keepExistingPassword: z.boolean().optional(),
    sslMode: z.enum(sslModes).default('prefer'),
    poolMax: z.coerce.number().int().min(1).max(100).default(20),
    statementTimeoutMs: z.coerce.number().int().min(1000).max(600000).default(30000),
    idleTimeoutMs: z.coerce.number().int().min(1000).max(600000).default(30000)
});

const testDatabaseConfigSchema = z.object({
    target: z.enum(['active', 'saved', 'custom']).default('active'),
    config: databaseConfigSchema.optional()
}).refine((value) => value.target !== 'custom' || Boolean(value.config), {
    message: 'Custom database test requires config',
    path: ['config']
});

module.exports = {
    updateCenterSettingsSchema,
    updateAiSettingsSchema,
    testAiSettingsSchema,
    aiProfileSchema,
    updateAiProfileSchema,
    databaseConfigSchema,
    testDatabaseConfigSchema
};
