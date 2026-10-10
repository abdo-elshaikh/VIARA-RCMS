const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('../middleware/errorHandler');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uploadRoot = path.resolve(__dirname, '../../uploads/documents');

const resolvePortalDocument = async (db, fileUrl, patientId) => {
    // Resolve identifiers only. Never fetch or redirect to a URL from the database.
    let url;
    try { url = new URL(fileUrl, 'http://viara.invalid'); } catch { throw new AppError('Document storage reference is unavailable', 503); }
    const trusted = [process.env.CLIENT_URL, process.env.PORTAL_CLIENT_URL].filter(Boolean).map(value => {
        try { return new URL(value).origin; } catch { return null; }
    });
    if (url.username || url.password || (url.origin !== 'http://viara.invalid' && !trusted.includes(url.origin))) {
        throw new AppError('Document must be migrated to managed storage before download', 503);
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { throw new AppError('Invalid document storage reference', 503); }
    const reference = pathname.match(/^\/api\/documents\/([^/]+)\/download\/?$/);
    const stored = pathname.match(/^\/uploads\/documents\/([^/]+)$/);
    if (!((reference && UUID.test(reference[1])) || stored)) {
        throw new AppError('Document must be migrated to managed storage before download', 503);
    }
    const identifier = reference ? reference[1] : stored[1];
    if (identifier.includes('\\') || identifier.includes('\0') || identifier === '.' || identifier === '..') {
        throw new AppError('Invalid document storage reference', 503);
    }
    const result = await db.query(`
        SELECT document_id, file_path, file_name, mime_type
        FROM documents
        WHERE ${reference ? 'document_id = $1::uuid' : 'file_path = $1'}
          AND patient_id = $2::uuid AND is_deleted = FALSE
    `, [identifier, patientId]);
    if (!result.rows.length) throw new AppError('Document not found', 404);
    const document = result.rows[0];
    const filename = document.file_path;
    if (typeof filename !== 'string' || !filename || filename !== path.basename(filename)
        || filename.includes('\\') || filename.includes('\0') || filename === '.' || filename === '..') {
        throw new AppError('Invalid document storage reference', 503);
    }
    let realRoot, realFile;
    try {
        [realRoot, realFile] = await Promise.all([fs.realpath(uploadRoot), fs.realpath(path.join(uploadRoot, filename))]);
        const relative = path.relative(realRoot, realFile);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new AppError('Invalid document storage reference', 503);
        if (!(await fs.stat(realFile)).isFile()) throw new AppError('Document not found', 404);
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(error.code === 'ENOENT' ? 'Document not found' : 'Document storage is unavailable', error.code === 'ENOENT' ? 404 : 503);
    }
    return { ...document, realFile };
};

module.exports = { resolvePortalDocument, UUID };
