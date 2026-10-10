const { getMyInvoices } = require('../src/controllers/portalController');

describe('Patient Portal Invoices & CRM Verification', () => {
    test('getMyInvoices requires invoice ownership and consistent linked patients', async () => {
        const mockRows = [
            {
                invoice_id: 'inv-001',
                invoice_number: 'INV-2026-001',
                invoice_status: 'Paid',
                total_amount: 1500,
                patient_payable_amount: 1500,
                paid_amount: 1500,
                refunded_amount: 0,
                credited_amount: 0,
                balance_amount: 0,
                order_number: 'ORD-LIVE-0001',
                exam_type_name: 'Chest CT High Resolution (HRCT)'
            }
        ];

        const mockDb = {
            query: jest.fn().mockResolvedValue({ rows: mockRows })
        };

        const req = {
            user: { userId: 'b7d4b2e0-0000-0000-0000-000000000001', role: 'Patient' }
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getMyInvoices(mockDb)(req, res, next);

        expect(mockDb.query).toHaveBeenCalled();
        const sql = mockDb.query.mock.calls[0][0];
        const params = mockDb.query.mock.calls[0][1];

        // Conflicting linked patient identities must never broaden invoice ownership.
        expect(sql).toContain('LEFT JOIN appointments a');
        expect(sql).toContain('LEFT JOIN examinations e');
        expect(sql).toContain('i.patient_id = $1::uuid');
        expect(sql).toContain('(a.patient_id IS NULL OR a.patient_id = $1::uuid)');
        expect(sql).toContain('(e.patient_id IS NULL OR e.patient_id = $1::uuid)');
        expect(sql).toContain("i.invoice_status != 'Voided'");
        expect(params).toEqual([req.user.userId]);

        expect(res.json).toHaveBeenCalledWith(mockRows);
        expect(next).not.toHaveBeenCalled();
    });

    test('getMyInvoices handles database error cleanly via next(error)', async () => {
        const error = new Error('Database connection failed');
        const mockDb = {
            query: jest.fn().mockRejectedValue(error)
        };

        const req = { user: { userId: 'patient-123' } };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getMyInvoices(mockDb)(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(res.json).not.toHaveBeenCalled();
    });
});
