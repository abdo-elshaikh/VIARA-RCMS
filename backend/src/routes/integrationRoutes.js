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

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    router.use(authenticateToken);
    router.use(authorizeRole(['Admin', 'Developer']));

    router.get('/', getIntegrations(pool));
    router.put('/:id', hasPermission(pool, 'MANAGE_INTEGRATIONS'), updateIntegration(pool));
    router.post('/:id/test', hasPermission(pool, 'MANAGE_INTEGRATIONS'), testIntegration(pool));

    router.get('/logs', getLogs(pool));
    router.post('/logs/:id/retry', hasPermission(pool, 'MANAGE_INTEGRATIONS'), retryEvent(pool));
    router.post('/logs/:id/retry-dead-letter', hasPermission(pool, 'MANAGE_INTEGRATIONS'), retryDeadLetter(pool));
    router.get('/logs/dead-letter', hasPermission(pool, 'MANAGE_INTEGRATIONS'), getDeadLetterEvents(pool));

    router.post('/seed', hasPermission(pool, 'MANAGE_INTEGRATIONS'), seedIntegrations(pool));
    router.post('/test-sms', hasPermission(pool, 'MANAGE_INTEGRATIONS'), triggerTestSms(pool));
    router.get('/export-accounting', exportAccounting(pool));

    return router;
};
