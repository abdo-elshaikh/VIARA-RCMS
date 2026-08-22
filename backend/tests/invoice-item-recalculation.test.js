const { getInvoices, recalculateInvoiceAfterItemChange } = require('../src/controllers/invoiceController');

describe('invoice line-item financial recalculation', () => {
    test('reapplies discounts, tax and insurance and posts a ledger adjustment', async () => {
        const invoiceId = '00000000-0000-4000-8000-000000000201';
        const userId = '00000000-0000-4000-8000-000000000202';
        const calls = [];
        const client = {
            query: jest.fn(async (sql, params = []) => {
                const text = String(sql);
                calls.push({ text, params });
                if (text.includes('SELECT *') && text.includes('FROM invoices')) {
                    return { rows: [{
                        invoice_id: invoiceId,
                        invoice_number: 'INV-201',
                        invoice_status: 'Pending',
                        patient_id: '00000000-0000-4000-8000-000000000203',
                        subtotal_amount: '100.00',
                        discount_amount: '20.00',
                        fixed_discount_amount: '10.00',
                        percentage_discount_amount: '10.00',
                        discount_percentage: '10.00',
                        tax_rate: '14.00',
                        tax_amount: '11.20',
                        total_amount: '91.20',
                        insurance_covered_amount: '20.00',
                        patient_payable_amount: '71.20',
                        business_date: '2026-08-20',
                        branch_id: '00000000-0000-4000-8000-000000000001',
                        currency_code: 'EGP'
                    }] };
                }
                if (text.includes('SUM(total_amount)')) return { rows: [{ subtotal_amount: '120.00' }] };
                if (text.includes('FROM referring_doctors')) return { rows: [] };
                if (text.includes('SET subtotal_amount = $1')) return { rows: [{ invoice_id: invoiceId }] };
                if (text.includes('SELECT batch_id FROM journal_batches')) return { rows: [{ batch_id: 'batch-existing' }] };
                if (text.includes('WITH totals AS')) {
                    return { rows: [{ patient_payable_amount: '91.72', paid_amount: '0', refunded_amount: '0', credited_amount: '0' }] };
                }
                if (text.includes('SET invoice_status = $1')) return { rows: [{ invoice_id: invoiceId, invoice_status: 'Pending' }] };
                return { rows: [] };
            })
        };

        await recalculateInvoiceAfterItemChange(client, invoiceId, userId);

        const totalsUpdate = calls.find(({ text }) => text.includes('SET subtotal_amount = $1'));
        expect(totalsUpdate.params.slice(0, 8)).toEqual([
            120, 22, 10, 12, 13.72, 111.72, 20, 91.72
        ]);
        expect(calls.some(({ text, params }) => (
            text.includes('SELECT batch_id FROM journal_batches')
            && String(params[0]).startsWith('InvoiceAdjustment:')
        ))).toBe(true);
    });
});

describe('invoice list pagination', () => {
    test('returns authoritative server pagination metadata for open invoices', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [{
                    invoice_id: '00000000-0000-4000-8000-000000000301',
                    invoice_number: 'INV-301',
                    first_name_enc: null,
                    last_name_enc: null,
                    filtered_count: 37,
                    patient_payable_amount: '100.00',
                    paid_amount: '20.00',
                    balance_amount: '80.00'
                }]
            })
        };
        const req = {
            query: {
                openOnly: true,
                includeMeta: true,
                sortBy: 'balance',
                sortDirection: 'desc',
                limit: 20,
                offset: 20
            }
        };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getInvoices(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query.mock.calls[0][0]).toContain("HAVING i.invoice_status <> 'Voided'");
        expect(db.query.mock.calls[0][0]).toContain('ORDER BY balance_amount DESC');
        expect(res.json).toHaveBeenCalledWith({
            items: [expect.objectContaining({ invoice_id: '00000000-0000-4000-8000-000000000301' })],
            meta: { total: 37, limit: 20, offset: 20 }
        });
    });
});
