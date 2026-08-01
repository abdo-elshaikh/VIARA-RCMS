const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { AppError } = require('../middleware/errorHandler');

const execFileAsync = promisify(execFile);

const CHAT_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/chat');
const CHAT_QUARANTINE_DIR = path.resolve(__dirname, '../../uploads/.quarantine/chat');
const MAX_CHAT_FILE_SIZE = Number(process.env.CHAT_ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024);
const MAX_CHAT_FILES = Number(process.env.CHAT_ATTACHMENT_MAX_FILES || 5);

const extensionByMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
};

const allowedMimeTypes = new Set(Object.keys(extensionByMime));

const ensureUploadDir = () => {
    if (!fs.existsSync(CHAT_UPLOAD_DIR)) {
        fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
    }
};

const safeOriginalName = (name = 'attachment') => path.basename(name).replace(/[\r\n"]/g, '_').slice(0, 180);

const buildStoredName = (file) => {
    const ext = extensionByMime[file.mimetype] || path.extname(file.originalname || '').toLowerCase() || '.bin';
    return `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
};

const fileFilter = (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) return cb(null, true);
    return cb(new AppError('Unsupported chat attachment type', 400), false);
};

const hasExpectedSignature = (filePath, mimeType) => {
    const bytes = fs.readFileSync(filePath).subarray(0, 512);
    if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString());
    if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (mimeType === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
    if (mimeType.startsWith('text/')) return !bytes.includes(0);
    if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
        return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    }
    if (mimeType.includes('openxmlformats')) {
        return bytes[0] === 0x50 && bytes[1] === 0x4b;
    }
    return false;
};

const scanChatAttachment = async (filePath) => {
    const scanner = process.env.CLAMSCAN_PATH;
    if (!scanner) {
        if (process.env.NODE_ENV === 'production') throw new AppError('Attachment scanning service is unavailable', 503);
        return;
    }
    try {
        await execFileAsync(scanner, ['--no-summary', filePath], {
            timeout: Number(process.env.MALWARE_SCAN_TIMEOUT_MS || 30000),
            windowsHide: true,
            maxBuffer: 1024 * 1024
        });
    } catch (error) {
        throw new AppError(error.killed ? 'Attachment scan timed out' : 'Attachment failed malware screening', 400);
    }
};

const validateAndPromoteAttachments = async (files = []) => {
    for (const file of files) {
        try {
            if (!hasExpectedSignature(file.path, file.mimetype)) throw new AppError('Attachment content does not match its type', 400);
            await scanChatAttachment(file.path);
            ensureUploadDir();
            const target = path.join(CHAT_UPLOAD_DIR, file.filename);
            fs.renameSync(file.path, target);
            file.path = target;
        } catch (error) {
            cleanupUploadedFiles(files);
            throw error;
        }
    }
    return files;
};

const chatAttachmentUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdirSync(CHAT_QUARANTINE_DIR, { recursive: true });
            cb(null, CHAT_QUARANTINE_DIR);
        },
        filename: (_req, file, cb) => cb(null, buildStoredName(file))
    }),
    fileFilter,
    limits: {
        files: MAX_CHAT_FILES,
        fileSize: MAX_CHAT_FILE_SIZE
    }
});

const validateChatAttachments = async (req, _res, next) => {
    try {
        await validateAndPromoteAttachments(req.files || []);
        next();
    } catch (error) {
        next(error);
    }
};

const buildAttachmentMetadata = (file) => ({
    id: crypto.randomUUID(),
    kind: file.mimetype.startsWith('image/') ? 'image' : 'file',
    originalName: safeOriginalName(file.originalname),
    storedName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    url: `/api/chat/attachments/${encodeURIComponent(file.filename)}`
});

const parseAttachments = (files = []) => files.map(buildAttachmentMetadata);

const cleanupUploadedFiles = (files = []) => {
    files.forEach((file) => {
        if (!file?.path) return;
        try {
            fs.unlinkSync(file.path);
        } catch {
            // Best-effort cleanup only.
        }
    });
};

const resolveAttachmentPath = (storedName) => {
    const safeName = path.basename(String(storedName || ''));
    if (!safeName || safeName !== storedName) {
        throw new AppError('Invalid attachment path', 400);
    }

    const resolved = path.resolve(CHAT_UPLOAD_DIR, safeName);
    if (!resolved.startsWith(`${CHAT_UPLOAD_DIR}${path.sep}`)) {
        throw new AppError('Invalid attachment path', 400);
    }
    return resolved;
};

const serveChatAttachment = (req, res, next) => {
    try {
        const filePath = resolveAttachmentPath(req.params.fileName);
        if (!fs.existsSync(filePath)) {
            return next(new AppError('Attachment not found', 404));
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');
        res.sendFile(filePath);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    chatAttachmentUpload,
    validateChatAttachments,
    validateAndPromoteAttachments,
    cleanupUploadedFiles,
    parseAttachments,
    serveChatAttachment
};
