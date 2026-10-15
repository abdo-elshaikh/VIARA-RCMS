const { getRequestQuery } = require('../utils/requestQuery');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const {
    getSystemUpdateStatus,
    checkForAvailableUpdates,
    verifyUpdatePackage,
    applySystemUpdate,
    getSystemUpdateHistory
} = require('../services/systemUpdateService');
const { logAction } = require('../services/auditService');

// Multer storage for uploaded update patches in secure quarantined folder
const updatesUploadDir = path.resolve(__dirname, '../../uploads/.quarantine/updates');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdir(updatesUploadDir, { recursive: true }, error => cb(error, updatesUploadDir));
    },
    filename: (req, file, cb) => {
        const safeExt = path.extname(file.originalname).toLowerCase() || '.zip';
        cb(null, `patch_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    }
});

const patchUpload = multer({
    storage,
    limits: { fileSize: 150 * 1024 * 1024 }, // 150MB patch limit
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.zip', '.patch', '.viara-patch'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid update file format. Only .zip or .viara-patch files are permitted.'));
        }
    }
});

const getStatus = (pool) => async (req, res, next) => {
    try {
        const status = await getSystemUpdateStatus(pool);
        res.json(status);
    } catch (error) {
        next(error);
    }
};

const checkUpdates = (pool) => async (req, res, next) => {
    try {
        const result = await checkForAvailableUpdates(pool, req.body || {});
        res.json(result);
    } catch (error) {
        next(error);
    }
};

const uploadPatch = (pool) => async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No update package file provided' });
        }

        const verification = await verifyUpdatePackage(req.file.path);
        
        await logAction(pool, {
            userId: req.user?.id || req.user?.user_id,
            action: 'UPDATE_PATCH_UPLOADED',
            entityType: 'SYSTEM_UPDATE',
            details: {
                filename: req.file.originalname,
                targetVersion: verification.targetVersion,
                sha256: verification.sha256,
                signatureVerified: verification.signatureVerified
            }
        }).catch(() => {});

        res.json({
            packagePath: req.file.path,
            originalName: req.file.originalname,
            ...verification
        });
    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => {});
        }
        res.status(400).json({ error: error.message });
    }
};

const applyUpdate = (pool) => async (req, res, next) => {
    try {
        const { packagePath, targetVersion, releaseNotes, autoBackup = true } = req.body;
        const initiatedBy = req.user?.id || req.user?.user_id;

        const result = await applySystemUpdate(pool, {
            packagePath,
            targetVersion,
            releaseNotes,
            initiatedBy,
            autoBackup
        });

        await logAction(pool, {
            userId: initiatedBy,
            action: 'SYSTEM_UPDATE_APPLIED',
            entityType: 'SYSTEM_UPDATE',
            entityId: result.updateId,
            details: {
                fromVersion: result.fromVersion,
                toVersion: result.toVersion,
                backupFile: result.backupFile
            }
        }).catch(() => {});

        res.json({
            message: 'System update applied successfully',
            ...result
        });
    } catch (error) {
        res.status(error.statusCode || 500).json({ code: 'SYSTEM_UPDATE_UNAVAILABLE', error: error.message });
    }
};

const getHistory = (pool) => async (req, res, next) => {
    try {
        const limit = Number(getRequestQuery(req).limit) || 20;
        const history = await getSystemUpdateHistory(pool, limit);
        res.json(history);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    patchUpload,
    getStatus,
    checkUpdates,
    uploadPatch,
    applyUpdate,
    getHistory
};
