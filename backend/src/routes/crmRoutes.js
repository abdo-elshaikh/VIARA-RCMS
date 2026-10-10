const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validateRequest');
const {
    createCrmActivitySchema,
    updateCrmActivitySchema,
    createRecallTaskSchema,
    createSegmentSchema,
    addSegmentMemberSchema,
    createCampaignSchema,
    updateCampaignStatusSchema,
    submitFeedbackSchema,
    updateLoyaltySchema
} = require('../schemas/crmSchema');
const {
    getCrmActivities,
    createCrmActivity,
    updateCrmActivity,
    getSegments,
    createSegment,
    addSegmentMember,
    getCampaigns,
    createCampaign,
    updateCampaignStatus,
    submitFeedback,
    getFeedback,
    updateLoyaltyPoints,
    getLoyaltyHistory,
    getDueRecalls,
    createRecallTask
} = require('../controllers/crmController');

module.exports = function crmRoutes(pool) {
    const router = express.Router();

    // CRM Activities
    router.get('/activities', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'HR', 'Marketing']), getCrmActivities(pool));
    router.post('/activities', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'HR', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(createCrmActivitySchema), createCrmActivity(pool));
    router.put('/activities/:id', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'HR', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(updateCrmActivitySchema), updateCrmActivity(pool));

    // Patient Segments
    router.get('/segments', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getSegments(pool));
    router.post('/segments', authenticateToken, authorizeRole(['Admin', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(createSegmentSchema), createSegment(pool));
    router.post('/segments/:segmentId/members', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(addSegmentMemberSchema), addSegmentMember(pool));

    // Marketing Campaigns
    router.get('/campaigns', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getCampaigns(pool));
    router.post('/campaigns', authenticateToken, authorizeRole(['Admin', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(createCampaignSchema), createCampaign(pool));
    router.put('/campaigns/:id/status', authenticateToken, authorizeRole(['Admin', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(updateCampaignStatusSchema), updateCampaignStatus(pool));

    // Patient Feedback & Surveys
    router.post('/feedback', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing', 'Patient']), (req, res, next) => (
        req.user?.role === 'Patient'
            ? next()
            : hasPermission(pool, 'MANAGE_CRM')(req, res, next)
    ), validateRequest(submitFeedbackSchema), submitFeedback(pool));
    router.get('/feedback', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getFeedback(pool));

    // Patient Loyalty Points & History
    router.put('/loyalty/:patientId', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(updateLoyaltySchema), updateLoyaltyPoints(pool));
    router.get('/loyalty/:patientId/history', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing', 'Patient']), getLoyaltyHistory(pool));

    // Clinical Recalls & Preventive Care
    router.get('/recalls/due', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), getDueRecalls(pool));
    router.post('/recalls/create-task', authenticateToken, authorizeRole(['Admin', 'Receptionist', 'Marketing']), hasPermission(pool, 'MANAGE_CRM'), validateRequest(createRecallTaskSchema), createRecallTask(pool));

    return router;
};
