const {
    getReferringDoctors,
    createReferringDoctor,
    updateReferringDoctor,
    getReferringDoctorStats
} = require('../src/controllers/referringDoctorController');
const { getInvoices } = require('../src/controllers/invoiceController');
const { getSafetyTemplates } = require('../src/controllers/safetyController');

describe('Security & Workflow Hardening Tests', () => {
    describe('Referring Doctor password hash redaction (P0 CWE-200)', () => {
        test('getReferringDoctors strips portal_password_hash from all returned doctors', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({
                    rows: [
                        {
                            doctor_id: 'doc-1',
                            full_name: 'Dr. John Doe',
                            email: 'john@example.com',
                            portal_password_hash: '$2b$10$secretHashThatShouldNeverLeak1234567890',
                            is_active: true
                        }
                    ]
                })
            };

            const req = { query: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await getReferringDoctors(mockDb)(req, res, next);

            expect(res.json).toHaveBeenCalled();
            const output = res.json.mock.calls[0][0];
            expect(output).toHaveLength(1);
            expect(output[0].full_name).toBe('Dr. John Doe');
            expect(output[0].portal_password_hash).toBeUndefined();
        });

        test('createReferringDoctor strips portal_password_hash from created doctor', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({
                    rows: [
                        {
                            doctor_id: 'doc-2',
                            full_name: 'Dr. Jane Smith',
                            email: 'jane@example.com',
                            portal_password_hash: '$2b$10$superSecretHash',
                            is_active: true
                        }
                    ]
                })
            };

            const req = { body: { fullName: 'Dr. Jane Smith' }, user: { user_id: 'admin-1' } };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            const next = jest.fn();

            await createReferringDoctor(mockDb)(req, res, next);

            expect(res.status).toHaveBeenCalledWith(201);
            const output = res.json.mock.calls[0][0];
            expect(output.full_name).toBe('Dr. Jane Smith');
            expect(output.portal_password_hash).toBeUndefined();
        });

        test('getReferringDoctorStats strips portal_password_hash from doctor detail', async () => {
            const mockDb = {
                query: jest.fn()
                    .mockResolvedValueOnce({
                        rows: [
                            {
                                doctor_id: 'doc-3',
                                full_name: 'Dr. Alice',
                                portal_password_hash: '$2b$10$hashShouldNotLeak'
                            }
                        ]
                    })
                    .mockResolvedValueOnce({ rows: [{ appointment_count: 5 }] })
                    .mockResolvedValueOnce({ rows: [] })
            };

            const req = { params: { id: 'doc-3' } };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await getReferringDoctorStats(mockDb)(req, res, next);

            expect(res.json).toHaveBeenCalled();
            const output = res.json.mock.calls[0][0];
            expect(output.doctor.full_name).toBe('Dr. Alice');
            expect(output.doctor.portal_password_hash).toBeUndefined();
        });
    });

    describe('Invoice Status & Payment Status Compatibility (P1)', () => {
        test('getInvoices populates status and payment_status matching invoice_status', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({
                    rows: [
                        {
                            invoice_id: 'inv-1',
                            invoice_number: 'INV-2026-0001',
                            invoice_status: 'Paid',
                            patient_payable_amount: '100.00',
                            paid_amount: '100.00',
                            balance_amount: '0.00',
                            first_name_enc: null,
                            last_name_enc: null,
                            items: [],
                            payments: []
                        }
                    ]
                })
            };

            const req = { query: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await getInvoices(mockDb)(req, res, next);

            expect(res.json).toHaveBeenCalled();
            const items = res.json.mock.calls[0][0];
            expect(items).toHaveLength(1);
            expect(items[0].invoice_status).toBe('Paid');
            expect(items[0].status).toBe('Paid');
            expect(items[0].payment_status).toBe('Paid');
        });
    });

    describe('Safety Templates Flexible Routing (P1)', () => {
        test('getSafetyTemplates supports modalityId via query or params', async () => {
            const mockDb = {
                query: jest.fn().mockResolvedValue({
                    rows: [{ template_id: 't-1', name: 'MRI Safety Questionnaire' }]
                })
            };

            // Via params
            const req1 = { params: { modalityId: 'mod-mri' }, query: {} };
            const res1 = { json: jest.fn() };
            await getSafetyTemplates(mockDb)(req1, res1, jest.fn());
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('AND modality_id = $1'),
                ['mod-mri']
            );

            // Via query
            const req2 = { params: {}, query: { modalityId: 'mod-ct' } };
            const res2 = { json: jest.fn() };
            await getSafetyTemplates(mockDb)(req2, res2, jest.fn());
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('AND modality_id = $1'),
                ['mod-ct']
            );
        });
    });
});
