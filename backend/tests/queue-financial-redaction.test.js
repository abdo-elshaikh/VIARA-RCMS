jest.mock('../src/utils/crypto', () => ({ decrypt: () => '' }));

const { getQueue } = require('../src/controllers/queueController');

describe('queue financial field visibility', () => {
    test('removes invoice and payment-exception fields without VIEW_INVOICES', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{
                        exam_id: 'exam-1',
                        appointment_id: 'appointment-1',
                        queue_stage: 'Arrived',
                        invoice_id: 'invoice-1',
                        invoice_number: 'INV-001',
                        invoice_status: 'Partially Paid',
                        invoice_paid_amount: 100,
                        invoice_balance_amount: 250,
                        payment_exception_id: 'exception-1',
                        payment_exception_reason: 'private finance note',
                    }],
                })
                .mockResolvedValueOnce({ rows: [{ total: 1, by_stage: { Arrived: 1 } }] }),
        };
        const req = {
            query: {},
            user: { user_id: '11111111-1111-4111-8111-111111111111', role: 'Receptionist' },
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getQueue(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query.mock.calls[0][0]).toContain("p.name = 'VIEW_INVOICES'");
        const item = res.json.mock.calls[0][0].data[0];
        expect(item).toMatchObject({ exam_id: 'exam-1', queue_stage: 'Arrived' });
        expect(item).not.toHaveProperty('invoice_id');
        expect(item).not.toHaveProperty('invoice_balance_amount');
        expect(item).not.toHaveProperty('payment_exception_reason');
    });

    test('keeps financial fields for a role granted VIEW_INVOICES', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
                .mockResolvedValueOnce({
                    rows: [{
                        exam_id: 'exam-2',
                        appointment_id: 'appointment-2',
                        queue_stage: 'Payment Pending',
                        invoice_id: 'invoice-2',
                        invoice_balance_amount: 300,
                    }],
                })
                .mockResolvedValueOnce({ rows: [{ total: 1, by_stage: { 'Payment Pending': 1 } }] }),
        };
        const req = {
            query: {},
            user: { user_id: '22222222-2222-4222-8222-222222222222', role: 'Receptionist' },
        };
        const res = { json: jest.fn() };

        await getQueue(db)(req, res, jest.fn());

        expect(res.json.mock.calls[0][0].data[0]).toMatchObject({
            invoice_id: 'invoice-2',
            invoice_balance_amount: 300,
        });
    });
});
