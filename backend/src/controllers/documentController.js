const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { z } = require('zod');
const { uploadDocumentSchema, updateDocumentSchema } = require('../schemas/documentSchema');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const extensionByMime = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'application/dicom': '.dcm'
};

const hasExpectedSignature = (filePath, mimeType) => {
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(132);
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
        if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[bytesRead - 2] !== undefined;
        if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (mimeType === 'application/dicom') return bytesRead >= 132 && buffer.subarray(128, 132).toString() === 'DICM';
        return false;
    } finally {
        fs.closeSync(fd);
    }
};

const scanForMalware = async (filePath) => {
    const scanner = process.env.CLAMSCAN_PATH;
    if (!scanner) {
        if (process.env.NODE_ENV === 'production') {
            throw new AppError('Document scanning service is unavailable', 503);
        }
        return;
    }
    try {
        await execFileAsync(scanner, ['--config-file=/etc/clamav/clamd.conf', '--stream', '--no-summary', filePath], {
            timeout: Number(process.env.MALWARE_SCAN_TIMEOUT_MS || 30000),
            windowsHide: true,
            maxBuffer: 1024 * 1024
        });
    } catch (error) {
        throw new AppError(error.killed ? 'Document scan timed out' : 'Document failed malware screening', 400);
    }
};

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join(__dirname, '../../uploads/documents');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extensionByMime[file.mimetype]}`);
    }
});

// Filter for allowed file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/dicom'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Invalid file type. Only PDF, JPEG, PNG, and DICOM allowed.', 400), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter
});

const documentScope = (role, patientExpression, userParameter) => {
    if (role === 'Radiologist') {
        return `EXISTS (SELECT 1 FROM examinations scope_exam
                        WHERE scope_exam.patient_id = ${patientExpression}
                          AND scope_exam.performing_radiologist_id = ${userParameter})`;
    }
    if (role === 'Technician') {
        return `EXISTS (SELECT 1 FROM appointments scope_appt
                        WHERE scope_appt.patient_id = ${patientExpression}
                          AND scope_appt.technician_id = ${userParameter})`;
    }
    if (role === 'Nurse') {
        return `EXISTS (SELECT 1 FROM appointments scope_appt
                        WHERE scope_appt.patient_id = ${patientExpression}
                          AND scope_appt.nurse_id = ${userParameter})`;
    }
    return `(${userParameter}::uuid IS NULL OR TRUE)`;
};

const uploadDocument = (db) => async (req, res, next) => {
    try {
        const file = req.file;
        if (!file) return next(new AppError('No file uploaded', 400));

        if (!hasExpectedSignature(file.path, file.mimetype)) {
            fs.unlinkSync(file.path);
            return next(new AppError('File content does not match its declared type', 400));
        }
        await scanForMalware(file.path);

        const data = uploadDocumentSchema.parse(req.body);
        const userId = req.user.user_id;

        const scope = documentScope(req.user.role, 'p.patient_id', '$4');
        const relation = await db.query(`
            SELECT 1
            FROM patients p
            LEFT JOIN appointments a ON a.appointment_id = $2 AND a.patient_id = p.patient_id
            LEFT JOIN examinations e ON e.exam_id = $3 AND e.patient_id = p.patient_id
            WHERE p.patient_id = $1
              AND ($2::uuid IS NULL OR a.appointment_id IS NOT NULL)
              AND ($3::uuid IS NULL OR e.exam_id IS NOT NULL)
              AND ${scope}
        `, [data.patient_id, data.appointment_id || null, data.exam_id || null, userId]);
        if (relation.rows.length === 0) {
            fs.unlinkSync(file.path);
            return next(new AppError('Document references do not belong to the selected patient or you lack permissions.', 403));
        }

        const result = await db.query(
            `INSERT INTO documents
            (patient_id, appointment_id, exam_id, uploaded_by, type, file_name, file_path, mime_type, size_bytes, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [data.patient_id, data.appointment_id || null, data.exam_id || null, userId, data.type, file.originalname, file.filename, file.mimetype, file.size, data.notes]
        );

        await logAction(db, {
            userId, action: 'DOCUMENT_UPLOADED', resourceId: result.rows[0].document_id, resourceTable: 'documents',
            ipAddress: req.ip, details: { type: data.type, file_name: file.originalname }
        });

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getPatientDocuments = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const scope = documentScope(req.user.role, 'd.patient_id', '$2');
        const result = await db.query(`
            SELECT d.*, u.full_name as uploader_name 
            FROM documents d 
            LEFT JOIN users u ON d.uploaded_by = u.user_id 
            WHERE d.patient_id = $1 AND d.is_deleted = FALSE
              AND ${scope}
            ORDER BY d.created_at DESC
        `, [id, req.user.user_id]);

        await logAction(db, {
            userId: req.user.user_id,
            action: 'DOCUMENT_LIST_VIEWED',
            eventCode: 'DOCUMENT.LIST_VIEWED',
            category: 'PHI_ACCESS',
            resourceId: id,
            resourceTable: 'patients',
            patientId: id,
            ipAddress: req.ip,
            httpMethod: req.method,
            requestPath: req.originalUrl?.split('?')[0],
            details: { documentCount: result.rows.length }
        });
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const downloadDocument = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const scope = documentScope(req.user.role, 'd.patient_id', '$2');
        const result = await db.query(`
            SELECT d.file_path, d.file_name, d.mime_type
            FROM documents d
            WHERE d.document_id = $1 AND d.is_deleted = FALSE
              AND ${scope}
        `, [id, req.user.user_id]);
        
        if (result.rows.length === 0) return next(new AppError('Document not found', 404));
        
        const doc = result.rows[0];
        const uploadRoot = path.resolve(__dirname, '../../uploads/documents');
        const filePath = path.resolve(uploadRoot, path.basename(doc.file_path));
        if (!filePath.startsWith(`${uploadRoot}${path.sep}`)) {
            return next(new AppError('Invalid document path', 400));
        }

        if (!fs.existsSync(filePath)) return next(new AppError('File missing from storage', 404));

        await logAction(db, {
            userId: req.user.user_id,
            action: 'DOCUMENT_DOWNLOADED',
            resourceId: id,
            resourceTable: 'documents',
            ipAddress: req.ip,
            details: { fileName: doc.file_name }
        });

        res.setHeader('Content-Type', doc.mime_type);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(doc.file_name).replace(/["\r\n]/g, '_')}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        next(error);
    }
};

const updateDocument = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = updateDocumentSchema.parse(req.body);

        const result = await db.query(
            `UPDATE documents SET type = COALESCE($1, type), notes = COALESCE($2, notes), updated_at = CURRENT_TIMESTAMP WHERE document_id = $3 AND is_deleted = FALSE RETURNING *`,
            [data.type, data.notes, id]
        );

        if (result.rows.length === 0) return next(new AppError('Document not found', 404));
        res.json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const deleteDocument = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.user_id;

        const result = await db.query(
            `UPDATE documents SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE document_id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) return next(new AppError('Document not found', 404));

        await logAction(db, {
            userId, action: 'DOCUMENT_DELETED', resourceId: id, resourceTable: 'documents',
            ipAddress: req.ip, details: { file_name: result.rows[0].file_name }
        });

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    upload,
    uploadDocument,
    getPatientDocuments,
    downloadDocument,
    updateDocument,
    deleteDocument
};
