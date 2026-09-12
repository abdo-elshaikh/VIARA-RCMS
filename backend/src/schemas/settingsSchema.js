const { z } = require('zod');
const { validateCustomAiEndpointUrl } = require('../utils/customAiEndpointUrl');
const { calendarDateSchema } = require('../utils/dateValidation');

const validateCustomBaseUrl = async (value, context, provider, path = ['baseUrl']) => {
    if (!value || !['custom', 'cloud-custom'].includes(provider)) return;
    try {
        await validateCustomAiEndpointUrl(value);
    } catch (error) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: error.message, path });
    }
};

const optionalEmail = z.union([z.string().email(), z.literal('')]).optional().nullable();
const timezoneSchema = z.string().max(80).refine((value) => {
    if (!value) return true;
    try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}, 'Invalid IANA timezone');
const workingHoursSchema = z.object({
    start: z.coerce.number().min(0).max(24),
    end: z.coerce.number().min(0).max(24),
    holidays: z.array(calendarDateSchema()).max(366).default([]),
    workingDays: z.array(z.number().int().min(0).max(6)).max(7).optional()
}).superRefine((value, context) => {
    if (value.end <= value.start) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['end'],
            message: 'Working hours end must be after start'
        });
    }
    if (value.workingDays && new Set(value.workingDays).size !== value.workingDays.length) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['workingDays'],
            message: 'Working days cannot contain duplicates'
        });
    }
});

// ─── Center Settings Schema ─────────────────────────────────────────────────

const updateCenterSettingsSchema = z.object({
    center_id: z.string().max(80).optional().nullable(),
    center_name: z.string().min(1).max(200).optional(),
    center_name_ar: z.string().max(200).optional().nullable(),
    legal_name: z.string().max(250).optional().nullable(),
    legal_name_ar: z.string().max(250).optional().nullable(),
    branch_id: z.string().max(80).optional().nullable(),
    branch_code: z.string().max(50).optional().nullable(),
    branch_name: z.string().max(200).optional().nullable(),
    branch_name_ar: z.string().max(200).optional().nullable(),
    branch_display_name: z.string().max(200).optional().nullable(),
    branch_display_name_ar: z.string().max(200).optional().nullable(),
    logo_url: z.string().optional().nullable(),
    logo_dark_url: z.string().optional().nullable(),
    logo_light_url: z.string().optional().nullable(),
    favicon_url: z.string().optional().nullable(),
    primary_color: z.string().max(30).optional().nullable(),
    secondary_color: z.string().max(30).optional().nullable(),
    accent_color: z.string().max(30).optional().nullable(),
    contact_person: z.string().max(200).optional().nullable(),
    other_details: z.string().optional().nullable(),
    tax_id: z.string().max(50).optional().nullable(),
    tax_number: z.string().max(50).optional().nullable(),
    commercial_registration: z.string().max(80).optional().nullable(),
    medical_license: z.string().max(120).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    alternative_phone: z.string().max(30).optional().nullable(),
    hotline: z.string().max(30).optional().nullable(),
    whatsapp: z.string().max(30).optional().nullable(),
    email: optionalEmail,
    support_email: optionalEmail,
    website: z.string().max(300).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    address_ar: z.string().max(500).optional().nullable(),
    country: z.string().max(100).optional().nullable(),
    governorate: z.string().max(100).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    postal_code: z.string().max(30).optional().nullable(),
    invoice_prefix: z.string().max(20).optional().nullable(),
    report_header: z.string().max(500).optional().nullable(),
    report_footer: z.string().max(500).optional().nullable(),
    footer_text: z.string().max(700).optional().nullable(),
    footer_text_ar: z.string().max(700).optional().nullable(),
    report_disclaimer: z.string().max(1000).optional().nullable(),
    report_disclaimer_ar: z.string().max(1000).optional().nullable(),
    invoice_footer: z.string().max(1000).optional().nullable(),
    invoice_footer_ar: z.string().max(1000).optional().nullable(),
    receipt_footer: z.string().max(1000).optional().nullable(),
    receipt_footer_ar: z.string().max(1000).optional().nullable(),
    portal_welcome_message: z.string().max(700).optional().nullable(),
    portal_welcome_message_ar: z.string().max(700).optional().nullable(),
    default_language: z.string().max(20).optional().nullable(),
    timezone: timezoneSchema.optional().nullable(),
    currency: z.string().max(10).optional().nullable(),
    vat_enabled: z.boolean().optional().nullable(),
    vat_rate: z.coerce.number().min(0).max(100).optional().nullable(),
    showPoweredByViara: z.boolean().optional().nullable(),
    workstation_presets: z.array(z.object({
        id: z.string().min(1).max(100),
        label: z.string().min(1).max(200),
        icon: z.string().max(20).optional().nullable(),
        descAr: z.string().max(500).optional().nullable(),
        descEn: z.string().max(500).optional().nullable(),
        roomIds: z.array(z.union([z.string(), z.number()])).max(200).default([]),
        scope: z.enum(['all', 'rooms', 'emergency']).default('all'),
        tab: z.string().max(40).optional().nullable(),
    }).strict()).max(100).optional().nullable(),
    working_hours: workingHoursSchema.optional().nullable(),
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
}).superRefine((value, context) => validateCustomBaseUrl(value.baseUrl, context, value.provider));

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
}).superRefine((value, context) => validateCustomBaseUrl(value.baseUrl, context, value.provider));

const updateAiSettingsSchema = z.object({
    report: aiProviderSchema.optional(),
    pacs: pacsAiProviderSchema.optional()
});

const testAiSettingsSchema = z.object({
    target: z.enum(['report', 'pacs']).default('report')
});

const aiProfileShape = {
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
};
const aiProfileSchema = z.object(aiProfileShape)
    .superRefine((value, context) => validateCustomBaseUrl(value.baseUrl, context, value.provider));

const { target: _target, ...updateAiProfileShape } = aiProfileShape;
const updateAiProfileSchema = z.object(updateAiProfileShape).partial()
    .superRefine((value, context) => validateCustomBaseUrl(value.baseUrl, context, value.provider));

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
