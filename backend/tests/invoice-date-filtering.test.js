const { getInvoices, getInvoiceSummary } = require('../src/controllers/invoiceController');

describe('invoice and summary date-scoping', () => {
    test('getInvoices filters by specified date', async () => {
        let executedSql = '';
        let executedParams = [];
        const db = {
            query: jest.fn(async (sql, params) => {
                executedSql = sql;
                executedParams = params;
                return { rows: [] };
            })
        };

        const req = {
            query: { date: '2026-09-02' }
        };
        const res = {
            json: jest.fn()
        };
        const next = jest.fn();

        await getInvoices(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith([]);
        expect(executedSql).toContain('i.service_date = $1::date');
        expect(executedSql).toContain('a.start_time::date = $1::date');
        expect(executedParams).toContain('2026-09-02');
    });

    test('getInvoiceSummary scopes summary metrics to specified date', async () => {
        let executedSql = '';
        let executedParams = [];
        const db = {
            query: jest.fn(async (sql, params) => {
                executedSql = sql;
                executedParams = params;
                return {
                    rows: [{
                        total_count: 5,
                        gross_billed: '3000',
                        collected: '2000',
                        outstanding: '1000',
                        discounts: '100',
                        open_count: 2,
                        paid_count: 3,
                        partial_count: 0,
                        pending_count: 2,
                        refunded_count: 0,
                        voided_count: 0
                    }]
                };
            })
        };

        const req = {
            query: { date: '2026-09-02' }
        };
        const res = {
            json: jest.fn()
        };
        const next = jest.fn();

        await getInvoiceSummary(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            total_count: 5,
            gross_billed: '3000',
            collected: '2000'
        }));
        expect(executedSql).toContain('LEFT JOIN appointments a ON i.appointment_id = a.appointment_id');
        expect(executedSql).toContain('i.service_date = $1::date');
        expect(executedParams).toEqual(['2026-09-02']);
    });
});
