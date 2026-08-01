const express = require('express');
const {
    getIntegrations,
    updateIntegration,
    testIntegration,
    getLogs,
    retryEvent,
    seedIntegrations,
    triggerTestSms,
    exportAccounting
} = require('../controllers/integrationController');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    
    // Only Admin can manage integrations
    router.use(authenticateToken);
    router.use(authorizeRole(['Admin']));

    router.get('/', getIntegrations(pool));
    router.put('/:id', updateIntegration(pool));
    router.post('/:id/test', testIntegration(pool));
    
    router.get('/logs', getLogs(pool));
    router.post('/logs/:id/retry', retryEvent(pool));

    router.post('/seed', seedIntegrations(pool));
    router.post('/test-sms', triggerTestSms(pool));
    router.get('/export-accounting', exportAccounting(pool));

    return router;
};
