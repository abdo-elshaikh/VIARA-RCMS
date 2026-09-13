jest.mock('../src/services/auditService', () => ({
    ...jest.requireActual('../src/services/auditService'),
    logAction: jest.fn().mockResolvedValue(true)
}));

const { createPatient, getPatientById } = require('../src/controllers/patientController');
const { errorHandler } = require('../src/middleware/errorHandler');

describe('Patient Controller Hardening & Canonical Routes', () => {
    describe('createPatient security sanitization (BUG-C01)', () => {
        it('should NOT leak portalPassword or password_hash in response', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({
                    rows: [{
                        patient_id: 'p-1001',
                        mrn: 'PAT-2026-TEST',
                        created_at: new Date().toISOString(),
                        password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789'
                    }]
                })
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
            expect(responseBody.data.mrn).toBe('PAT-2026-TEST');
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
