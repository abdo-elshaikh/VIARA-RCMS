const express = require('express');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { listAssignments, listSupervisedTasks, createAssignment, updateAssignment, revokeAssignment } = require('../controllers/receptionSupervisorController');
const {
    getCurrentReceptionShift,
    openReceptionShift,
    closeReceptionShift,
    getReceptionShiftHistory,
    getReceptionShiftDetails,
    createShiftHandover,
    getShiftHandover,
    acknowledgeShiftHandover,
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
    const historyRoleCheck = authorizeRole(['Admin', 'Developer', 'Receptionist', 'HR']);

    router.get('/supervisors/assignments', authenticateToken,
        authorizeRole(['Admin', 'HR', 'Receptionist']), listAssignments(pool));
    router.get('/supervisors/tasks', authenticateToken,
        authorizeRole(['Receptionist']), listSupervisedTasks(pool));
    router.post('/supervisors/assignments', authenticateToken,
        authorizeRole(['Admin', 'HR']), hasPermission(pool, 'MANAGE_STAFF'), createAssignment(pool));
    router.put('/supervisors/assignments/:assignmentId', authenticateToken,
        authorizeRole(['Admin', 'HR']), hasPermission(pool, 'MANAGE_STAFF'), updateAssignment(pool));
    router.delete('/supervisors/assignments/:assignmentId', authenticateToken,
        authorizeRole(['Admin', 'HR']), hasPermission(pool, 'MANAGE_STAFF'), revokeAssignment(pool));

    // Reception Shifts
    router.get('/shifts/current', authenticateToken, receptionRoleCheck, getCurrentReceptionShift(pool));
    router.get('/shifts', authenticateToken, historyRoleCheck, getReceptionShiftHistory(pool));
    router.get('/shifts/:sessionId', authenticateToken, historyRoleCheck, getReceptionShiftDetails(pool));
    router.post('/shifts/open', authenticateToken, receptionRoleCheck, openReceptionShift(pool));
    router.post('/shifts/:sessionId/close', authenticateToken, receptionRoleCheck, closeReceptionShift(pool));

    // Shift Handover
    router.post('/shifts/:sessionId/handover', authenticateToken, receptionRoleCheck, createShiftHandover(pool));
    router.get('/shifts/:sessionId/handover', authenticateToken, receptionRoleCheck, getShiftHandover(pool));
    router.post('/handovers/:handoverId/acknowledge', authenticateToken, authorizeRole(['Admin', 'Receptionist']), acknowledgeShiftHandover(pool));

    // Reception Tasks
    router.get('/tasks', authenticateToken, receptionRoleCheck, getActiveTasks(pool));
    router.get('/tasks/active', authenticateToken, receptionRoleCheck, getActiveTasks(pool));
    router.post('/tasks/:appointmentId/claim', authenticateToken, receptionRoleCheck, claimTask(pool));
    router.post('/tasks/:appointmentId/release', authenticateToken, receptionRoleCheck, releaseTask(pool));
    router.post('/tasks/:appointmentId/transfer', authenticateToken, receptionRoleCheck, transferTask(pool));
    router.post('/tasks/heartbeat', authenticateToken, receptionRoleCheck, heartbeatTasks(pool));

    return router;
};
