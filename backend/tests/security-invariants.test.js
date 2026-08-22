const crypto = require('crypto');

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
});

describe('security and financial invariants', () => {
    beforeAll(() => {
        process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });

    test('PII encryption uses AES-GCM and rejects legacy CBC values', () => {
        const { encrypt, decrypt } = require('../src/utils/crypto');
        const encrypted = encrypt('Sensitive value');
        expect(encrypted).toMatch(/^v2:/);
        expect(decrypt(encrypted)).toBe('Sensitive value');
        const parts = encrypted.split(':');
        parts[3] = `${parts[3][0] === '0' ? '1' : '0'}${parts[3].slice(1)}`;
        expect(() => decrypt(parts.join(':'))).toThrow();

        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const legacy = Buffer.concat([cipher.update('Legacy value'), cipher.final()]);
        expect(() => decrypt(`${iv.toString('hex')}:${legacy.toString('hex')}`)).toThrow('legacy AES-CBC format is no longer supported');
    });

    test('unknown roles cannot inherit admin dashboard data', async () => {
        const { getDashboardStats } = require('../src/controllers/dashboardController');
        const next = jest.fn();
        await getDashboardStats({})({ user: { role: 'Patient' } }, createResponse(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('developer receives governed executive dashboard data', async () => {
        const DashboardService = require('../src/services/dashboardService');
        const { getDashboardStats } = require('../src/controllers/dashboardController');
        const adminSpy = jest.spyOn(DashboardService.prototype, 'getAdminStats').mockResolvedValue({
            totalScans: 12,
            activeStaff: 4
        });
        const activitySpy = jest.spyOn(DashboardService.prototype, 'getRecentActivity').mockResolvedValue([]);
        const res = createResponse();
        const next = jest.fn();

        await getDashboardStats({})({
            user: { role: 'Developer', user_id: 'dev-1', email: 'developer@VIARA.com' }
        }, res, next);

        expect(adminSpy).toHaveBeenCalled();
        expect(activitySpy).toHaveBeenCalledWith(5);
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            role: 'Developer',
            totalScans: 12,
            activeStaff: 4,
            recentActivity: [],
            userName: 'developer@VIARA.com'
        }));

        adminSpy.mockRestore();
        activitySpy.mockRestore();
    });

    test('technicians cannot write diagnostic report content', async () => {
        const { updateReport } = require('../src/controllers/examController');
        const db = { query: jest.fn(), connect: jest.fn() };
        const next = jest.fn();
        await updateReport(db)({
            body: { examId: 'exam-1', reportContent: 'diagnosis', status: 'Reporting' },
            user: { user_id: 'tech-1', role: 'Technician' }
        }, createResponse(), next);
        expect(db.query).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    test('invalid claim lifecycle transitions roll back', async () => {
        const { updateClaimStatus } = require('../src/controllers/claimsController');
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ claim_id: 'claim-1', status: 'Draft', expected_amount: 100, received_amount: 0 }] })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn()
        };
        const next = jest.fn();
        await updateClaimStatus({ connect: jest.fn().mockResolvedValue(client) })({
            params: { id: 'claim-1' },
            body: { status: 'Paid', receivedAmount: 100 },
            user: { user_id: 'admin-1' }
        }, createResponse(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    test('claims cannot be submitted before approval', async () => {
        const { updateClaimStatus } = require('../src/controllers/claimsController');
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ claim_id: 'claim-1', status: 'Draft', expected_amount: 100, received_amount: 0 }] })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn()
        };
        const next = jest.fn();

        await updateClaimStatus({ connect: jest.fn().mockResolvedValue(client) })({
            params: { id: 'claim-1' },
            body: { status: 'Submitted', claimReferenceNumber: 'PAYER-1' },
            user: { user_id: 'admin-1' }
        }, createResponse(), next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE insurance_claims'))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('claim creators cannot approve their own request', async () => {
        const { updateClaimStatus } = require('../src/controllers/claimsController');
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{
                        claim_id: 'claim-1',
                        status: 'Pending Approval',
                        expected_amount: 100,
                        received_amount: 0,
                        created_by: 'user-1'
                    }]
                })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn()
        };
        const next = jest.fn();

        await updateClaimStatus({ connect: jest.fn().mockResolvedValue(client) })({
            params: { id: 'claim-1' },
            body: { status: 'Approved' },
            user: { user_id: 'user-1', role: 'Insurance_Staff' }
        }, createResponse(), next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE insurance_claims'))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('patient deletion preserves history and restricts the account', async () => {
        const { deletePatient } = require('../src/controllers/patientController');
        const client = {
            query: jest.fn(async sql => {
                if (String(sql).includes('SELECT patient_id')) {
                    return { rows: [{ patient_id: 'patient-1', patient_status: 'Active' }] };
                }
                if (String(sql).includes('INSERT INTO system_logs')) {
                    return { rows: [{ log_id: 'audit-patient-restricted' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const res = createResponse();
        await deletePatient({ connect: jest.fn().mockResolvedValue(client) })({
            params: { id: 'patient-1' }, user: { user_id: 'admin-1' }, ip: '127.0.0.1'
        }, res, jest.fn());
        const statements = client.query.mock.calls.map(([sql]) => String(sql)).join('\n');
        expect(statements).toContain("SET patient_status = 'Restricted'");
        expect(statements).not.toMatch(/DELETE FROM (patients|appointments|examinations|invoices|payments)/);
        expect(res.json).toHaveBeenCalled();
    });
});
