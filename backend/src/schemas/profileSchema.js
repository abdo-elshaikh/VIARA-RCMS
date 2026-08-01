const { z } = require('zod');

const updateProfileSchema = z.object({
    fullName: z.string().min(1, 'Full name is required').max(100).trim().optional(),
    email: z.string().email('Invalid email format').max(150).trim().optional(),
    phone: z.string().max(30).trim().optional().nullable(),
    department: z.string().max(100).trim().optional().nullable(),
    jobTitle: z.string().max(100).trim().optional().nullable(),
    bio: z.string().max(1000, 'Bio must be less than 1000 characters').trim().optional().nullable(),
    avatarUrl: z.string().max(200000, 'Avatar image is too large').optional().nullable()
}).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one profile field must be provided'
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters')
}).refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword']
});

const profilePreferencesSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']),
    primaryColor: z.enum(['cyan', 'indigo', 'rose', 'emerald', 'amber', 'slate', 'custom']),
    customColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Custom color must be a hex color').optional(),
    density: z.enum(['compact', 'comfortable', 'spacious']),
    fontScale: z.enum(['small', 'normal', 'large', 'xlarge']).optional(),
    fontFamily: z.enum(['inter', 'system', 'roboto', 'mono', 'dyslexic']).optional(),
    borderRadius: z.enum(['sharp', 'small', 'medium', 'large', 'full']).optional(),
    highContrast: z.boolean().optional(),
    motion: z.enum(['system', 'reduced']).optional(),
    language: z.enum(['en', 'ar']),
    timezone: z.string().optional(),
    dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
    firstDayOfWeek: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
    startPage: z.string().regex(/^\/(?!\/)/, 'Start page must be an internal app path').optional(),
    sessionTimeout: z.union([z.literal(0), z.literal(5), z.literal(15), z.literal(30)]).optional(),
    calendarView: z.enum(['day', 'week', 'month']).optional(),
    compactSidebar: z.boolean().optional(),
    emailNotifications: z.object({
        dailySummary: z.boolean(),
        systemAlerts: z.boolean(),
        promotionalUpdates: z.boolean()
    }).passthrough().optional(),
    showNotificationBadge: z.boolean().optional(),
    notificationSound: z.boolean().optional(),
    soundVolume: z.number().min(0.1).max(1).optional(),
    desktopNotifications: z.boolean().optional(),
    desktopNotificationPreview: z.boolean().optional(),
    desktopSystemNotifications: z.boolean().optional(),
    desktopMessageNotifications: z.boolean().optional(),
    notificationQuietHours: z.boolean().optional(),
    notificationQuietStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    notificationQuietEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    criticalNotificationBypass: z.boolean().optional()
}).passthrough();

module.exports = { updateProfileSchema, changePasswordSchema, profilePreferencesSchema };
