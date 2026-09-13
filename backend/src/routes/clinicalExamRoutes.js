const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');

const {
    updateExamReportSchema,
    getWorklistQuerySchema,
    improveReportSchema,
    generatePreliminaryReportSchema,
    markAiReportDraftAppliedSchema
} = require('../schemas/examSchema');
const { getQueueQuerySchema, transitionQueueSchema } = require('../schemas/queueSchema');

const {
    reportTemplateSchema,
    updateReportTemplateSchema,
    getReportTemplatesQuerySchema,
    amendReportSchema
} = require('../schemas/reportTemplateSchema');

const { deliverResultSchema } = require('../schemas/resultDeliverySchema');

const {
    getWorklist,
    getCaseReports,
    lookupCaseReport,
    getExamById,
    updateReport,
    getReportPdf,
    amendReport,
    improveReportFormat,
    listAiReportDrafts,
    generatePreliminaryReportDraft,
    markAiReportDraftApplied
} = require('../controllers/examController');

const {
    getTemplates: getReportTemplates,
    createTemplate: createReportTemplate,
    updateTemplate: updateReportTemplate,
    deleteTemplate: deleteReportTemplate
} = require('../controllers/templateController');

const {
    deliverResult,
    getDeliveryHistory
} = require('../controllers/resultDeliveryController');

const {
    getQueue,
    transitionQueue
} = require('../controllers/queueController');

module.exports = function clinicalExamRoutes(pool, auditService) {
    const router = express.Router();

    // ─── Worklist & Case Reports ────────────────────────────────────────────
    router.get('/exams/worklist',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations' }),
        authorizeRole(['Admin', 'Radiologist', 'Technician', 'Nurse']),
        validateQuery(getWorklistQuerySchema),
        getWorklist(pool)
    );

    router.get('/case-reports',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations' }),
        authorizeRole(['Admin', 'Radiologist', 'Technician', 'Nurse', 'Receptionist', 'Accountant']),
        getCaseReports(pool)
    );

    router.get('/case-reports/lookup',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations' }),
        authorizeRole(['Admin', 'Radiologist', 'Technician', 'Nurse', 'Receptionist', 'Accountant']),
        lookupCaseReport(pool)
    );

    // ─── Report Templates ───────────────────────────────────────────────────
    router.get('/templates', authenticateToken, authorizeRole(['Radiologist', 'Admin']), validateQuery(getReportTemplatesQuerySchema), getReportTemplates(pool));
    router.post('/templates', authenticateToken, authorizeRole(['Radiologist', 'Admin']), hasPermission(pool, 'MANAGE_REPORT_TEMPLATES'), validateRequest(reportTemplateSchema), createReportTemplate(pool));
    router.put('/templates/:id', authenticateToken, authorizeRole(['Radiologist', 'Admin']), hasPermission(pool, 'MANAGE_REPORT_TEMPLATES'), validateRequest(updateReportTemplateSchema), updateReportTemplate(pool));
    router.delete('/templates/:id', authenticateToken, authorizeRole(['Radiologist', 'Admin']), hasPermission(pool, 'MANAGE_REPORT_TEMPLATES'), deleteReportTemplate(pool));

    // ─── Examination Details & Reports ──────────────────────────────────────
    router.get('/exams/:id',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations' }),
        authorizeRole(['Radiologist', 'Technician', 'Nurse', 'Admin', 'Receptionist', 'Accountant']),
        getExamById(pool)
    );

    router.put('/exams/:id/report',
        authenticateToken,
        authorizeRole(['Radiologist', 'Admin']),
        hasAnyPermission(pool, ['WRITE_REPORTS', 'EDIT_REPORTS']),
        validateRequest(updateExamReportSchema),
        updateReport(pool)
    );

    router.post('/exams/report/improve-format',
        authenticateToken,
        authorizeRole(['Radiologist', 'Admin']),
        hasAnyPermission(pool, ['WRITE_REPORTS', 'EDIT_REPORTS']),
        validateRequest(improveReportSchema),
        improveReportFormat(pool)
    );

    // ─── AI Drafts ──────────────────────────────────────────────────────────
    router.get('/exams/:id/ai-drafts',
        authenticateToken,
        authorizeRole(['Radiologist', 'Admin']),
        hasPermission(pool, 'VIEW_REPORTS'),
        listAiReportDrafts(pool)
    );

    router.post('/exams/:id/ai-preliminary-draft',
        authenticateToken,
        authorizeRole(['Radiologist', 'Admin']),
        hasAnyPermission(pool, ['WRITE_REPORTS', 'EDIT_REPORTS']),
        validateRequest(generatePreliminaryReportSchema),
        generatePreliminaryReportDraft(pool)
    );

    router.post('/exams/:id/ai-drafts/:draftId/apply',
        authenticateToken,
        authorizeRole(['Radiologist', 'Admin']),
        hasAnyPermission(pool, ['WRITE_REPORTS', 'EDIT_REPORTS']),
        validateRequest(markAiReportDraftAppliedSchema),
        markAiReportDraftApplied(pool)
    );

    // ─── PDF Report Generation & Amendments ─────────────────────────────────
    const allowReportPdfAccess = (req, res, next) => {
        const portalRoles = ['Patient', 'Doctor', 'Referring Doctor', 'Referring_Doctor'];
        if (portalRoles.includes(req.user?.role)) return next();
        return hasAnyPermission(pool, ['VIEW_REPORTS'])(req, res, next);
    };

    router.get('/exams/:id/report/pdf',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations' }),
        allowReportPdfAccess,
        getReportPdf(pool)
    );

    router.post('/exams/:id/report/amend',
        authenticateToken,
        authorizeRole(['Admin', 'Radiologist']),
        hasPermission(pool, 'AMEND_REPORTS'),
        validateRequest(amendReportSchema),
        amendReport(pool)
    );

    // ─── Result Delivery ────────────────────────────────────────────────────
    router.post('/results/:examId/deliver',
        authenticateToken,
        hasAnyPermission(pool, ['DELIVER_RESULTS']),
        validateRequest(deliverResultSchema),
        deliverResult(pool)
    );

    router.get('/results/:examId/delivery-history',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations', resourceIdParam: 'examId' }),
        hasAnyPermission(pool, ['VIEW_REPORTS']),
        getDeliveryHistory(pool)
    );

    // ─── Clinical Queue ─────────────────────────────────────────────────────
    router.get('/queue',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'examinations' }),
        authorizeRole(['Receptionist', 'Admin', 'Accountant', 'Radiologist', 'Technician', 'Nurse']),
        validateQuery(getQueueQuerySchema),
        getQueue(pool)
    );

    router.post('/queue/:examId/transition',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin', 'Accountant', 'Radiologist', 'Technician', 'Nurse']),
        hasPermission(pool, 'MANAGE_QUEUE'),
        validateRequest(transitionQueueSchema),
        transitionQueue(pool)
    );

    return router;
};
