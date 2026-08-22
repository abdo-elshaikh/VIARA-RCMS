const express = require('express');
const {
    getSafetyTemplates,
    submitSafetyResponse,
    getExamSafetyResponses
} = require('../controllers/safetyController');
const { hasPermission } = require('../middleware/rbacMiddleware');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    
    // Nurses and Technicians need to fetch and submit safety forms
    router.use(authenticateToken);
    
    // Get templates for a modality
    router.get('/templates/:modalityId', authorizeRole(['Admin', 'Nurse', 'Technician', 'Radiologist']), getSafetyTemplates(pool));
    
    // Submit answers for an exam
    router.post('/exams/:examId/responses', authorizeRole(['Admin', 'Nurse', 'Technician']), hasPermission(pool, 'MANAGE_SAFETY'), submitSafetyResponse(pool));
    
    // Get past responses for an exam (audit / reporting)
    router.get('/exams/:examId/responses', authorizeRole(['Admin', 'Nurse', 'Technician', 'Radiologist']), getExamSafetyResponses(pool));

    return router;
};
