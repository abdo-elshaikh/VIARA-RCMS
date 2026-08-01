const {
    calculateInvoiceTotals,
    invoiceDiscountComponents,
    moneyNumber,
    normalizeBusinessDate,
    postJournalBatch
} = require('../src/services/financialPostingService');

describe('financial posting rules', () => {
    test('keeps fixed and percentage discounts separate across edits', () => {
        const created = calculateInvoiceTotals([{ totalAmount: 1000 }], 100, 10, 14, 0);
        expect(created).toMatchObject({
            subtotal: 1000,
            fixedDiscount: 100,
            percentageDiscount: 100,
            discount: 200,
            tax: 112,
            total: 912
        });

        const stored = {
            subtotal_amount: created.subtotal,
            discount_amount: created.discount,
            discount_percentage: 10,
            fixed_discount_amount: created.fixedDiscount,
            percentage_discount_amount: created.percentageDiscount
        };
        const components = invoiceDiscountComponents(stored);
        const edited = calculateInvoiceTotals(
            [{ totalAmount: 1000 }],
            components.fixedDiscount,
            10,
            14,
            0
        );
        expect(edited.discount).toBe(200);
        expect(edited.total).toBe(912);
    });

    test('rounds monetary values once with decimal half-up semantics', () => {
        const totals = calculateInvoiceTotals([{ totalAmount: '10.005' }], 0, 0, 14, 0);
        expect(totals.subtotal).toBe(10.01);
        expect(totals.tax).toBe(1.4);
        expect(totals.total).toBe(11.41);
        expect(moneyNumber('1.005')).toBe(1.01);
    });

    test('normalizes PostgreSQL Date values without producing locale date strings', () => {
        const date = new Date(2026, 7, 1);
        expect(normalizeBusinessDate(date)).toBe('2026-08-01');
        expect(normalizeBusinessDate('2026-08-01T22:10:00.000Z')).toBe('2026-08-01');
        expect(() => normalizeBusinessDate('not-a-date')).toThrow('Invalid financial business date');
    });

    test('rejects unbalanced journal batches before any insert', async () => {
        const client = { query: jest.fn() };
        await expect(postJournalBatch(client, {
            sourceType: 'Test',
            sourceId: '00000000-0000-4000-8000-000000000099',
            businessDate: '2026-07-20',
            userId: null,
            entries: [
                { accountCode: '1000', accountName: 'Cash', debit: 100, credit: 0 },
                { accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 99 }
            ]
        })).rejects.toMatchObject({ statusCode: 500 });
        expect(client.query).not.toHaveBeenCalled();
    });
});
