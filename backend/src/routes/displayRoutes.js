const express = require('express');
const { displayBoardLimiter } = require('../middleware/rateLimiters');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const { getDisplayBoard, broadcastPatientCall } = require('../controllers/displayBoardController');
const { getQueueDisplay } = require('../controllers/queueDisplayController');
const { serviceContext } = require('../utils/databaseContext');
const { getRequestQuery } = require('../utils/requestQuery');
const {
    getDisplayConfig,
    updateDisplayConfig,
    createDisplayAnnouncement,
    updateDisplayAnnouncement,
    deleteDisplayAnnouncement
} = require('../controllers/displayBoardAdminController');
const {
    displayConfigSchema,
    createAnnouncementSchema,
    updateAnnouncementSchema
} = require('../schemas/displayBoardSchema');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    const publicDisplayContext = async (req, res, next) => {
        const branchId = getRequestQuery(req).branchId || req.headers?.['x-branch-id'] || '00000000-0000-4000-8000-000000000001';
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(branchId)) {
            return res.status(400).json({ error: 'Invalid display branch', code: 'INVALID_BRANCH_ID' });
        }
        try {
            const context = serviceContext();
            const { rows } = await pool.query("SELECT id FROM branches WHERE id = $1 AND organization_id = $2 AND status = 'active'", [branchId, context.organizationId]);
            if (!rows.length) return res.status(404).json({ error: 'Display branch unavailable', code: 'DISPLAY_BRANCH_UNAVAILABLE' });
            req.databaseContext = { ...context, branchId };
            return next();
        } catch (error) { return next(error); }
    };

    // Public Waiting-Room Display Board endpoints
    // (Waiting room TVs poll frequently without login tokens)
    router.get('/board', displayBoardLimiter, publicDisplayContext, getDisplayBoard(pool));
    router.get('/queue', displayBoardLimiter, publicDisplayContext, getQueueDisplay(pool));

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
        validateRequest(displayConfigSchema),
        updateDisplayConfig(pool)
    );

    router.post('/announcements',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        validateRequest(createAnnouncementSchema),
        createDisplayAnnouncement(pool)
    );

    router.put('/announcements/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Receptionist']),
        hasPermission(pool, 'MANAGE_DISPLAY_BOARD'),
        validateRequest(updateAnnouncementSchema),
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
