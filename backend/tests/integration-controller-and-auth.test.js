const mockStripeConstructEvent = jest.fn();
const mockStripeRetrieve = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({
    webhooks: { constructEvent: mockStripeConstructEvent },
    accounts: { retrieve: mockStripeRetrieve }
})));

jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn(val => `enc:${val}`),
    decrypt: jest.fn(val => String(val || '').replace(/^enc:/, ''))
}));

jest.mock('../src/services/auditService', () => ({
    logAction: jest.fn().mockResolvedValue({ audit_id: 'audit-1' })
}));

const {
    getIntegrations,
    updateIntegration,
    testIntegration,
    seedIntegrations,
    exportAccounting,
    getLogs,
    getDeadLetterEvents,
    retryDeadLetter
} = require('../src/controllers/integrationController');
const { verifyWebhookSignature, invalidateWebhookSecretCache } = require('../src/middleware/webhookAuth');
const { logAction } = require('../src/services/auditService');

describe('Integration Controller & Auth Middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;
    let mockDb;

    beforeEach(() => {
        jest.clearAllMocks();
        invalidateWebhookSecretCache();

        mockReq = {
            db: null,
            user: { user_id: 'user-admin-1', role: 'Admin' },
            body: {},
            params: {},
            query: {},
            ip: '127.0.0.1',
            get: jest.fn().mockReturnValue('jest-agent')
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn().mockReturnThis(),
            header: jest.fn().mockReturnThis(),
            attachment: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            write: jest.fn().mockReturnThis(),
            end: jest.fn().mockReturnThis()
        };

        mockNext = jest.fn();

        mockDb = {
            query: jest.fn()
        };
        mockReq.db = mockDb;
    });

    describe('getIntegrations', () => {
        test('masks credentials and returns metadata flags', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [
                    {
                        integration_id: 'int-1',
                        provider_name: 'Stripe',
                        type: 'Payment',
                        is_active: true,
                        has_api_key: false,
                        has_api_secret: true,
                        has_webhook_secret: true,
                        sender_identity: null,
                        extra_config: { environment: 'sandbox' },
                        secret_version: 2
                    },
                    {
                        integration_id: 'int-2',
                        provider_name: 'Twilio',
                        type: 'SMS',
                        is_active: true,
                        has_api_key: true,
                        has_api_secret: true,
                        has_webhook_secret: false,
                        sender_identity: '+123456789',
                        extra_config: {},
                        secret_version: 1
                    }
                ]
            });

            await getIntegrations(mockDb)(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledTimes(1);
            const responseData = mockRes.json.mock.calls[0][0];
            expect(responseData).toHaveLength(2);

            // Verify plaintext credentials are removed and flags are set
            expect(responseData[0].api_secret).toBeUndefined();
            expect(responseData[0].webhook_secret).toBeUndefined();
            expect(responseData[0].has_api_secret).toBe(true);
            expect(responseData[0].has_webhook_secret).toBe(true);
            expect(responseData[0].has_api_key).toBe(false);

            expect(responseData[1].has_api_key).toBe(true);
            expect(responseData[1].sender_identity).toBe('+123456789');
        });
    });

    describe('updateIntegration', () => {
        test('encrypts updated secrets, bumps version, and logs audit action', async () => {
            mockReq.params = { id: 'int-1' };
            mockReq.body = {
                api_secret: 'sk_live_new_secret',
                webhook_secret: 'whsec_new_signing_secret',
                sender_identity: '+1987654321',
                extra_config: { realm_id: 'realm123' },
                is_active: true,
                config_version: 1
            };

            // 1. Current config lookup
            mockDb.query
                .mockResolvedValueOnce({
                    rows: [{
                        integration_id: 'int-1',
                        provider_name: 'Stripe',
                        api_key: null,
                        api_secret: null,
                        webhook_secret: null,
                        webhook_url: null,
                        config_version: 1,
                        secret_version: 1,
                        is_active: false,
                        sender_identity: null,
                        extra_config: {}
                    }]
                })
                // 2. Update query
                .mockResolvedValueOnce({
                    rows: [{
                        integration_id: 'int-1',
                        provider_name: 'Stripe',
                        is_active: true,
                        sender_identity: '+1987654321',
                        config_version: 2,
                        secret_version: 2
                    }]
                });

            await updateIntegration(mockDb)(mockReq, mockRes, mockNext);

            expect(mockDb.query).toHaveBeenCalledTimes(2);
            const updateSqlCall = mockDb.query.mock.calls[1];
            expect(updateSqlCall[0]).toContain('UPDATE integrations');
            expect(updateSqlCall[0]).toContain('secret_version = CASE WHEN $13::boolean');
            expect(updateSqlCall[0]).toContain('last_rotated_at = CASE WHEN $13::boolean THEN CURRENT_TIMESTAMP');

            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                integration_id: 'int-1',
                provider_name: 'Stripe',
                config_version: 2
            }));

            expect(logAction).toHaveBeenCalledWith(
                mockDb,
                expect.objectContaining({
                    action: 'SECRET_ROTATED',
                    eventCode: 'INTEGRATION.SECRET_ROTATED',
                    resourceId: 'int-1',
                    details: expect.objectContaining({
                        provider: 'Stripe',
                        credentialFieldsChanged: expect.arrayContaining(['api_secret', 'webhook_secret'])
                    })
                })
            );
        });

        test('handles clear_fields for removing credentials', async () => {
            mockReq.params = { id: 'int-2' };
            mockReq.body = {
                clear_fields: ['api_key', 'api_secret'],
                is_active: false
            };

            mockDb.query
                .mockResolvedValueOnce({
                    rows: [{
                        integration_id: 'int-2',
                        provider_name: 'Twilio',
                        api_key: 'enc:AC123',
                        api_secret: 'enc:auth_token',
                        webhook_secret: null,
                        webhook_url: null,
                        sender_identity: '+123456789',
                        extra_config: {},
                        config_version: 2,
                        secret_version: 1,
                        is_active: true
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        integration_id: 'int-2',
                        provider_name: 'Twilio',
                        is_active: false
                    }]
                });

            await updateIntegration(mockDb)(mockReq, mockRes, mockNext);

            const updateParams = mockDb.query.mock.calls[1][1];
            expect(updateParams).toContain(null); // cleared api_key and api_secret
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                integration_id: 'int-2',
                provider_name: 'Twilio',
                is_active: false
            }));
        });
    });

    describe('seedIntegrations', () => {
        test('inserts missing providers idempotently', async () => {
            mockDb.query.mockResolvedValue({ rows: [{ count: '0' }] });

            await seedIntegrations(mockDb)(mockReq, mockRes, mockNext);

            expect(mockDb.query).toHaveBeenCalledTimes(6);
            expect(mockDb.query.mock.calls[1][0]).toContain('ON CONFLICT (provider_name) DO UPDATE SET');
            expect(mockDb.query.mock.calls[1][0]).toContain('health_status = CASE');
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Default integrations seeded successfully',
                seededCount: 5,
                previousCount: 0
            }));
        });
    });

    describe('testIntegration', () => {
        test('allows testing connection on inactive integration by passing false for requireActive', async () => {
            const mockClient = {
                query: jest.fn().mockResolvedValue({ rows: [] }),
                release: jest.fn()
            };
            mockDb.connect = jest.fn().mockResolvedValue(mockClient);
            mockDb.query
                .mockResolvedValueOnce({
                    rows: [{
                        integration_id: 'int-stripe',
                        provider_name: 'Stripe',
                        is_active: false,
                        webhook_timeout_ms: 2000
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        integration_id: 'int-stripe',
                        provider_name: 'Stripe',
                        type: 'Payment',
                        api_key: null,
                        api_secret: 'sk_test_123',
                        webhook_secret: 'whsec_123',
                        webhook_url: null,
                        sender_identity: null,
                        extra_config: {},
                        webhook_timeout_ms: 2000,
                        is_active: false,
                        secret_version: 1
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        api_key: null
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{
                        api_secret: 'sk_test_123',
                        webhook_secret: 'whsec_123',
                        secret_version: 1
                    }]
                });

            mockStripeRetrieve.mockResolvedValueOnce({ id: 'acct_123' });
            mockReq.params = { id: 'int-stripe' };

            await testIntegration(mockDb)(mockReq, mockRes, mockNext);

            expect(mockStripeRetrieve).toHaveBeenCalledTimes(1);
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'HEALTHY'
            }));
        });
    });

    describe('exportAccounting', () => {
        test('filters by startDate and endDate with ISO formatting', async () => {
            mockReq.query = {
                startDate: '2026-08-01',
                endDate: '2026-08-31'
            };

            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    invoice_id: 'inv-1',
                    patient_id: 'pat-1',
                    created_at: new Date('2026-08-15T10:00:00Z'),
                    total_amount: '150.00',
                    tax_amount: '15.00',
                    status: 'Paid'
                }]
            });

            await exportAccounting(mockDb)(mockReq, mockRes, mockNext);

            expect(mockDb.query).toHaveBeenCalledTimes(1);
            const sqlQuery = mockDb.query.mock.calls[0][0];
            const sqlParams = mockDb.query.mock.calls[0][1];

            expect(sqlQuery).toContain('i.created_at >= $1::timestamp');
            expect(sqlQuery).toContain("i.created_at < ($2::date + '1 day'::interval)");
            expect(sqlParams).toEqual(['2026-08-01', '2026-08-31']);
            expect(mockRes.header).toHaveBeenCalledWith('Content-Type', 'text/csv');
            expect(mockRes.attachment).toHaveBeenCalledWith(expect.stringMatching(/^accounting_fallback_export_.*\.csv$/));
            expect(mockRes.send).toHaveBeenCalled();
        });
    });

    describe('verifyWebhookSignature (Stripe whsec_...)', () => {
        test('verifies Stripe webhook using decrypted webhook_secret instead of api_secret', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    api_secret: 'sk_test_should_not_be_used_for_webhook',
                    webhook_secret: 'whsec_correct_signing_secret',
                    secret_version: 1,
                    last_rotated_at: null
                }]
            });

            mockStripeConstructEvent.mockReturnValueOnce({
                id: 'evt_stripe_1',
                type: 'payment_intent.succeeded',
                data: { object: { id: 'pi_1' } }
            });

            const stripeReq = {
                rawBody: Buffer.from('{"id":"evt_stripe_1"}'),
                body: Buffer.from('{"id":"evt_stripe_1"}'),
                headers: { 'stripe-signature': 't=123,v1=sig_stripe' }
            };

            const middleware = verifyWebhookSignature(mockDb, 'Stripe');
            await middleware(stripeReq, mockRes, mockNext);

            expect(mockDb.query).toHaveBeenCalledTimes(1);
            expect(mockStripeConstructEvent).toHaveBeenCalledWith(
                stripeReq.rawBody,
                't=123,v1=sig_stripe',
                'whsec_correct_signing_secret'
            );
            expect(mockNext).toHaveBeenCalledWith();
        });
    });
});
