const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PATIENT_ID = '00000000-0000-4000-8000-000000000101';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_ID = '00000000-0000-4000-8000-000000000201';

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis()
});

const makeReq = (overrides = {}) => ({
    params: {},
    body: {},
    ip: '127.0.0.1',
    user: { user_id: USER_ID, role: 'Admin' },
    ...overrides
});

describe('privacy controller workflow hardening', () => {
    let tempDir;
    let controller;
    let encrypt;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rcms-privacy-'));
        process.env.ENCRYPTION_KEY = TEST_KEY;
        process.env.PRIVACY_EXPORT_DIR = tempDir;
        jest.resetModules();
        controller = require('../src/controllers/privacyController');
        ({ encrypt } = require('../src/utils/crypto'));
    });

    afterAll(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('recording consent updates consent history and active patient flag in one transaction', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT patient_id FROM patients')) return { rows: [{ patient_id: PATIENT_ID }] };
                if (text.includes('INSERT INTO patient_consents')) return { rows: [{ consent_id: 'consent-1', patient_id: PATIENT_ID, type: 'Marketing', status: 'Active' }] };
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = createResponse();
        const next = jest.fn();

        await controller.addPatientConsent(db)(makeReq({
            params: { patientId: PATIENT_ID },
            body: { type: 'Marketing', source: 'Staff' }
        }), res, next);

        const statements = client.query.mock.calls.map(([sql]) => String(sql));
        expect(statements).toContain('BEGIN');
        expect(statements.some(sql => sql.includes('INSERT INTO patient_consents'))).toBe(true);
        expect(client.query).toHaveBeenCalledWith('UPDATE patients SET consent_marketing = $2 WHERE patient_id = $1', [PATIENT_ID, true]);
        expect(statements.some(sql => sql.includes('INSERT INTO system_logs'))).toBe(true);
        expect(statements).toContain('COMMIT');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(next).not.toHaveBeenCalled();
    });

    test('request resolution refuses an action that does not match the request type', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                if (String(sql).includes('SELECT * FROM data_privacy_requests')) {
                    return { rows: [{ request_id: REQUEST_ID, patient_id: PATIENT_ID, request_type: 'Anonymize', status: 'Pending' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ allowed: 1 }] }),
            connect: jest.fn().mockResolvedValue(client)
        };
        const next = jest.fn();

        await controller.resolvePrivacyRequest(db)(makeReq({
            params: { requestId: REQUEST_ID },
            body: { action: 'Export' }
        }), createResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    });

    test('correction request resolution requires notes and closes the request as resolved', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT * FROM data_privacy_requests')) {
                    return { rows: [{ request_id: REQUEST_ID, patient_id: PATIENT_ID, request_type: 'Correction', status: 'Pending' }] };
                }
                if (text.includes('UPDATE data_privacy_requests')) {
                    return { rows: [{ request_id: REQUEST_ID, status: 'Resolved', resolution_notes: 'Corrected phone number' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ allowed: 1 }] }),
            connect: jest.fn().mockResolvedValue(client)
        };
        const res = createResponse();
        const next = jest.fn();

        await controller.resolvePrivacyRequest(db)(makeReq({
            params: { requestId: REQUEST_ID },
            body: { action: 'Resolve', notes: 'Corrected phone number' }
        }), res, next);

        expect(client.query.mock.calls.some(([, params]) => Array.isArray(params) && params.includes('PRIVACY_REQUEST_RESOLVED'))).toBe(true);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Privacy request resolved',
            request: expect.objectContaining({ status: 'Resolved' })
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('export resolution creates an encrypted artifact and returns metadata instead of raw data', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT * FROM data_privacy_requests')) {
                    return { rows: [{ request_id: REQUEST_ID, patient_id: PATIENT_ID, request_type: 'Export', status: 'Pending' }] };
                }
                if (text.includes('SELECT * FROM patients')) {
                    return { rows: [{ patient_id: PATIENT_ID, mrn: 'MRN-1', first_name_enc: encrypt('Mona'), last_name_enc: encrypt('Ali') }] };
                }
                if (text.includes('INSERT INTO privacy_export_artifacts')) {
                    return { rows: [{ export_id: 'export-1', request_id: REQUEST_ID, patient_id: PATIENT_ID, checksum: 'abc', expires_at: new Date().toISOString(), download_count: 0 }] };
                }
                if (text.includes('UPDATE data_privacy_requests')) {
                    return { rows: [{ request_id: REQUEST_ID, status: 'Completed', export_id: 'export-1' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ allowed: 1 }] }),
            connect: jest.fn().mockResolvedValue(client)
        };
        const res = createResponse();

        await controller.resolvePrivacyRequest(db)(makeReq({
            params: { requestId: REQUEST_ID },
            body: { action: 'Export' }
        }), res, jest.fn());

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Export generated',
            export: expect.objectContaining({ export_id: 'export-1' })
        }));
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('Mona');
    });

    test('anonymization revokes portal access and active consents transactionally', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT * FROM data_privacy_requests')) {
                    return { rows: [{ request_id: REQUEST_ID, patient_id: PATIENT_ID, request_type: 'Anonymize', status: 'Pending' }] };
                }
                if (text.includes('SELECT patient_id, patient_status FROM patients')) {
                    return { rows: [{ patient_id: PATIENT_ID, patient_status: 'Active' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ allowed: 1 }] }),
            connect: jest.fn().mockResolvedValue(client)
        };
        const res = createResponse();
        const next = jest.fn();

        await controller.resolvePrivacyRequest(db)(makeReq({
            params: { requestId: REQUEST_ID },
            body: { action: 'Anonymize' }
        }), res, next);

        const statements = client.query.mock.calls.map(([sql]) => String(sql)).join('\n');
        expect(statements).toContain("patient_status = 'Anonymized'");
        expect(statements).toContain("revoked_reason = 'patient_record_anonymized'");
        expect(statements).toContain("UPDATE patient_consents");
        expect(client.query.mock.calls.some(([, params]) => Array.isArray(params) && params.includes('PATIENT_ANONYMIZED'))).toBe(true);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith({ message: 'Patient anonymized' });
        expect(next).not.toHaveBeenCalled();
    });
});
