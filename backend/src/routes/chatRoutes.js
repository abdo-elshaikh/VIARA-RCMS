const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { hasPermission } = require('../middleware/rbacMiddleware');
const auditRead = require('../middleware/auditRead');
const {
    chatAttachmentUpload,
    validateChatAttachments,
    serveChatAttachment
} = require('../utils/chatAttachmentUpload');
const {
    getChatUsers,
    getChatMessages,
    sendChatMessage,
    getUnreadSummary,
    getChannels,
    createChannel,
    updateChannel,
    deleteChannel,
    getChannelMembers,
    addChannelMembers,
    removeChannelMember,
    updateChannelMemberRole,
    getPatientConversations,
    getPatientMessageHistory,
    replyToPatient,
    getDoctorConversations,
    getDoctorMessageHistory,
    replyToDoctor
} = require('../controllers/chatController');
const {
    getMyMessages,
    sendPortalMessage
} = require('../controllers/portalChatController');

module.exports = function chatRoutes(pool, auditService) {
    const router = express.Router();

    // ─── Staff Chat & Internal Channels ─────────────────────────────────────
    router.get('/chat/users', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), getChatUsers(pool));
    router.get('/chat/messages', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), getChatMessages(pool));
    router.post('/chat/messages', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), chatAttachmentUpload.array('attachments'), validateChatAttachments, sendChatMessage(pool));
    router.get('/chat/unread-summary', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), getUnreadSummary(pool));
    router.get('/chat/attachments/:fileName', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), serveChatAttachment(pool));
    router.get('/chat/channels', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), getChannels(pool));
    router.post('/chat/channels', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), createChannel(pool));
    router.put('/chat/channels/:channelId', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), updateChannel(pool));
    router.delete('/chat/channels/:channelId', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), deleteChannel(pool));
    router.get('/chat/channels/:channelId/members', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), getChannelMembers(pool));
    router.post('/chat/channels/:channelId/members', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), addChannelMembers(pool));
    router.delete('/chat/channels/:channelId/members/:userId', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), removeChannelMember(pool));
    router.put('/chat/channels/:channelId/members/:userId', authenticateToken, hasPermission(pool, 'MANAGE_CHAT'), updateChannelMemberRole(pool));

    // ─── Patient Portal Messages (Staff Inbox) ──────────────────────────────
    router.get('/messages/patients',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Developer']),
        hasPermission(pool, 'VIEW_PORTAL_MESSAGES'),
        auditRead(auditService, { resourceTable: 'patient_portal_messages' }),
        getPatientConversations(pool)
    );
    router.get('/messages/patients/:patientId',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Developer']),
        hasPermission(pool, 'VIEW_PORTAL_MESSAGES'),
        auditRead(auditService, { resourceTable: 'patient_portal_messages', resourceIdParam: 'patientId' }),
        getPatientMessageHistory(pool)
    );
    router.post('/messages/patients/:patientId',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Developer']),
        hasPermission(pool, 'VIEW_PORTAL_MESSAGES'),
        hasPermission(pool, 'MANAGE_CHAT'),
        chatAttachmentUpload.array('attachments'),
        validateChatAttachments,
        replyToPatient(pool)
    );

    // ─── Referring Doctor Messages (Staff Inbox) ────────────────────────────
    router.get('/messages/doctors',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Developer']),
        hasPermission(pool, 'VIEW_PORTAL_MESSAGES'),
        auditRead(auditService, { resourceTable: 'doctor_portal_messages' }),
        getDoctorConversations(pool)
    );
    router.get('/messages/doctors/:doctorId',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Developer']),
        hasPermission(pool, 'VIEW_PORTAL_MESSAGES'),
        auditRead(auditService, { resourceTable: 'doctor_portal_messages', resourceIdParam: 'doctorId' }),
        getDoctorMessageHistory(pool)
    );
    router.post('/messages/doctors/:doctorId',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Developer']),
        hasPermission(pool, 'VIEW_PORTAL_MESSAGES'),
        hasPermission(pool, 'MANAGE_CHAT'),
        chatAttachmentUpload.array('attachments'),
        validateChatAttachments,
        replyToDoctor(pool)
    );

    // ─── Patient Portal Messages (Patient Side) ─────────────────────────────
    router.get('/portal/messages',
        authenticateToken,
        authorizeRole(['Patient']),
        getMyMessages(pool)
    );
    router.post('/portal/messages',
        authenticateToken,
        authorizeRole(['Patient']),
        chatAttachmentUpload.array('attachments'),
        validateChatAttachments,
        sendPortalMessage(pool)
    );

    return router;
};
