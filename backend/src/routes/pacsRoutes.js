const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { AppError } = require('../middleware/errorHandler');
const { hasAnyPermission } = require('../middleware/rbacMiddleware');
const { authenticateDicomWeb } = require('../middleware/authMiddleware');
const {
    verifyPacsWebhook,
    handleWebhook,
    getExamImagingStatus,
    getExamAiAnalysisJobs,
    getPacsAiAnalysisQueue,
    requestExamAiAnalysis,
    getQuarantine,
    reconcileQuarantineStudy,
    discardQuarantineStudy,
    searchScheduledExams,
    uploadExamImages,
    getExamUploadProgress,
    dicomWebProxy,
    syncModalityToOrthanc,
    getOrthancSystemStatus,
    pingModality,
    getPacsConfig,
    getPacsDiagnostics,
    updatePacsConfig,
    getPacsAudit,
    getPacsRequests,
    getPacsWorklistPreview,
    refreshPacsWorklist,
    getPacsStorageSummary,
    runPacsTiering,
    runPacsAiAnalysisQueue,
    authorizeExamImagingAccess,
    exportPacsStudy,
    createViewerSession,
    retryPacsAiJob,
    cancelPacsAiJob,
    deletePacsAiJob,
    retryAllPacsAiJobs,
    cancelAllPacsAiJobs
} = require('../controllers/pacsController');

const PACS_QUARANTINE_DIR = path.resolve(
    process.env.PACS_UPLOAD_QUARANTINE_DIR || path.join(__dirname, '../../uploads/.quarantine/pacs')
);
const PACS_MAX_FILE_BYTES = Number(process.env.PACS_UPLOAD_MAX_FILE_BYTES || 25 * 1024 * 1024);
const PACS_MAX_FILES = Number(process.env.PACS_UPLOAD_MAX_FILES || 20);
const PACS_MAX_REQUEST_BYTES = Number(process.env.PACS_UPLOAD_MAX_REQUEST_BYTES || 250 * 1024 * 1024);

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdir(PACS_QUARANTINE_DIR, { recursive: true }, (error) => cb(error, PACS_QUARANTINE_DIR));
        },
        filename: (_req, file, cb) => {
            const extension = path.extname(file.originalname || '').toLowerCase().slice(0, 12);
            cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`);
        }
    }),
    limits: {
        fileSize: PACS_MAX_FILE_BYTES,
        files: PACS_MAX_FILES,
        fields: 10,
        fieldSize: 64 * 1024,
        parts: PACS_MAX_FILES + 10
    }
});

const cleanupPacsFiles = (files = []) => files.forEach((file) => {
    if (!file?.path) return;
    fs.unlink(file.path, () => {});
});

const uploadPacsFiles = (req, res, next) => {
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > PACS_MAX_REQUEST_BYTES) {
        return next(new AppError('PACS upload request is too large', 413));
    }
    return upload.array('files', PACS_MAX_FILES)(req, res, (error) => {
        if (error) cleanupPacsFiles(req.files);
        next(error);
    });
};

/**
 * PACS/imaging routes.
 *
 * The webhook is machine-to-machine (Orthanc -> RCMS) and authenticates with a
 * shared secret, so it is mounted BEFORE the JWT guard. Everything else is a
 * normal authenticated RCMS API guarded by PACS permissions.
 */
module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // --- Machine-to-machine (no JWT) ---
    router.post('/webhook', verifyPacsWebhook, handleWebhook(pool));

    // DICOMweb proxy — QIDO/WADO/STOW forwarded to Orthanc with server-side
    // basic auth. Write verbs are rejected in the controller; local imports use
    // /exams/:examId/images instead. Mounted BEFORE the global JWT guard because the OHIF iframe
    // authenticates with the httpOnly `pacs_viewer_token` cookie rather than a
    // Bearer header; authenticateDicomWeb accepts either. RegExp path captures
    // the entire sub-path into req.params[0] (Express 5 / path-to-regexp v8 no
    // longer supports the bare '*' wildcard).
    router.all(
        /^\/(dicom-web|wado)(\/.*)?$/,
        authenticateDicomWeb,
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        dicomWebProxy(pool)
    );

    // --- Authenticated RCMS API ---
    router.use(authenticateToken);

    // Mint the short-lived viewer cookie for the OHIF iframe. Guarded like the
    // DICOMweb proxy so only users who may view images can obtain one.
    router.post(
        '/viewer-session',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        createViewerSession(pool)
    );

    router.get(
        '/studies/:studyInstanceUid/export',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        exportPacsStudy(pool)
    );

    router.get(
        '/ai-analysis',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        getPacsAiAnalysisQueue(pool)
    );

    router.get(
        '/exams/:examId/imaging',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        authorizeExamImagingAccess(pool),
        getExamImagingStatus(pool)
    );

    router.get(
        '/exams/:examId/ai-analysis',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS', 'RECONCILE_STUDIES']),
        getExamAiAnalysisJobs(pool)
    );

    router.post(
        '/exams/:examId/ai-analysis',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        requestExamAiAnalysis(pool)
    );

    router.post(
        '/ai-analysis/jobs/:jobId/retry',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        retryPacsAiJob(pool)
    );

    router.post(
        '/ai-analysis/jobs/:jobId/cancel',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        cancelPacsAiJob(pool)
    );

    router.delete(
        '/ai-analysis/jobs/:jobId',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        deletePacsAiJob(pool)
    );

    router.post(
        '/ai-analysis/queue/retry-all',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        retryAllPacsAiJobs(pool)
    );

    router.post(
        '/ai-analysis/queue/cancel-all',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        cancelAllPacsAiJobs(pool)
    );

    router.get(
        '/quarantine',
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
        getQuarantine(pool)
    );

    router.get(
        '/scheduled-exams',
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
        searchScheduledExams(pool)
    );

    router.post(
        '/quarantine/:id/reconcile',
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
        reconcileQuarantineStudy(pool)
    );

    router.post(
        '/quarantine/:id/discard',
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
        discardQuarantineStudy(pool)
    );

    // Upload local DICOM / JPEG / PNG files into an examination. Multipart field
    // "files" (multiple). Guarded like other write actions on the imaging archive.
    router.post(
        '/exams/:examId/images',
        hasAnyPermission(pool, ['MANAGE_PACS', 'RECONCILE_STUDIES']),
        authorizeExamImagingAccess(pool),
        uploadPacsFiles,
        uploadExamImages(pool)
    );

    router.get(
        '/exams/:examId/upload-progress/:uploadSessionId',
        hasAnyPermission(pool, ['MANAGE_PACS', 'RECONCILE_STUDIES']),
        getExamUploadProgress(pool)
    );

    // Sync Modality DICOM connection to Orthanc and DB
    router.put(
        '/settings/modalities/:id',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        syncModalityToOrthanc(pool)
    );

    // Ping / Test Modality connection (DICOM C-ECHO)
    router.post(
        '/settings/modalities/:id/echo',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        pingModality(pool)
    );

    // Get Orthanc System Health & Stats
    router.get(
        '/settings/system',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        getOrthancSystemStatus()
    );

    router.get(
        '/settings/diagnostics',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        getPacsDiagnostics(pool)
    );

    // Get PACS Server Configurations
    router.get(
        '/settings/config',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        getPacsConfig()
    );

    // Update PACS Server Configurations
    router.put(
        '/settings/config',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        updatePacsConfig(pool)
    );

    router.get(
        '/audit',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        getPacsAudit(pool)
    );

    router.get(
        '/requests',
        hasAnyPermission(pool, ['MANAGE_PACS', 'RECONCILE_STUDIES']),
        getPacsRequests(pool)
    );

    router.get(
        '/worklist/preview',
        hasAnyPermission(pool, ['MANAGE_PACS', 'RECONCILE_STUDIES']),
        getPacsWorklistPreview(pool)
    );

    router.post(
        '/worklist/refresh',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        refreshPacsWorklist(pool)
    );

    router.get(
        '/storage',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        getPacsStorageSummary(pool)
    );

    router.post(
        '/storage/tier',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        runPacsTiering(pool)
    );

    router.post(
        '/ai-analysis/process',
        hasAnyPermission(pool, ['MANAGE_PACS']),
        runPacsAiAnalysisQueue(pool)
    );

    return router;
};
