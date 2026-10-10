const express = require('express');
const {
    upload,
    uploadDocument,
    getPatientDocuments,
    downloadDocument,
    updateDocument,
    deleteDocument
} = require('../controllers/documentController');
const { validateRequest } = require('../middleware/validateRequest');
const { updateDocumentSchema } = require('../schemas/documentSchema');
const { hasAnyPermission, hasPermission } = require('../middleware/rbacMiddleware');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // Protect all routes
    router.use(authenticateToken);

    // Upload Document — Admin, Technician, Radiologist can upload
    router.post('/', authorizeRole(['Admin', 'Technician', 'Radiologist']), hasAnyPermission(pool, ['WRITE_REPORTS', 'PERFORM_EXAMS']), upload.single('file'), uploadDocument(pool));

    // Get Patient Documents — any authenticated staff can view
    const documentReaders = ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'];
    router.get('/patient/:id', authorizeRole(documentReaders), getPatientDocuments(pool));

    // Download/Preview Document — any authenticated staff can download
    router.get('/:id/download', authorizeRole(documentReaders), downloadDocument(pool));

    // Update Metadata — Admin, Technician, Radiologist
    router.put('/:id', authorizeRole(['Admin', 'Technician', 'Radiologist']), hasAnyPermission(pool, ['WRITE_REPORTS', 'PERFORM_EXAMS']), validateRequest(updateDocumentSchema), updateDocument(pool));

    // Delete Document — Admin only
    router.delete('/:id', authorizeRole(['Admin']), hasPermission(pool, 'DELETE_PATIENTS'), deleteDocument(pool));

    return router;
};
