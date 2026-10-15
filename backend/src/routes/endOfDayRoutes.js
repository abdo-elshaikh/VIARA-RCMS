/**
 * endOfDayRoutes.js
 *
 * Routes for the End-of-Shift review feature.
 * Mounted at /api/end-of-day in server.js.
 */

const express = require('express');
const { hasPermission } = require('../middleware/rbacMiddleware');
const {
    getPending,
    getSummary,
    resolveOne,
    bulkResolve,
    getReviewLog,
} = require('../controllers/endOfDayController');

module.exports = (pool, authenticateToken) => {
    const router = express.Router();

    /**
     * GET /api/end-of-day/pending
     * Query params: date (YYYY-MM-DD), sessionId, limit, offset
     */
    router.get('/pending',
        authenticateToken,
        hasPermission(pool, 'VIEW_APPOINTMENTS'),
        getPending(pool)
    );

/**
 * GET /api/end-of-day/summary
 * Query params: date (YYYY-MM-DD)
 */
router.get('/summary',
    authenticateToken,
    hasPermission(pool, 'VIEW_APPOINTMENTS'),
    getSummary(pool)
);

/**
 * GET /api/end-of-day/review-log
 * Query params: date (YYYY-MM-DD), limit, offset
 * Admin sees all actions, Receptionist sees only their own
 */
router.get('/review-log',
    authenticateToken,
    hasPermission(pool, 'VIEW_APPOINTMENTS'),
    getReviewLog(pool)
);

    /**
     * POST /api/end-of-day/resolve/:appointmentId
     * Body: { action, newDate?, newTime?, notes? }
     */
    router.post('/resolve/:appointmentId',
        authenticateToken,
        hasPermission(pool, 'MANAGE_QUEUE'),
        resolveOne(pool)
    );

    /**
     * POST /api/end-of-day/bulk-resolve
     * Body: { items: [{ appointmentId, action, newDate?, notes? }] }
     */
    router.post('/bulk-resolve',
        authenticateToken,
        hasPermission(pool, 'MANAGE_QUEUE'),
        bulkResolve(pool)
    );

    return router;
};
