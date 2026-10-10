jest.mock('../src/services/auditService', () => ({
    ...jest.requireActual('../src/services/auditService'),
    logAction: jest.fn().mockResolvedValue(true)
}));

const { createPatient, getPatientById } = require('../src/controllers/patientController');
const { errorHandler } = require('../src/middleware/errorHandler');

describe('Patient Controller Hardening & Canonical Routes', () => {
    describe('createPatient security sanitization (BUG-C01)', () => {
        it('should NOT leak portalPassword or password_hash in response', async () => {
            const insertRow = {
                patient_id: 'p-1001',
                mrn: 'PAT-2026-TEST',
                created_at: new Date().toISOString(),
                password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789'
            };
            const mockDb = {
                // First call = duplicate guard lookup (empty), second = INSERT.
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [insertRow] })
            };

            const req = {
                body: {
                    firstName: 'Ahmad',
                    lastName: 'Hassan',
                    dateOfBirth: '1990-01-01',
                    gender: 'Male',
                    phone: '+201000000000'
                },
                user: { user_id: 'u-admin-1', role: 'Admin' },
                ip: '127.0.0.1'
            };

            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            const handler = createPatient(mockDb);
            await handler(req, res, next);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalled();
            const responseBody = res.json.mock.calls[0][0];

            // Verify portalPassword is not exposed
            expect(responseBody.portalPassword).toBeUndefined();
            // Verify password_hash is not in data
            expect(responseBody.data.password_hash).toBeUndefined();
            expect(responseBody.data.password).toBeUndefined();
            expect(responseBody.data.patient_id).toBe('p-1001');
        });

        it('BUG-001: rejects duplicate patient with 409 + existing patient info (backend guard)', async () => {
            const mockDb = {
                // Duplicate guard lookup finds an existing active patient.
                query: jest.fn().mockResolvedValue({
                    rows: [{
                        patient_id: 'p-existing',
                        mrn: 'PAT-2026-EXIST',
                        patient_status: 'Active',
                        created_at: new Date().toISOString(),
                    }]
                })
            };
            const req = {
                body: {
                    firstName: 'Duplicate',
                    lastName: 'CheckUser',
                    dateOfBirth: '1985-05-05',
                    gender: 'Female',
                    phone: '01234567890'
                },
                user: { user_id: 'u-admin-1', role: 'Admin' },
                ip: '127.0.0.1'
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            const handler = createPatient(mockDb);
            await handler(req, res, next);

            expect(res.status).toHaveBeenCalledWith(409);
            const body = res.json.mock.calls[0][0];
            expect(body.code).toBe('PATIENT_DUPLICATE');
            expect(body.existingPatient).toEqual(expect.objectContaining({
                patient_id: 'p-existing',
                mrn: 'PAT-2026-EXIST'
            }));
            // No INSERT may run after a duplicate hit: exactly one query total.
            expect(mockDb.query).toHaveBeenCalledTimes(1);
        });

        it('keeps marketing consent fields synchronized when creating a patient', async () => {
            const insertRow = {
                patient_id: 'p-1002',
                mrn: 'PAT-2026-CONSENT',
                created_at: new Date().toISOString()
            };
            const mockDb = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [insertRow] })
            };

            const req = {
                body: {
                    firstName: 'Sara',
                    lastName: 'Ali',
                    dateOfBirth: '1992-02-02',
                    gender: 'Female',
                    phone: '+966500000000',
                    consentMarketing: true,
                    optInMarketing: true
                },
                user: { user_id: 'u-admin-1', role: 'Admin' },
                ip: '127.0.0.1'
            };

            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            const handler = createPatient(mockDb);
            await handler(req, res, next);

            expect(res.status).toHaveBeenCalledWith(201);
            const insertCall = mockDb.query.mock.calls[1];
            expect(insertCall[0]).toContain('opt_in_marketing');
            expect(insertCall[1]).toEqual(expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), true, expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String), expect.any(String)]));
            expect(insertCall[1][28]).toBe(true);
            expect(insertCall[1][29]).toBe('Active');
        });
    });

    describe('getPatientById canonical route (BUG-H03)', () => {
        it('should return decrypted patient data without password_hash', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({
                    rows: [{
                        patient_id: 'p-1001',
                        mrn: 'PAT-2026-TEST',
                        first_name: 'Ahmad',
                        last_name: 'Hassan',
                        password_hash: '$2b$10$hashedsecret'
                    }]
                })
            };

            const req = {
                params: { id: 'p-1001' },
                user: { user_id: 'u-doctor-1', role: 'Radiologist' }
            };

            const res = {
                json: jest.fn()
            };
            const next = jest.fn();

            const handler = getPatientById(mockDb);
            await handler(req, res, next);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    patient_id: 'p-1001',
                    mrn: 'PAT-2026-TEST',
                    portal_enabled: true
                })
            }));

            const responseData = res.json.mock.calls[0][0].data;
            expect(responseData.password_hash).toBeUndefined();
        });

        it('should return 404 AppError when patient is not found', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };

            const req = {
                params: { id: 'non-existent' },
                user: { user_id: 'u-1', role: 'Admin' }
            };

            const res = { json: jest.fn() };
            const next = jest.fn();

            const handler = getPatientById(mockDb);
            await handler(req, res, next);

            expect(next).toHaveBeenCalled();
            const error = next.mock.calls[0][0];
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Patient not found');
        });
    });

    describe('errorHandler stack trace protection (BUG-C02)', () => {
        it('should NOT include stack trace in error response by default', () => {
            const err = new Error('Database connection failure');
            const req = {};
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            errorHandler(err, req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            const responseBody = res.json.mock.calls[0][0];
            expect(responseBody.stack).toBeUndefined();
        });
    });
});
