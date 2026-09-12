const mockConstructEvent = jest.fn();
const mockValidateRequest = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({ webhooks: { constructEvent: mockConstructEvent } })));
jest.mock('twilio', () => ({ validateRequest: mockValidateRequest }));

const { verifyWebhookSignature, invalidateWebhookSecretCache } = require('../src/middleware/webhookAuth');

const makePool = () => ({
    query: jest.fn().mockResolvedValue({
        rows: [{ api_secret: 'sk_test', webhook_secret: 'whsec_test', secret_version: 1, last_rotated_at: null }]
    })
});

const makeReq = () => ({
    rawBody: Buffer.from('{"id":"evt_1"}'),
    body: Buffer.from('{"id":"evt_1"}'),
    headers: { 'stripe-signature': 'sig' }
});

describe('integration webhook signature cache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        invalidateWebhookSecretCache();
        mockConstructEvent.mockReturnValue({ id: 'evt_1', type: 'payment_intent.succeeded', data: {} });
        mockValidateRequest.mockReturnValue(true);
    });

    test('caches the provider secret across repeated verifications', async () => {
        const pool = makePool();
        const mw = verifyWebhookSignature(pool, 'Stripe');
        const next = jest.fn();

        await mw(makeReq(), {}, next);
        await mw(makeReq(), {}, next);

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledTimes(2);
    });

    test('invalidateWebhookSecretCache(provider) forces a fresh secret lookup', async () => {
        const pool = makePool();
        const mw = verifyWebhookSignature(pool, 'Stripe');
        const next = jest.fn();

        await mw(makeReq(), {}, next);
        expect(pool.query).toHaveBeenCalledTimes(1);

        invalidateWebhookSecretCache('Stripe');

        await mw(makeReq(), {}, next);
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenLastCalledWith();
    });

    test('invalidateWebhookSecretCache() with no argument clears all providers', async () => {
        const pool = makePool();
        const mw = verifyWebhookSignature(pool, 'Stripe');
        const next = jest.fn();

        await mw(makeReq(), {}, next);
        expect(pool.query).toHaveBeenCalledTimes(1);

        invalidateWebhookSecretCache();

        await mw(makeReq(), {}, next);
        expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('verifies WhatsApp callbacks against the WhatsApp provider secret', async () => {
        const pool = makePool();
        const req = {
            rawBody: Buffer.from('MessageSid=SM1&MessageStatus=delivered'),
            body: Buffer.from('MessageSid=SM1&MessageStatus=delivered'),
            headers: { 'x-twilio-signature': 'signature', host: 'api.example.test' },
            protocol: 'https',
            originalUrl: '/api/webhooks/whatsapp'
        };
        const next = jest.fn();

        await verifyWebhookSignature(pool, 'WhatsApp')(req, {}, next);

        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('provider_name = $1'), ['WhatsApp']);
        expect(mockValidateRequest).toHaveBeenCalledWith(
            'sk_test',
            'signature',
            'https://api.example.test/api/webhooks/whatsapp',
            { MessageSid: 'SM1', MessageStatus: 'delivered' }
        );
        expect(req.body).toEqual({ MessageSid: 'SM1', MessageStatus: 'delivered' });
        expect(next).toHaveBeenCalledWith();
    });
});
