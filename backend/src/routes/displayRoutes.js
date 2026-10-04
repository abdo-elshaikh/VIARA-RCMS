const express = require('express');
const { displayBoardLimiter } = require('../middleware/rateLimiters');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { getDisplayBoard, broadcastPatientCall } = require('../controllers/displayBoardController');
const { getQueueDisplay } = require('../controllers/queueDisplayController');
const {
    getDisplayConfig,
    updateDisplayConfig,
    createDisplayAnnouncement,
    updateDisplayAnnouncement,
    deleteDisplayAnnouncement
} = require('../controllers/displayBoardAdminController');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Public Waiting-Room Display Board endpoints
    // (Waiting room TVs poll frequently without login tokens)
    router.get('/board', displayBoardLimiter, getDisplayBoard(pool));
    router.get('/queue', displayBoardLimiter, getQueueDisplay(pool));

    // Live Patient Call broadcast (Staff calling a patient to the exam room)
    router.post('/broadcast-call',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist', 'Cashier', 'Radiologist', 'Technician', 'Nurse']),
        broadcastPatientCall(pool)
    );

    // Display Board Control Unit & Announcements (Staff / Admin)
    router.get('/config',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        getDisplayConfig(pool)
    );

    router.put('/config',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        updateDisplayConfig(pool)
    );

    router.post('/announcements',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        createDisplayAnnouncement(pool)
    );

    router.put('/announcements/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        updateDisplayAnnouncement(pool)
    );

    router.delete('/announcements/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        deleteDisplayAnnouncement(pool)
    );

    return router;
};
