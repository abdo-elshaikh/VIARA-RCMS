jest.mock('../src/services/settingsService', () => ({ getAll: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/services/notificationJobService', () => ({ triggerEventForRole: jest.fn().mockResolvedValue(undefined) }));
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const { resolvePortalDocument } = require('../src/services/portalDocumentService');
const { downloadMyDocument, getMyInvoicePdf } = require('../src/controllers/portalController');
const { buildPortalInvoicePdf } = require('../src/services/portalInvoicePdfService');
const { encrypt } = require('../src/utils/crypto');

const patient = '00000000-0000-0000-0000-000000000001';
const id = '00000000-0000-0000-0000-000000000002';
const root = path.resolve(__dirname, '../uploads/documents');
const filename = `portal-test-${crypto.randomUUID()}.pdf`;
const bytes = Buffer.from('%PDF-1.7\nSynthetic test file');
const row = { document_id: id, file_path: filename, file_name: 'patient.pdf', mime_type: 'application/pdf' };
const appFor = (handler) => {
    const app = express();
    app.use((req, res, next) => { req.user = { userId: patient, role: 'Patient' }; next(); });
    app.get('/:documentId', handler);
    app.get('/:invoiceId/pdf', handler);
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
    return app;
};

beforeAll(async () => { await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, filename), bytes, { flag: 'wx' }); });
afterAll(async () => { await fs.unlink(path.join(root, filename)); });

test('managed file resolves only through an owner-scoped, non-deleted record', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const result = await resolvePortalDocument(db, `/api/documents/${id}/download`, patient);
    expect(await fs.readFile(result.realFile)).toEqual(bytes);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('patient_id = $2::uuid AND is_deleted = FALSE'), [id, patient]);
});

test.each(['https://attacker.example/a.pdf', '//attacker.example/a.pdf', 'http://127.0.0.1/admin', '/uploads/documents/a%2fb.pdf', '/uploads/documents/a%5cb.pdf', 'javascript:alert(1)'])('rejects unsafe storage reference %s before database or network access', async reference => {
    const db = { query: jest.fn() };
    await expect(resolvePortalDocument(db, reference, patient)).rejects.toMatchObject({ statusCode: 503 });
    expect(db.query).not.toHaveBeenCalled();
});

test('foreign or deleted managed document returns 404', async () => {
    await expect(resolvePortalDocument({ query: jest.fn().mockResolvedValue({ rows: [] }) }, `/api/documents/${id}/download`, patient)).rejects.toMatchObject({ statusCode: 404 });
});

test.each(['../outside.pdf', 'folder/file.pdf', 'folder\\file.pdf'])('rejects corrupted managed path %s', async file_path => {
    await expect(resolvePortalDocument({ query: jest.fn().mockResolvedValue({ rows: [{ ...row, file_path }] }) }, `/api/documents/${id}/download`, patient)).rejects.toMatchObject({ statusCode: 503 });
});

test('missing file fails without exposing its storage path', async () => {
    await expect(resolvePortalDocument({ query: jest.fn().mockResolvedValue({ rows: [{ ...row, file_path: 'portal-missing-test.pdf' }] }) }, `/api/documents/${id}/download`, patient)).rejects.toMatchObject({ message: 'Document not found', statusCode: 404 });
});

test('foreign or hidden portal document fails before managed lookup or audit', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await request(appFor(downloadMyDocument(db))).get(`/${id}`).expect(404);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('is_patient_visible = TRUE'), [id, patient]);
});

test('owned visible document streams bytes as an attachment with private headers', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ document_id: id, file_url: `/api/documents/${id}/download` }] }).mockResolvedValueOnce({ rows: [row] }).mockResolvedValue({ rows: [] }) };
    const res = await request(appFor(downloadMyDocument(db))).get(`/${id}`).expect(200);
    expect(res.body).toEqual(bytes);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(db.query.mock.calls[2][1][1]).toBe('DocumentDownloaded');
});

test('invalid invoice identifier fails before querying the database', async () => {
    const db = { query: jest.fn() };
    await request(appFor(getMyInvoicePdf(db))).get('/bad-id/pdf').expect(404);
    expect(db.query).not.toHaveBeenCalled();
});

test('foreign or voided invoice cannot render or audit a PDF', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await request(appFor(getMyInvoicePdf(db))).get(`/${id}/pdf`).expect(404);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual([id, patient]);
});

test('owned invoice returns a native PDF and records a scoped audit', async () => {
    const db = { query: jest.fn().mockImplementation(async sql => {
        if (sql.includes('FROM invoices i')) return { rows: [{ invoice_number: 'INV-TEST', invoice_status: 'Paid', generated_at: new Date(), mrn: 'TEST', first_name_enc: encrypt('\u0623\u062d\u0645\u062f'), last_name_enc: encrypt('\u0645\u062d\u0645\u062f'), patient_payable_amount: 100, paid_amount: 100, refunded_amount: 0, credited_amount: 0 }] };
        if (sql.includes('FROM invoice_items')) return { rows: [{ description: '\u0623\u0634\u0639\u0629', quantity: 1, unit_price: 100, total_amount: 100 }] };
        return { rows: [] };
    }) };
    const res = await request(appFor(getMyInvoicePdf(db))).get(`/${id}/pdf`).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(db.query.mock.calls.at(-1)[1].slice(0, 4)).toEqual([patient, 'InvoiceDownloaded', 'Invoice', id]);
});

test('PDF rendering handles a multipage Arabic invoice with bundled fonts', async () => {
    const pdf = await buildPortalInvoicePdf({ invoice_number: 'TEST', generated_at: new Date(), invoice_status: 'Paid', patient_name: '\u0623\u062d\u0645\u062f', mrn: 'TEST' }, Array.from({ length: 90 }, () => ({ description: '\u0623\u0634\u0639\u0629 \u0645\u0642\u0637\u0639\u064a\u0629', quantity: 1, unit_price: 10, total_amount: 10 })), []);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(pdf.toString('latin1')).toContain('/FontFile2');
});
