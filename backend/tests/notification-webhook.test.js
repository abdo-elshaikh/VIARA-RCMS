const mockValidateRequest = jest.fn();
const mockTwilioFactory = jest.fn();
mockTwilioFactory.validateRequest = mockValidateRequest;

jest.mock('twilio', () => mockTwilioFactory);
jest.mock('../src/services/notificationService', () => ({
    notifyClients: jest.fn(),
    dispatch: jest.fn(),
    computeActionUrl: jest.fn(),
}));

const twilio = require('twilio');
const { verifyWebhookSignature, getExternalRequestUrl } = require('../src/middleware/webhookAuth');
const { applyTwilioDeliveryReceipt } = require('../src/controllers/notificationController');
const { notifyClients } = require('../src/services/notificationService');

describe('Twilio notification receipts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('verifies the exact external URL and parses the signed form body', async () => {
        mockValidateRequest.mockReturnValue(true);
        const pool = { query: jest.fn().mockResolvedValue({ rows: [{ api_secret: 'auth-token' }] }) };
        const req = {
            body: Buffer.from('MessageSid=SM123&MessageStatus=delivered'),
            rawBody: Buffer.from('MessageSid=SM123&MessageStatus=delivered'),
            originalUrl: '/api/webhooks/twilio',
            protocol: 'http',
            headers: {
                host: 'internal:3000',
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'api.example.test',
                'x-twilio-signature': 'signed-value',
            },
        };
        const next = jest.fn();

        await verifyWebhookSignature(pool, 'Twilio')(req, {}, next);

        expect(getExternalRequestUrl(req)).toBe('https://api.example.test/api/webhooks/twilio');
        expect(twilio.validateRequest).toHaveBeenCalledWith(
            'auth-token',
            'signed-value',
            'https://api.example.test/api/webhooks/twilio',
            { MessageSid: 'SM123', MessageStatus: 'delivered' }
        );
        expect(req.body).toEqual({ MessageSid: 'SM123', MessageStatus: 'delivered' });
        expect(next).toHaveBeenCalledWith();
    });

    test('updates notification and job atomically enough for realtime reconciliation', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ notification_id: 'notification-1' }], rowCount: 1 })
                .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
        };

        const result = await applyTwilioDeliveryReceipt(db, {
            MessageSid: 'SM123',
            MessageStatus: 'delivered',
        });

        expect(result).toEqual({ updated: 1, status: 'Delivered' });
        expect(db.query.mock.calls[0][1]).toEqual(['Delivered', 'SM123']);
        expect(db.query.mock.calls[1][0]).toContain("status NOT IN ('Cancelled', 'Skipped')");
        expect(notifyClients).toHaveBeenCalledWith(db, 'notification-1');
    });

    test('does not regress a confirmed delivery on a late failure receipt', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

        const result = await applyTwilioDeliveryReceipt(db, {
            MessageSid: 'SM123',
            MessageStatus: 'failed',
        });

        expect(result).toEqual({ updated: 0, status: 'Failed' });
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(notifyClients).not.toHaveBeenCalled();
    });
});
