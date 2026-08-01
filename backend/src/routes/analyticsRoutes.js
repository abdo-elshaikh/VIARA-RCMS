const express = require('express');
const {
    getVolume,
    getRevenue,
    getPerformance,
    getReferrals,
    exportAnalytics
} = require('../controllers/analyticsController');
const { validateQuery } = require('../middleware/validateRequest');
const { analyticsQuerySchema, analyticsExportQuerySchema } = require('../schemas/analyticsSchema');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    // Only Admin and Accountant can access full analytics by default
    router.use(authenticateToken);
    
    // Referral analytics can be accessed by Marketing as well
    router.get('/referrals', authorizeRole(['Admin', 'Accountant', 'Marketing']), validateQuery(analyticsQuerySchema), getReferrals(pool));
    router.get('/export',
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

    return router;
};
