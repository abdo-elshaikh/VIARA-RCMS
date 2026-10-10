const express = require('express');
const {
    getIntegrations,
    updateIntegration,
    testIntegration,
    getLogs,
    retryEvent,
    retryDeadLetter,
    seedIntegrations,
    triggerTestSms,
    exportAccounting,
    getDeadLetterEvents
} = require('../controllers/integrationController');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { integrationOpLimiter } = require('../middleware/rateLimiters');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    router.use(authenticateToken);
    router.use(authorizeRole(['Admin', 'Developer']));

    router.get('/', hasPermission(pool, 'MANAGE_INTEGRATIONS'), getIntegrations(pool));
    router.put('/:id', hasPermission(pool, 'MANAGE_INTEGRATIONS'), integrationOpLimiter, updateIntegration(pool));
    router.post('/:id/test', hasPermission(pool, 'MANAGE_INTEGRATIONS'), integrationOpLimiter, testIntegration(pool));

    router.get('/logs', hasPermission(pool, 'MANAGE_INTEGRATIONS'), getLogs(pool));
    router.post('/logs/:id/retry', hasPermission(pool, 'MANAGE_INTEGRATIONS'), integrationOpLimiter, retryEvent(pool));
    router.post('/logs/:id/retry-dead-letter', hasPermission(pool, 'MANAGE_INTEGRATIONS'), integrationOpLimiter, retryDeadLetter(pool));
    router.get('/logs/dead-letter', hasPermission(pool, 'MANAGE_INTEGRATIONS'), getDeadLetterEvents(pool));

    router.post('/seed', hasPermission(pool, 'MANAGE_INTEGRATIONS'), integrationOpLimiter, seedIntegrations(pool));
    router.post('/test-sms', hasPermission(pool, 'MANAGE_INTEGRATIONS'), integrationOpLimiter, triggerTestSms(pool));
    router.get(
        '/export-accounting',
        hasPermission(pool, 'MANAGE_INTEGRATIONS'),
        hasPermission(pool, 'VIEW_FINANCIALS'),
        integrationOpLimiter,
        exportAccounting(pool)
    );

    return router;
};
