const { z } = require('zod');

const patientDisplayModeSchema = z.enum(['name_and_order', 'name', 'order_only']);
const callAnnouncementModeSchema = z.enum(['token_only', 'name_only', 'token_and_name']);
const announcementToneSchema = z.enum(['info', 'success', 'warning', 'urgent']);

const displayThemeSchema = z.enum(['dark', 'light']);
const displayLanguageSchema = z.enum(['ar', 'en']);
const announcementLanguageSchema = z.enum(['ar', 'en', 'ar_then_en', 'en_then_ar']);
const tokenPronunciationSchema = z.enum(['auto', 'natural', 'digits']);
const announcementStyleSchema = z.enum(['formal', 'calm', 'short']);
const announcementPresetSchema = z.enum(['standard', 'quiet', 'concise', 'clarity']);
const motionModeSchema = z.enum(['full', 'reduced']);

const displayConfigSchema = z.object({
    patientDisplayMode: patientDisplayModeSchema.optional(),
    callAnnouncementMode: callAnnouncementModeSchema.optional(),
    showTicker: z.boolean().optional(),
    boardTitle: z.string().trim().max(150).optional().nullable(),
    privacyMode: z.enum(['full', 'token_only', 'name_only']).optional(),
    soundEnabled: z.boolean().optional(),
    muteAll: z.boolean().optional(),
    quietMode: z.boolean().optional(),
    repeatChime: z.boolean().optional(),
    theme: displayThemeSchema.optional().nullable(),
    displayLanguage: displayLanguageSchema.optional().nullable(),
    motionMode: motionModeSchema.optional().nullable(),
    rotationSpeed: z.number().int().min(3000).max(30000).optional().nullable(),
    showSummaryStats: z.boolean().optional(),
    announcementRate: z.number().min(0.1).max(3).optional(),
    announcementRepeatCount: z.number().int().min(1).max(5).optional(),
    announcementRepeatDelay: z.number().int().min(500).max(10000).optional(),
    announcementVolume: z.number().min(0).max(1).optional(),
    announcementMode: callAnnouncementModeSchema.optional().nullable(),
    announcementPreset: announcementPresetSchema.optional().nullable(),
    announcementLanguage: announcementLanguageSchema.optional().nullable(),
    tokenPronunciation: tokenPronunciationSchema.optional().nullable(),
    announcementStyle: announcementStyleSchema.optional().nullable(),
    customTemplate: z.string().trim().max(500).optional().nullable(),
    pronunciationDictionary: z.string().trim().max(2000).optional().nullable(),
    arabicVoiceURI: z.string().trim().max(255).optional().nullable(),
    englishVoiceURI: z.string().trim().max(255).optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one display board setting'
});

const createAnnouncementSchema = z.object({
    title: z.string().trim().min(2).max(150),
    message: z.string().trim().min(2).max(1000),
    tone: announcementToneSchema.default('info'),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().min(0).max(999).default(0)
});

const updateAnnouncementSchema = z.object({
    title: z.string().trim().min(2).max(150).optional(),
    message: z.string().trim().min(2).max(1000).optional(),
    tone: announcementToneSchema.optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(999).optional()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one announcement field to update'
});

const announcementIdSchema = z.string().uuid('Invalid announcement ID format');

module.exports = {
    patientDisplayModeSchema,
    callAnnouncementModeSchema,
    announcementToneSchema,
    displayThemeSchema,
    displayLanguageSchema,
    announcementLanguageSchema,
    tokenPronunciationSchema,
    announcementStyleSchema,
    announcementPresetSchema,
    motionModeSchema,
    displayConfigSchema,
    createAnnouncementSchema,
    updateAnnouncementSchema,
    announcementIdSchema
};
