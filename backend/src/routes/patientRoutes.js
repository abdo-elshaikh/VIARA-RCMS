const express = require('express');
const { patientDataLimiter, sensitiveOpLimiter } = require('../middleware/rateLimiters');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const { quotaMiddleware } = require('../services/quotaService');
const {
    createPatientSchema,
    updatePatientSchema,
    getPatientsQuerySchema,
    getDuplicatePatientsQuerySchema,
    mergePatientsSchema
} = require('../schemas/patientSchema');
const {
    createPatient,
    getPatients,
    getPatientById,
    updatePatient,
    deletePatient,
    getDuplicatePatients,
    mergePatients,
    generatePortalPassword,
    getPatientHistory
} = require('../controllers/patientController');
const { getVisitsStatement } = require('../controllers/invoiceController');

module.exports = function patientRoutes(pool, auditService) {
    const router = express.Router();

    // List patients (paginated, searched, sorted)
    router.get('/',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'patients' }),
        patientDataLimiter,
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Marketing']),
        validateQuery(getPatientsQuerySchema),
        getPatients(pool)
    );

    // Register new patient
    router.post('/',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'CREATE_PATIENTS'),
        quotaMiddleware(pool, 'patients'),
        validateRequest(createPatientSchema),
        createPatient(pool)
    );

    // Duplicate detection
    router.get('/duplicates',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'patients' }),
        authorizeRole(['Receptionist', 'Admin']),
        validateQuery(getDuplicatePatientsQuerySchema),
        getDuplicatePatients(pool)
    );

    // Generate portal password for patient
    router.post('/:id/generate-password',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'EDIT_PATIENTS'),
        generatePortalPassword(pool)
    );

    // Merge duplicate patients
    router.post('/:id/merge',
        authenticateToken,
        authorizeRole(['Admin']),
        hasPermission(pool, 'MERGE_PATIENTS'),
        validateRequest(mergePatientsSchema),
        mergePatients(pool)
    );

    // Update patient
    router.put('/:id',
        authenticateToken,
        authorizeRole(['Receptionist', 'Admin']),
        hasPermission(pool, 'EDIT_PATIENTS'),
        validateRequest(updatePatientSchema),
        updatePatient(pool, auditService)
    );

    // Delete patient (Admin only, sensitive rate limited)
    router.delete('/:id',
        sensitiveOpLimiter,
        authenticateToken,
        authorizeRole(['Admin']),
        hasPermission(pool, 'DELETE_PATIENTS'),
        deletePatient(pool)
    );

    // Get single patient by ID
    router.get('/:id',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'patients' }),
        patientDataLimiter,
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Technician', 'Nurse', 'Marketing']),
        getPatientById(pool)
    );

    // Patient clinical examination history
    router.get('/:id/history',
        authenticateToken,
        patientDataLimiter,
        authorizeRole(['Receptionist', 'Admin', 'Radiologist', 'Nurse']),
        getPatientHistory(pool)
    );

    // Patient visits consolidated billing statement
    router.get('/:id/visits-statement',
        authenticateToken,
        patientDataLimiter,
        authorizeRole(['Receptionist', 'Admin', 'Accountant', 'Cashier', 'Radiologist', 'Nurse']),
        (req, res, next) => {
            req.query.patientId = req.params.id;
            return getVisitsStatement(pool)(req, res, next);
        }
    );

    return router;
};
