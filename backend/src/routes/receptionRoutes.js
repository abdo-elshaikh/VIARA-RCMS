const express = require('express');
const {
    getCurrentReceptionShift,
    openReceptionShift,
    closeReceptionShift,
    getReceptionShiftHistory,
} = require('../controllers/receptionShiftController');
const {
    claimTask,
    releaseTask,
    transferTask,
    getActiveTasks,
    heartbeatTasks
} = require('../controllers/receptionTaskController');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    const receptionRoleCheck = authorizeRole(['Admin', 'Receptionist']);
    const historyRoleCheck = authorizeRole(['Admin', 'Receptionist', 'HR']);

    // Reception Shifts
    router.get('/shifts/current', authenticateToken, receptionRoleCheck, getCurrentReceptionShift(pool));
    router.get('/shifts', authenticateToken, historyRoleCheck, getReceptionShiftHistory(pool));
    router.post('/shifts/open', authenticateToken, receptionRoleCheck, openReceptionShift(pool));
    router.post('/shifts/:sessionId/close', authenticateToken, receptionRoleCheck, closeReceptionShift(pool));

    // Reception Tasks
    router.get('/tasks', authenticateToken, receptionRoleCheck, getActiveTasks(pool));
    router.get('/tasks/active', authenticateToken, receptionRoleCheck, getActiveTasks(pool));
    router.post('/tasks/:appointmentId/claim', authenticateToken, receptionRoleCheck, claimTask(pool));
    router.post('/tasks/:appointmentId/release', authenticateToken, receptionRoleCheck, releaseTask(pool));
    router.post('/tasks/:appointmentId/transfer', authenticateToken, receptionRoleCheck, transferTask(pool));
    router.post('/tasks/heartbeat', authenticateToken, receptionRoleCheck, heartbeatTasks(pool));

    return router;
};
