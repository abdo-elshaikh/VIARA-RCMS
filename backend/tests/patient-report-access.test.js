jest.mock('../src/services/pdfService', () => ({
    default: { buildReportHtml: jest.fn(() => '<html><body>Final report</body></html>') }
}));
jest.mock('../src/services/reportPdfRenderer', () => ({
    buildReportPdf: jest.fn(async () => Buffer.from('%PDF-test-report')),
    cleanFilenamePart: jest.fn((value) => String(value || 'report'))
}));
jest.mock('../src/services/settingsService', () => ({ getAll: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/services/auditService', () => ({ logAction: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/utils/crypto', () => ({ decrypt: jest.fn((value) => value || '') }));

const { getReportPdf } = require('../src/controllers/examController');
const { getMyRecords } = require('../src/controllers/portalController');
const { buildReportPdf } = require('../src/services/reportPdfRenderer');

const createResponse = () => ({
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn()
});

const patientRequest = (overrides = {}) => ({
    headers: {},
    params: { id: 'exam-1' },
    query: { customize: 'false' },
    user: { userId: 'patient-1', role: 'Patient' },
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('jest-agent'),
    ...overrides
});

const reportRow = (overrides = {}) => ({
    exam_id: 'exam-1',
    appointment_id: 'appointment-1',
    patient_id: 'patient-1',
    status: 'Completed',
    report_status: 'Amended',
    report_locked: true,
    report_finalized_at: '2026-09-21T10:00:00.000Z',
    report_invoice_id: 'invoice-1',
    report_balance_amount: 0,
    mrn: 'PAT-1',
    first_name_enc: 'Patient',
    last_name_enc: 'Name',
    date_of_birth_enc: '2000-01-01',
    ...overrides
});

describe('patient final report access', () => {
    beforeEach(() => jest.clearAllMocks());

    test('allows the patient owner to preview an amended final report', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [reportRow()] })
                .mockResolvedValue({ rows: [] })
        };
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(patientRequest(), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
        expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Final report'));
    });

    test('does not apply a request-selected clinical template to a signed report', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({
                    rows: [reportRow({
                        report_status: 'Finalized',
                        report_sections: { findings: 'Approved findings', impression: 'Approved impression' },
                        digital_signature_hash: 'signed-hash'
                    })]
                })
                .mockResolvedValue({ rows: [] })
        };
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(patientRequest({
            query: { format: 'pdf', templateId: '00000000-0000-4000-8000-000000000009' }
        }), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM report_templates'))).toBe(false);
        expect(buildReportPdf).toHaveBeenCalledWith(expect.objectContaining({
            report_sections: { findings: 'Approved findings', impression: 'Approved impression' },
            digital_signature_hash: 'signed-hash'
        }), expect.any(Object));
    });

    test('allows a finalized report through a short-lived public report capability', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [reportRow()] })
                .mockResolvedValue({ rows: [] })
        };
        const req = patientRequest({
            user: { role: 'PublicReport' },
            publicReportAccess: { examId: 'exam-1' }
        });
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Final report'));
        expect(db.query.mock.calls[1][1][4]).toBe('Patient Portal');
    });

    test('downloads the finalized public report as a real PDF attachment', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [reportRow({ order_number: 'ORD-42' })] })
                .mockResolvedValue({ rows: [] })
        };
        const req = patientRequest({
            body: { format: 'pdf', disposition: 'attachment' },
            user: { role: 'PublicReport' },
            publicReportAccess: { examId: 'exam-1' }
        });
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="Diagnostic-Report-ORD-42.pdf"');
        expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    test('denies public capability access when the report is still a draft', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [reportRow({ report_status: 'Draft', report_locked: false })] }) };
        const req = patientRequest({
            user: { role: 'PublicReport' },
            publicReportAccess: { examId: 'exam-1' }
        });
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(res.send).not.toHaveBeenCalled();
    });

    test('denies the patient owner access to a draft report', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [reportRow({ report_status: 'Draft', report_locked: false })] }) };
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(patientRequest(), res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(res.send).not.toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('denies the patient owner until the active invoice is settled', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [reportRow({ report_balance_amount: 25 })] }) };
        const res = createResponse();
        const next = jest.fn();

        await getReportPdf(db)(patientRequest(), res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(res.send).not.toHaveBeenCalled();
    });

    test('allows only the referring doctor linked to a finalized report', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [reportRow({ access_referring_doctor_id: 'doctor-1' })] })
                .mockResolvedValue({ rows: [] })
        };
        const res = createResponse();
        const next = jest.fn();
        const req = patientRequest({ user: { role: 'Doctor', doctorId: 'doctor-1' } });

        await getReportPdf(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.send).toHaveBeenCalled();
    });

    test('denies an unrelated doctor even when the report is finalized', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [reportRow({ access_referring_doctor_id: 'doctor-2' })] }) };
        const res = createResponse();
        const next = jest.fn();
        const req = patientRequest({ user: { role: 'Doctor', doctorId: 'doctor-1' } });

        await getReportPdf(db)(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(res.send).not.toHaveBeenCalled();
    });

    test('masks report narrative and signer fields in the records query until finalization', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = createResponse();

        await getMyRecords(db)({ user: { userId: 'patient-1' } }, res, jest.fn());

        const [query, params] = db.query.mock.calls[0];
        expect(query).toContain("e.report_status IN ('Finalized', 'Amended')");
        expect(query).toContain('COALESCE(e.report_locked, FALSE) = TRUE');
        expect(query).toContain('e.report_finalized_at IS NOT NULL');
        expect(query).toContain('THEN e.report_content ELSE NULL END AS report_content');
        expect(query).toContain('THEN e.report_sections ELSE NULL END AS report_sections');
        expect(query).toContain('THEN u.full_name ELSE NULL END AS radiologist_name');
        expect(params).toEqual(['patient-1']);
    });
});
