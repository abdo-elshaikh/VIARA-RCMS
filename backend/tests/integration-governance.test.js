const mockStripeRetrieve = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({
    accounts: { retrieve: mockStripeRetrieve }
})));

const IntegrationService = require('../src/services/integrationService');
const { updateIntegrationSchema, exportAccountingQuerySchema } = require('../src/schemas/integrationSchema');

describe('integration governance', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStripeRetrieve.mockResolvedValue({ id: 'acct_test' });
    });

    test('performs a real Stripe account health probe with the stored API secret', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT * FROM integrations')) {
                    return { rows: [{ provider_name: 'Stripe', webhook_timeout_ms: 1000 }] };
                }
                if (text.includes('SELECT api_key FROM integrations')) return { rows: [{ api_key: null }] };
                if (text.includes('SELECT api_secret, webhook_secret')) {
                    return { rows: [{ api_secret: 'sk_test_viara', webhook_secret: 'whsec_test', secret_version: 2 }] };
                }
                return { rows: [] };
            })
        };

        const result = await new IntegrationService(db).testProviderConnection('Stripe');

        expect(result.status).toBe('HEALTHY');
        expect(mockStripeRetrieve).toHaveBeenCalledTimes(1);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('$2::boolean = FALSE'), ['Stripe', false]);
    });

    test('never automatically replays payment capture events', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{
                    log_id: 'payment-log-1', event_type: 'Payment Capture', status: 'Processing',
                    delivery_attempt: 1, max_retries: 3, payload: { invoice_id: 'invoice-1' }
                }] })
                .mockResolvedValue({ rows: [] })
        };

        await expect(new IntegrationService(db).retryEvent('payment-log-1'))
            .rejects.toThrow('manual reconciliation');

        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[1][0]).toContain("event_type IN ('Outbound SMS', 'Outbound WhatsApp')");
    });

    test('validates safe URLs, strict provider options, and accounting date order', () => {
        expect(updateIntegrationSchema.safeParse({ webhook_url: 'javascript:alert(1)' }).success).toBe(false);
        expect(updateIntegrationSchema.safeParse({ extra_config: { unknown_secret: 'value' } }).success).toBe(false);
        expect(updateIntegrationSchema.safeParse({
            webhook_url: 'https://orthanc.internal.example',
            config_version: 3,
            clear_fields: ['api_secret']
        }).success).toBe(true);
        expect(exportAccountingQuerySchema.safeParse({ startDate: '2026-08-30', endDate: '2026-08-01' }).success).toBe(false);
    });
});
