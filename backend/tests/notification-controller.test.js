jest.mock('../src/services/notificationService', () => ({
    dispatch: jest.fn(),
    notifyClients: jest.fn(),
    computeActionUrl: jest.fn(item => item.action_url || null)
}));

const {
    getNotifications,
    getUnreadCount,
    markNotificationRead,
    getStaffPreferences,
    unsubscribe,
    handleTwilioWebhook
} = require('../src/controllers/notificationController');
const { notifyClients } = require('../src/services/notificationService');
const { createUnsubscribeToken } = require('../src/utils/notificationUnsubscribeToken');

const buildRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.sendStatus = jest.fn(() => res);
    return res;
};

describe('notification controller hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('searches decrypted notification rows and paginates matching results', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    {
                        notification_id: 'n-1',
                        recipient: 'patient@example.com',
                        subject: 'Urgent MRI reminder',
                        content: 'Arrive early',
                        status: 'Sent',
                        channel: 'Email',
                        event_type: 'AppointmentReminder',
                        patient_mrn: 'MRN-001',
                        is_read: false
                    },
                    {
                        notification_id: 'n-2',
                        recipient: 'other@example.com',
                        subject: 'Routine message',
                        content: 'No match',
                        status: 'Failed',
                        channel: 'SMS',
                        event_type: 'ManualSend',
                        patient_mrn: 'MRN-002',
                        is_read: true
                    }
                ]
            })
        };
        const req = {
            query: { q: 'urgent', limit: 10, offset: 0 },
            user: { user_id: 'user-1', role: 'Admin' }
        };
        const res = buildRes();
        const next = jest.fn();

        await getNotifications(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            total: 1,
            counts: expect.objectContaining({ all: 1, unread: 1, sent: 1, failed: 0 }),
            items: [expect.objectContaining({ notification_id: 'n-1' })]
        }));
    });

    test('marks one visible staff notification read without changing the global notification row', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [{ notification_id: 'n-1', is_read: true, read_at: '2026-07-30T00:00:00Z' }]
            })
        };
        const req = {
            params: { id: 'n-1' },
            user: { user_id: 'user-1', role: 'HR' }
        };
        const res = buildRes();

        await markNotificationRead(db)(req, res, jest.fn());

        expect(db.query.mock.calls[0][0]).toContain('INSERT INTO notification_reads');
        expect(db.query.mock.calls[0][0]).not.toContain('UPDATE notifications');
        expect(db.query.mock.calls[0][1]).toEqual(['user-1', 'n-1', 'user-1', 'HR']);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            notification: expect.objectContaining({ is_read: true })
        }));
    });

    test('unread count uses per-user receipts without a rolling time-window cutoff', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ unread_count: '7' }] })
        };
        const req = {
            user: { user_id: 'user-1', role: 'Admin' }
        };
        const res = buildRes();

        await getUnreadCount(db)(req, res, jest.fn());

        expect(db.query.mock.calls[0][0]).toContain('notification_reads');
        expect(db.query.mock.calls[0][0]).not.toMatch(/24\s+hours/i);
        expect(res.json).toHaveBeenCalledWith({ unreadCount: 7 });
    });

    test('unread count fails closed when read receipts migration is missing', async () => {
        const missingReadsError = new Error('relation "notification_reads" does not exist');
        missingReadsError.code = '42P01';
        const db = {
            query: jest.fn()
                .mockRejectedValueOnce(missingReadsError)
                .mockResolvedValueOnce({ rows: [{ unread_count: '3' }] })
        };
        const req = {
            user: { user_id: 'user-1', role: 'Admin' }
        };
        const res = buildRes();
        const next = jest.fn();

        await getUnreadCount(db)(req, res, next);

        expect(next).toHaveBeenCalledWith(missingReadsError);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(res.json).not.toHaveBeenCalled();
    });

    test('staff preference defaults match database defaults when no row exists', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = buildRes();

        await getStaffPreferences(db)(
            { user: { user_id: 'staff-1', role: 'Receptionist' } },
            res,
            jest.fn()
        );

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('staff_user_id = $1'), ['staff-1']);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            inapp_enabled: true,
            notify_security_event: true,
            notify_staff_lifecycle: true,
            notify_payment_update: true,
            quiet_hours_enabled: false,
            quiet_hours_start: 22,
            quiet_hours_end: 7
        }));
    });

    test('invalid unsubscribe token returns the generic response without querying patients', async () => {
        const db = { query: jest.fn() };
        const res = buildRes();
        const next = jest.fn();

        await unsubscribe(db)(
            { body: { email: 'patient@example.com', token: 'invalid-token-value-long-enough' } },
            res,
            next
        );

        expect(db.query).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            message: 'If the unsubscribe request was valid, marketing preferences have been updated.'
        });
    });

    test('valid unsubscribe is marketing-only and keeps the response enumeration resistant', async () => {
        const email = 'Patient@Example.com';
        const token = createUnsubscribeToken({ contact: email, channel: 'Email' });
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };
        const res = buildRes();
        const next = jest.fn();

        await unsubscribe(db)({ body: { email, token } }, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toContain('email_hash = $1');
        expect(db.query.mock.calls[0][0]).toContain('consent_marketing = FALSE');
        expect(db.query.mock.calls[0][0]).not.toContain('consent_email');
        expect(db.query.mock.calls[0][0]).toContain('notify_marketing');
        expect(db.query.mock.calls[0][0]).not.toContain('email_enabled');
        expect(res.json).toHaveBeenCalledWith({
            message: 'If the unsubscribe request was valid, marketing preferences have been updated.'
        });
    });

    test('valid unsubscribe for an unknown contact uses the same response and performs no writes', async () => {
        const phone = '+15555550123';
        const token = createUnsubscribeToken({ contact: phone, channel: 'SMS' });
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const res = buildRes();

        await unsubscribe(db)({ body: { phone, token } }, res, jest.fn());

        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toContain('phone_hash = $1');
        expect(res.json).toHaveBeenCalledWith({
            message: 'If the unsubscribe request was valid, marketing preferences have been updated.'
        });
    });

    test('Twilio webhook maps delivered receipts and notifies connected clients', async () => {
        const oldEnv = process.env.NODE_ENV;
        delete process.env.TWILIO_AUTH_TOKEN;
        delete process.env.TWILIO_TOKEN;
        process.env.NODE_ENV = 'test';

        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ notification_id: 'n-1' }] })
                .mockResolvedValueOnce({ rows: [] })
        };
        const req = {
            body: { MessageSid: 'SM123', MessageStatus: 'delivered' },
            get: jest.fn(),
            protocol: 'https',
            originalUrl: '/api/notifications/webhook/twilio'
        };
        const res = buildRes();

        await handleTwilioWebhook(db)(req, res);

        expect(db.query.mock.calls[0][0]).toContain('UPDATE notifications');
        expect(db.query.mock.calls[0][1]).toEqual(['Delivered', 'SM123']);
        expect(db.query.mock.calls[1][0]).toContain('UPDATE notification_jobs');
        expect(notifyClients).toHaveBeenCalledWith(db, 'n-1');
        expect(res.sendStatus).toHaveBeenCalledWith(204);

        if (oldEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = oldEnv;
        }
    });
});
