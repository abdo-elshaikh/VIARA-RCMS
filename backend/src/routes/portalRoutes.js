const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validateRequest');

const {
    appointmentRequestSchema,
    profileUpdateRequestSchema,
    reviewAppointmentRequestSchema,
    reviewProfileUpdateRequestSchema
} = require('../schemas/portalSchema');

const {
    setPortalPasswordSchema,
    doctorOrderSchema,
    doctorMessageSchema
} = require('../schemas/doctorPortalSchema');

const {
    getMyRecords,
    getMyInvoices,
    getMyInvoicePdf,
    getMyDocuments,
    downloadMyDocument,
    getMyAppointmentRequests,
    createAppointmentRequest,
    createProfileUpdateRequest,
    getPendingPortalReviewRequests,
    reviewPortalAppointmentRequest,
    reviewPortalProfileUpdateRequest,
    getMyProfile,
    getMyNotifications: getMyPortalNotifications,
    getMyNotificationUnreadCount: getMyPortalNotificationUnreadCount,
    markMyNotificationRead: markMyPortalNotificationRead,
    markAllMyNotificationsRead: markAllMyPortalNotificationsRead
} = require('../controllers/portalController');

const {
    setPortalPassword,
    getDoctorCases,
    getDoctorReport,
    getDoctorReportPdf,
    createDoctorOrder,
    getMessages: getDoctorMessages,
    sendMessage: sendDoctorMessage,
    getUnreadMessageCount,
    getMyNotifications: getDoctorNotifications,
    getMyNotificationUnreadCount: getDoctorNotificationUnreadCount,
    markMyNotificationRead: markDoctorNotificationRead,
    markAllMyNotificationsRead: markAllDoctorNotificationsRead
} = require('../controllers/doctorPortalController');

module.exports = function portalRoutes(pool, auditService) {
    const router = express.Router();

    // ─── Staff Portal Review Requests ───────────────────────────────────────
    router.get('/portal/review-requests',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasAnyPermission(pool, ['EDIT_APPOINTMENTS', 'EDIT_PATIENTS']),
        getPendingPortalReviewRequests(pool)
    );

    router.put('/portal/appointment-requests/:requestId/review',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'EDIT_APPOINTMENTS'),
        validateRequest(reviewAppointmentRequestSchema),
        reviewPortalAppointmentRequest(pool)
    );

    router.put('/portal/profile-update-requests/:requestId/review',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'EDIT_PATIENTS'),
        validateRequest(reviewProfileUpdateRequestSchema),
        reviewPortalProfileUpdateRequest(pool)
    );

    // ─── Patient Portal Data ────────────────────────────────────────────────
    router.get('/portal/records',
        authenticateToken,
        authorizeRole(['Patient']),
        auditRead(auditService, { resourceTable: 'patient_records' }),
        getMyRecords(pool)
    );

    router.get('/portal/profile',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyProfile(pool)
    );

    router.get('/portal/invoices',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyInvoices(pool)
    );

    router.get('/portal/invoices/:invoiceId/pdf',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyInvoicePdf(pool)
    );

    router.get('/portal/documents',
        authenticateToken,
        authorizeRole(['Patient']),
        auditRead(auditService, { resourceTable: 'portal_documents' }),
        getMyDocuments(pool)
    );

    router.get('/portal/documents/:documentId/download',
        authenticateToken,
        authorizeRole(['Patient']),
        auditRead(auditService, { resourceTable: 'portal_documents', resourceIdParam: 'documentId' }),
        downloadMyDocument(pool)
    );

    router.get('/portal/appointment-requests',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyAppointmentRequests(pool)
    );

    router.post('/portal/appointment-requests',
        authenticateToken,
        authorizeRole(['Patient']),
        validateRequest(appointmentRequestSchema),
        createAppointmentRequest(pool)
    );

    router.post('/portal/profile-update-requests',
        authenticateToken,
        authorizeRole(['Patient']),
        validateRequest(profileUpdateRequestSchema),
        createProfileUpdateRequest(pool)
    );

    // ─── Patient Portal Notifications ───────────────────────────────────────
    router.get('/portal/notifications',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyPortalNotifications(pool)
    );
    router.get('/portal/notifications/unread-count',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyPortalNotificationUnreadCount(pool)
    );
    router.put('/portal/notifications/mark-all-read',
        authenticateToken,
        authorizeRole(['Patient']),
        markAllMyPortalNotificationsRead(pool)
    );
    router.put('/portal/notifications/:id/read',
        authenticateToken,
        authorizeRole(['Patient']),
        markMyPortalNotificationRead(pool)
    );

    // ─── Doctor Portal Routes ───────────────────────────────────────────────
    router.post('/referring-doctors/:id/set-portal-password',
        authenticateToken,
        authorizeRole(['Admin']),
        hasPermission(pool, 'MANAGE_REFERRING_DOCTORS'),
        validateRequest(setPortalPasswordSchema),
        setPortalPassword(pool)
    );

    router.get('/doctor-portal/cases',
        authenticateToken,
        authorizeRole(['Doctor']),
        getDoctorCases(pool)
    );

    router.get('/doctor-portal/reports/:examId',
        authenticateToken,
        authorizeRole(['Doctor']),
        auditRead(auditService, { resourceTable: 'examinations', resourceIdParam: 'examId' }),
        getDoctorReport(pool)
    );

    router.get('/doctor-portal/reports/:examId/pdf',
        authenticateToken,
        authorizeRole(['Doctor']),
        auditRead(auditService, { resourceTable: 'examinations', resourceIdParam: 'examId' }),
        getDoctorReportPdf(pool)
    );

    router.post('/doctor-portal/orders',
        authenticateToken,
        authorizeRole(['Doctor']),
        validateRequest(doctorOrderSchema),
        createDoctorOrder(pool)
    );

    router.get('/doctor-portal/messages',
        authenticateToken,
        authorizeRole(['Doctor']),
        getDoctorMessages(pool)
    );

    router.post('/doctor-portal/messages',
        authenticateToken,
        authorizeRole(['Doctor']),
        validateRequest(doctorMessageSchema),
        sendDoctorMessage(pool)
    );

    router.get('/doctor-portal/messages/unread-count',
        authenticateToken,
        authorizeRole(['Doctor']),
        getUnreadMessageCount(pool)
    );

    // ─── Doctor Portal Notifications ────────────────────────────────────────
    router.get('/doctor-portal/notifications',
        authenticateToken,
        authorizeRole(['Doctor']),
        getDoctorNotifications(pool)
    );
    router.get('/doctor-portal/notifications/unread-count',
        authenticateToken,
        authorizeRole(['Doctor']),
        getDoctorNotificationUnreadCount(pool)
    );
    router.put('/doctor-portal/notifications/mark-all-read',
        authenticateToken,
        authorizeRole(['Doctor']),
        markAllDoctorNotificationsRead(pool)
    );
    router.put('/doctor-portal/notifications/:id/read',
        authenticateToken,
        authorizeRole(['Doctor']),
        markDoctorNotificationRead(pool)
    );

    return router;
};
