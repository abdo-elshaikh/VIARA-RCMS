const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const multer = require('multer');
const { AppError } = require('../middleware/errorHandler');
const { hasAnyPermission } = require('../middleware/rbacMiddleware');
const { authenticateDicomWeb } = require('../middleware/authMiddleware');
const { verifyPacsWebhook,
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
const { pacsWebhookLimiter } = require('../middleware/rateLimiters');

const PACS_QUARANTINE_DIR = path.resolve(
    process.env.PACS_UPLOAD_QUARANTINE_DIR || path.join(__dirname, '../../uploads/.quarantine/pacs')
);
const positiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const PACS_MAX_FILE_BYTES = positiveInteger(process.env.PACS_UPLOAD_MAX_FILE_BYTES, 25 * 1024 * 1024);
const PACS_MAX_FILES = positiveInteger(process.env.PACS_UPLOAD_MAX_FILES, 20);
const PACS_MAX_REQUEST_BYTES = positiveInteger(process.env.PACS_UPLOAD_MAX_REQUEST_BYTES, 200 * 1024 * 1024);

const upload = multer({
    storage: {
        _handleFile: (req, file, cb) => {
            const extension = path.extname(file.originalname || '').toLowerCase().slice(0, 12);
            const filename = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`;
            const target = path.join(PACS_QUARANTINE_DIR, filename);
            let size = 0;
            const budget = new Transform({ transform(chunk, encoding, done) {
                size += chunk.length;
                req.pacsReceivedFileBytes = (req.pacsReceivedFileBytes || 0) + chunk.length;
                if (req.pacsReceivedFileBytes > PACS_MAX_REQUEST_BYTES) return done(new AppError('PACS upload request is too large', 413));
                done(null, chunk);
            } });
            fs.promises.mkdir(PACS_QUARANTINE_DIR, { recursive: true })
                .then(() => pipeline(file.stream, budget, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 })))
                .then(() => cb(null, { destination: PACS_QUARANTINE_DIR, filename, path: target, size }))
                .catch(async error => { await fs.promises.unlink(target).catch(() => {}); cb(error); });
        },
        _removeFile: (_req, file, cb) => fs.unlink(file.path, cb)
    },
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
    fs.unlink(file.path, () => { });
});

const uploadPacsFiles = (req, res, next) => {
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > PACS_MAX_REQUEST_BYTES) {
        return next(new AppError('PACS upload request is too large', 413));
    }
    return upload.array('files', PACS_MAX_FILES)(req, res, (error) => {
        const totalBytes = (req.files || []).reduce((total, file) => total + Number(file.size || 0), 0);
        if (error || totalBytes > PACS_MAX_REQUEST_BYTES) cleanupPacsFiles(req.files);
        if (error) {
            if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT'
                || error.code === 'LIMIT_PART_COUNT' || error.code === 'LIMIT_FIELD_VALUE') {
                return next(new AppError('PACS upload exceeds the configured limits', 413));
            }
            return next(error);
        }
        if (totalBytes > PACS_MAX_REQUEST_BYTES) {
            return next(new AppError('PACS upload request is too large', 413));
        }
        return next();
    });
};

/**
 * PACS/imaging routes.
 *
 * The webhook is machine-to-machine (Orthanc -> VIARA) and authenticates with a
 * shared secret, so it is mounted BEFORE the JWT guard. Everything else is a
 * normal authenticated VIARA API guarded by PACS permissions.
 */
module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();

    // --- Machine-to-machine (no JWT) ---
    router.post('/webhook', pacsWebhookLimiter, verifyPacsWebhook, handleWebhook(pool));

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

    const { getBookmarks, saveBookmarks } = require('../controllers/pacsBookmarksController');
    const { readMeasurements, saveMeasurements, renewViewerSession } = require('../controllers/pacsMeasurementsController');
    router.get('/viewer-state/:studyInstanceUid/measurements', authenticateDicomWeb, hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']), readMeasurements(pool));
    router.put('/viewer-state/:studyInstanceUid/measurements', authenticateDicomWeb, hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']), saveMeasurements(pool));
    router.post('/viewer-renew', authenticateDicomWeb, hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']), renewViewerSession());
    // --- Authenticated VIARA API ---
    router.use(authenticateToken);
    router.get('/studies/:studyInstanceUid/bookmarks', hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']), getBookmarks(pool));
    router.put('/studies/:studyInstanceUid/bookmarks', hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']), saveBookmarks(pool));

    // Mint the short-lived viewer cookie for the OHIF iframe. Guarded like the
    // DICOMweb proxy so only users who may view images can obtain one.
    router.post(
        '/viewer-session',
        hasAnyPermission(pool, ['VIEW_PACS_IMAGES', 'MANAGE_PACS']),
        createViewerSession(pool)
    );

    router.get(
        '/studies/:studyInstanceUid/export',
        hasAnyPermission(pool, ['DOWNLOAD_PACS_DICOM', 'MANAGE_PACS']),
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
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
        requestExamAiAnalysis(pool)
    );

    router.post(
        '/ai-analysis/jobs/:jobId/retry',
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
        retryPacsAiJob(pool)
    );

    router.post(
        '/ai-analysis/jobs/:jobId/cancel',
        hasAnyPermission(pool, ['RECONCILE_STUDIES', 'MANAGE_PACS']),
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
