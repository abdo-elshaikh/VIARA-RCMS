const express = require('express');
const {
    getSystemDiagnostics,
    getMigrationStatus,
    getRuntimeStatus
} = require('../controllers/systemDiagnosticsController');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    router.use(authenticateToken);
    router.use(authorizeRole(['Developer']));

    router.get('/diagnostics', getSystemDiagnostics(pool));
    router.get('/migrations', getMigrationStatus(pool));
    router.get('/runtime', getRuntimeStatus());

    return router;
};
