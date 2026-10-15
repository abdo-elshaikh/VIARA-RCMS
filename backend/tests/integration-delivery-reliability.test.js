jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn(value => `enc:${value}`),
    decrypt: jest.fn(value => String(value || '').replace(/^enc:/, ''))
}));

jest.mock('../src/services/notificationJobService', () => ({
    scheduleJob: jest.fn().mockResolvedValue({ job_id: 'notification-job-1' })
}));

const IntegrationService = require('../src/services/integrationService');
const { processIntegrationQueue } = require('../src/jobs/integrationWorker');
const { scheduleJob } = require('../src/services/notificationJobService');

describe('integration delivery reliability', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('reconciles an idempotent log in place instead of inserting a duplicate row', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [{ log_id: 'log-1', status: 'Failed', deduped: false }]
            })
        };
        const service = new IntegrationService(db);

        const result = await service.logEvent(
            'integration-1',
            'Outbound SMS',
            { to_enc: 'enc:+201000000000', body_enc: 'enc:hello' },
            'Failed',
            { idempotencyKey: 'notification-job:job-1:SMS', deliveryAttempt: 2, maxRetries: 3 }
        );

        expect(result).toEqual({ logId: 'log-1', deduped: false });
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (idempotency_key)');
        expect(db.query.mock.calls[0][0]).toContain('delivery_attempt = GREATEST');
        expect(db.query.mock.calls[0][1][5]).toBe('notification-job:job-1:SMS');
    });

    test('decrypts WhatsApp retry payload and retains the original idempotency key', async () => {
        const db = {
            query: jest.fn().mockResolvedValueOnce({
                rows: [{
                    log_id: 'log-1',
                    event_type: 'Outbound WhatsApp',
                    status: 'Processing',
                    payload: { to_enc: 'enc:+201000000000', body_enc: 'enc:hello' },
                    idempotency_key: 'notification-job:job-1:WhatsApp',
                    delivery_attempt: 1,
                    max_retries: 3
                }]
            })
        };
        const service = new IntegrationService(db);
        service.sendWhatsApp = jest.fn().mockResolvedValue({ success: true, deduped: false });

        await service.retryEvent('log-1');

        expect(service.sendWhatsApp).toHaveBeenCalledWith('+201000000000', 'hello', expect.objectContaining({
            idempotencyKey: 'notification-job:job-1:WhatsApp',
            deliveryAttempt: 2,
            maxRetries: 3
        }));
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('worker honors next_retry_at and queues one explicit realtime-capable job per admin', async () => {
        const task = {
            log_id: 'log-1',
            integration_id: 'integration-1',
            event_type: 'Outbound SMS',
            retry_count: 2,
            max_retries: 3
        };
        const pool = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('RETURNING log_id, integration_id')) return { rows: [task] };
                if (text === 'SELECT status FROM integration_logs WHERE log_id = $1') return { rows: [{ status: 'DeadLetter' }] };
                if (text.includes('SELECT provider_name FROM integrations')) return { rows: [{ provider_name: 'Twilio' }] };
                if (text.includes("SELECT user_id, role FROM users")) {
                    return { rows: [{ user_id: 'admin-1', role: 'Admin' }, { user_id: 'admin-2', role: 'Admin' }] };
                }
                return { rows: [] };
            })
        };
        const service = {
            retryEvent: jest.fn().mockRejectedValue(new Error('provider timeout')),
            getDeadLetterEvents: jest.fn().mockResolvedValue([{ log_id: 'log-1' }])
        };

        const result = await processIntegrationQueue(pool, service);

        const claimSql = pool.query.mock.calls.find(([sql]) => String(sql).includes('RETURNING log_id, integration_id'))[0];
        expect(claimSql).toContain('(next_retry_at IS NULL OR next_retry_at <= NOW())');
        expect(result).toEqual({ processed: 1, deadLetters: 1 });
        expect(scheduleJob).toHaveBeenCalledTimes(2);
        expect(scheduleJob).toHaveBeenNthCalledWith(1, pool, expect.objectContaining({
            eventType: 'INTEGRATION_FAILED',
            channel: 'InApp',
            recipientType: 'Staff',
            recipientId: 'admin-1',
            idempotencyKey: 'integration-dead-letter:log-1:admin-1',
            priority: 'Critical',
            variables: expect.objectContaining({ force_delivery: true, role: 'Admin' })
        }));
    });
});
