const { z } = require('zod');

const patientDisplayModeSchema = z.enum(['name_and_order', 'name', 'order_only']);
const announcementToneSchema = z.enum(['info', 'success', 'warning', 'urgent']);

const displayConfigSchema = z.object({
    patientDisplayMode: patientDisplayModeSchema.optional(),
    showTicker: z.boolean().optional(),
    boardTitle: z.string().trim().max(150).optional().nullable()
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
    announcementToneSchema,
    displayConfigSchema,
    createAnnouncementSchema,
    updateAnnouncementSchema,
    announcementIdSchema
};
