const express = require('express');
const {
    getVolume,
    getRevenue,
    getPerformance,
    getPeakHours,
    getEquipmentUtilization,
    getTopProcedures,
    getReferrals,
    exportAnalytics
} = require('../controllers/analyticsController');
const { validateQuery } = require('../middleware/validateRequest');
const { analyticsQuerySchema, analyticsExportQuerySchema } = require('../schemas/analyticsSchema');
const checkFeature = require('../middleware/checkFeature');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    // Only Admin, Accountant, and Marketing can access analytics
    router.use(authenticateToken);

    // Referral analytics can be accessed by Marketing as well
    router.get('/referrals', authorizeRole(['Admin', 'Accountant', 'Marketing']), validateQuery(analyticsQuerySchema), getReferrals(pool));
    router.get('/export',
        checkFeature('export'),
        authorizeRole(['Admin', 'Accountant', 'Marketing']),
        validateQuery(analyticsExportQuerySchema),
        (req, res, next) => {
            if (req.user.role === 'Marketing' && req.query.type !== 'referrals') {
                return res.status(403).json({ error: 'Marketing can export referral analytics only' });
            }
            return exportAnalytics(pool)(req, res, next);
        }
    );

    router.use(authorizeRole(['Admin', 'Accountant', 'Marketing']));
    router.get('/volume', validateQuery(analyticsQuerySchema), getVolume(pool));
    router.get('/revenue', validateQuery(analyticsQuerySchema), getRevenue(pool));
    router.get('/performance', validateQuery(analyticsQuerySchema), getPerformance(pool));
    router.get('/peak-hours', validateQuery(analyticsQuerySchema), getPeakHours(pool));
    router.get('/equipment-utilization', validateQuery(analyticsQuerySchema), getEquipmentUtilization(pool));
    router.get('/top-procedures', validateQuery(analyticsQuerySchema), getTopProcedures(pool));

    return router;
};
