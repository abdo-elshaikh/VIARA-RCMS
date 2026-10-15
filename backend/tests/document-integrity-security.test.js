jest.mock('../src/services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('child_process', () => ({ execFile: jest.fn() }));
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { logAction } = require('../src/services/auditService');
const { uploadDocument, updateDocument } = require('../src/controllers/documentController');
const { validateAndPromoteAttachments } = require('../src/utils/chatAttachmentUpload');
const userId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => { jest.clearAllMocks(); logAction.mockResolvedValue(undefined); });

test.each([
    ['Radiologist', 'performing_radiologist_id'],
    ['Technician', 'technician_id']
])('metadata update keeps %s within assigned patients', async (role, assignment) => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const next = jest.fn();
    const res = { json: jest.fn() };
    await updateDocument(db)({ params: { id: patientId }, body: { notes: 'Changed' }, user: { role, user_id: userId } }, res, next);
    expect(db.query.mock.calls[0][0]).toContain('AND EXISTS');
    expect(db.query.mock.calls[0][0]).toContain(assignment);
    expect(db.query.mock.calls[0][1][3]).toBe(userId);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(res.json).not.toHaveBeenCalled();
});

const withUpload = async callback => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-document-security-'));
    const filename = path.join(directory, 'synthetic.pdf');
    fs.writeFileSync(filename, '%PDF-synthetic');
    try {
        await callback({
            file: { path: filename, filename: 'synthetic.pdf', originalname: 'synthetic.pdf', mimetype: 'application/pdf', size: 14 },
            body: { patient_id: patientId, type: 'Other' },
            user: { role: 'Admin', user_id: userId }, ip: '127.0.0.1'
        });
    } finally {
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
        fs.rmdirSync(directory);
    }
};

test('audit failure cannot remove a file whose document row was saved', async () => {
    const prior = process.env.CLAMSCAN_PATH;
    process.env.CLAMSCAN_PATH = 'synthetic-scanner';
    execFile.mockImplementation((_file, _args, _options, callback) => callback(null, '', ''));
    logAction.mockRejectedValueOnce(new Error('Synthetic audit outage'));
    try {
        await withUpload(async req => {
            const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [{ document_id: patientId }] }) };
            const next = jest.fn();
            await uploadDocument(db)(req, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next);
            expect(next).toHaveBeenCalled();
            expect(fs.existsSync(req.file.path)).toBe(true);
        });
    } finally { if (prior === undefined) delete process.env.CLAMSCAN_PATH; else process.env.CLAMSCAN_PATH = prior; }
});

test.each([[1, 400], [2, 503], ['ENOENT', 503]])('scanner exit %s reports %s and removes unpersisted upload', async (code, status) => {
    const prior = process.env.CLAMSCAN_PATH;
    process.env.CLAMSCAN_PATH = 'synthetic-scanner';
    execFile.mockImplementation((_file, _args, _options, callback) => callback(Object.assign(new Error('Synthetic scan failure'), { code })));
    try {
        await withUpload(async req => {
            const db = { query: jest.fn() };
            const next = jest.fn();
            await uploadDocument(db)(req, {}, next);
            expect(next.mock.calls[0][0].statusCode).toBe(status);
            expect(db.query).not.toHaveBeenCalled();
            expect(fs.existsSync(req.file.path)).toBe(false);
        });
    } finally { if (prior === undefined) delete process.env.CLAMSCAN_PATH; else process.env.CLAMSCAN_PATH = prior; }
});

test('chat scanner outage is a service failure and cannot promote the attachment', async () => {
    const prior = process.env.CLAMSCAN_PATH;
    process.env.CLAMSCAN_PATH = 'synthetic-scanner';
    execFile.mockImplementation((_file, _args, _options, callback) => callback(Object.assign(new Error('Synthetic scan outage'), { code: 2 })));
    try {
        await withUpload(async req => {
            await expect(validateAndPromoteAttachments([req.file])).rejects.toMatchObject({ statusCode: 503 });
            expect(fs.existsSync(req.file.path)).toBe(false);
        });
    } finally { if (prior === undefined) delete process.env.CLAMSCAN_PATH; else process.env.CLAMSCAN_PATH = prior; }
});
