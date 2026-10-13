const { lookupCaseReport } = require('../src/controllers/examController');

describe('case report QR lookup', () => {
    test('extracts the order number from a portal login QR URL with an MRN', async () => {
        const orderNumber = 'ORD-20261003-ABC123';
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const req = {
        branchContext: { branchId: '00000000-0000-4000-8000-000000000001' },
        headers: {},
            query: {
                code: `https://portal.viara-health.com/patient/login?mrn=MRN-1&orderNumber=${orderNumber}`
            },
            user: { role: 'Developer', user_id: 'user-1' }
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await lookupCaseReport(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, values] = db.query.mock.calls[0];
        expect(sql).toContain('pay.receipt_number = $2 OR i.invoice_number = $2 OR e.order_number = $2');
        expect(values).toEqual(['00000000-0000-4000-8000-000000000001', orderNumber, 1, 0]);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ items: [], limit: 1, offset: 0 }));
    });

    test('rejects legacy patient-login QR codes that do not identify a report', async () => {
        const db = { query: jest.fn() };
        const req = {
        branchContext: { branchId: '00000000-0000-4000-8000-000000000001' },
        headers: {},
            query: { code: 'https://portal.viara-health.com/patient/login?mrn=MRN-1' },
            user: { role: 'Developer', user_id: 'user-1' }
        };
        const next = jest.fn();

        await lookupCaseReport(db)(req, { json: jest.fn() }, next);

        expect(db.query).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0].message).toContain('does not contain a report reference');
    });
});
