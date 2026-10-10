const express = require('express');
const { notificationLimiter } = require('../middleware/rateLimiters');
const { apiLimiter } = require('../middleware/rateLimiter');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');

const {
    getNotificationsQuerySchema,
    getNotificationJobsQuerySchema,
    notificationTemplateSchema,
    updateNotificationTemplateSchema,
    manualSendSchema,
    updatePreferencesSchema,
    updateStaffPreferencesSchema,
    notificationPreferencesQuerySchema,
    reminderSchema,
    unsubscribeSchema
} = require('../schemas/notificationSchema');

const {
    getNotifications,
    getUnreadCount,
    markAllRead,
    markNotificationRead,
    getMyNotifications,
    markMyNotificationRead,
    markAllMyNotificationsRead,
    getTemplates: getNotifTemplates,
    createTemplate: createNotifTemplate,
    updateTemplate: updateNotifTemplate,
    deleteTemplate: deleteNotifTemplate,
    getJobs,
    retryJob,
    triggerProcessJobs,
    getRepairableJobs,
    retryRepairableJobs,
    sendManual,
    sendReminder,
    unsubscribe,
    getPreferences: getNotificationPreferences,
    updatePreferences: updateNotificationPreferences,
    getStaffPreferences,
    updateStaffPreferences,
    getNotificationAnalytics,
    handleTwilioWebhook
} = require('../controllers/notificationController');

module.exports = function notificationRoutes(pool) {
    const router = express.Router();

    // ─── Notification Logs & Status ─────────────────────────────────────────
    router.get('/notifications',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
        validateQuery(getNotificationsQuerySchema),
        getNotifications(pool)
    );
    router.get('/notifications/unread-count',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
        getUnreadCount(pool)
    );
    router.put('/notifications/mark-all-read',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
        markAllRead(pool)
    );
    router.put('/notifications/:id/read',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']),
        markNotificationRead(pool)
    );

    // ─── Sending Notifications ──────────────────────────────────────────────
    router.post('/notifications/remind',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        notificationLimiter,
        validateRequest(reminderSchema),
        sendReminder(pool)
    );

    router.post('/notifications/send-reminder',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        notificationLimiter,
        validateRequest(reminderSchema),
        sendReminder(pool)
    );

    router.post('/notifications/send-manual',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist', 'Marketing']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        notificationLimiter,
        validateRequest(manualSendSchema),
        sendManual(pool)
    );

    // ─── Opt-out & Webhooks ─────────────────────────────────────────────────
    router.post('/notifications/unsubscribe', apiLimiter, validateRequest(unsubscribeSchema), unsubscribe(pool));
    router.post('/notifications/webhook/twilio', handleTwilioWebhook(pool));

    // ─── Notification Templates ─────────────────────────────────────────────
    router.get('/notification-templates',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        getNotifTemplates(pool)
    );
    router.post('/notification-templates',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        validateRequest(notificationTemplateSchema),
        createNotifTemplate(pool)
    );
    router.put('/notification-templates/:id',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        validateRequest(updateNotificationTemplateSchema),
        updateNotifTemplate(pool)
    );
    router.delete('/notification-templates/:id',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        deleteNotifTemplate(pool)
    );

    // ─── Job Queue ──────────────────────────────────────────────────────────
    router.get('/notification-jobs',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Marketing']),
        validateQuery(getNotificationJobsQuerySchema),
        getJobs(pool)
    );
    router.post('/notification-jobs/:id/retry',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        retryJob(pool)
    );
    router.post('/notification-jobs/process',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        notificationLimiter,
        triggerProcessJobs(pool)
    );
    router.get('/notification-jobs/repairable',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        getRepairableJobs(pool)
    );
    router.post('/notification-jobs/repairable/retry',
        authenticateToken,
        authorizeRole(['Developer', 'Admin']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        notificationLimiter,
        retryRepairableJobs(pool)
    );

    // ─── Notification Preferences ───────────────────────────────────────────
    router.get('/notification-preferences',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist']),
        validateQuery(notificationPreferencesQuerySchema),
        getNotificationPreferences(pool)
    );
    router.put('/notification-preferences',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_NOTIFICATIONS'),
        validateQuery(notificationPreferencesQuerySchema),
        validateRequest(updatePreferencesSchema),
        updateNotificationPreferences(pool)
    );

    // ─── Staff Notification Inbox ───────────────────────────────────────────
    router.get('/notifications/my-notifications',
        authenticateToken,
        getMyNotifications(pool)
    );
    router.put('/notifications/my-notifications/mark-all-read',
        authenticateToken,
        markAllMyNotificationsRead(pool)
    );
    router.put('/notifications/my-notifications/:id/read',
        authenticateToken,
        markMyNotificationRead(pool)
    );
    router.get('/notifications/my-preferences',
        authenticateToken,
        getStaffPreferences(pool)
    );
    router.put('/notifications/my-preferences',
        authenticateToken,
        validateRequest(updateStaffPreferencesSchema),
        updateStaffPreferences(pool)
    );
    router.get('/notifications/analytics',
        authenticateToken,
        authorizeRole(['Developer', 'Admin', 'Receptionist', 'Marketing']),
        validateQuery(getNotificationsQuerySchema),
        getNotificationAnalytics(pool)
    );

    return router;
};
