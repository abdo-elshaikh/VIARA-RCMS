jest.mock('../src/services/notificationService', () => ({
    dispatch: jest.fn(),
    renderTemplate: jest.fn((text, variables = {}) =>
        String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
    )
}));

jest.mock('../src/utils/crypto', () => ({
    encrypt: jest.fn(value => `enc:${value}`),
    decrypt: jest.fn(value => String(value || '').replace(/^(enc:|v2:)/, ''))
}));

const { scheduleJob, processJobs, scheduleReminders, isQuietHours, dispatchWithFallback } = require('../src/services/notificationJobService');
const { encrypt } = require('../src/utils/crypto');
const { dispatch } = require('../src/services/notificationService');

describe('notification job service hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('schedules idempotent jobs with encrypted recipient contact', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ job_id: 'job-1' }] })
        };

        const job = await scheduleJob(db, {
            eventType: 'ManualSend',
            channel: 'SMS',
            recipientType: 'Custom',
            recipientContact: '+201000000000',
            entityType: 'Appointment',
            entityId: 'appt-1',
            variables: { patient_name: 'Patient' },
            priority: 'Action'
        });

        expect(job).toEqual({ job_id: 'job-1' });
        expect(encrypt).toHaveBeenCalledWith('+201000000000');
        expect(db.query.mock.calls[0][0]).toContain('recipient_contact_enc');
        expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (idempotency_key)');
        expect(db.query.mock.calls[0][1][4]).toBe('enc:+201000000000');
        expect(db.query.mock.calls[0][1][9]).toBe('ManualSend:SMS:Custom:+201000000000:Appointment:appt-1');
        expect(db.query.mock.calls[0][1][10]).toBe('Action');
    });

    test('counts claimed jobs and retries when contact resolution fails', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{
                        job_id: 'job-1',
                        event_type: 'SystemAlert',
                        channel: 'Email',
                        recipient_type: 'Custom',
                        recipient_id: null,
                        recipient_contact: null,
                        recipient_contact_enc: null,
                        entity_type: 'System',
                        entity_id: 'sys-1',
                        variables: {},
                        retry_count: 0,
                        max_retries: 2
                    }]
                })
                .mockResolvedValueOnce({ rows: [] })
        };

        const result = await processJobs(db);

        expect(result).toEqual({ processed: 1, total: 1 });
        const updateCall = db.query.mock.calls.find(([sql]) => sql.includes('retry_count = retry_count'));
        expect(updateCall[1]).toEqual(['Pending', null, 'No Email contact found for recipient', 'job-1', 5]);
    });

    test('schedules reminder channels through idempotency and includes patient name variables', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({
                    rows: [{
                        appointment_id: 'appt-1',
                        patient_id: 'patient-1',
                        referring_doctor_id: null,
                        order_number: 'ORD-1',
                        start_time: '2026-07-31T10:00:00.000Z',
                        status: 'Confirmed',
                        exam_type_name: 'MRI Brain',
                        first_name_enc: 'v2:Ali',
                        last_name_enc: 'v2:Hassan'
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{ email_enabled: false, sms_enabled: true, whatsapp_enabled: true }]
                })
                .mockResolvedValueOnce({ rows: [{ job_id: 'sms-job' }] })
                .mockResolvedValueOnce({ rows: [{ job_id: 'wa-job' }] })
        };

        await scheduleReminders(db);

        expect(db.query.mock.calls[0][0]).not.toContain('NOT EXISTS');
        expect(db.query.mock.calls[2][1][1]).toBe('SMS');
        expect(db.query.mock.calls[3][1][1]).toBe('WhatsApp');
        expect(db.query.mock.calls[2][1][7]).toEqual(expect.objectContaining({
            patient_name: 'Ali Hassan',
            order_number: 'ORD-1',
            exam_type: 'MRI Brain'
        }));
        expect(db.query.mock.calls[3][1][9]).toBe('AppointmentReminder:WhatsApp:Patient:patient-1:Appointment:appt-1:2026-07-31T10:00:00.000Z');
    });

    test('handles overnight quiet hours with an exclusive end boundary', () => {
        const prefs = { quiet_hours_enabled: true, quiet_hours_start: 22, quiet_hours_end: 7 };
        expect(isQuietHours(prefs, new Date(2026, 0, 1, 23, 0))).toBe(true);
        expect(isQuietHours(prefs, new Date(2026, 0, 2, 6, 59))).toBe(true);
        expect(isQuietHours(prefs, new Date(2026, 0, 2, 7, 0))).toBe(false);
        expect(isQuietHours(prefs, new Date(2026, 0, 2, 12, 0))).toBe(false);
    });

    test('resolves contact and template independently for each fallback channel', async () => {
        const db = {
            query: jest.fn(async (sql, params = []) => {
                const text = String(sql);
                if (text.includes('consent_email')) return { rows: [{ consent_email: true, consent_sms: true, consent_whatsapp: true, consent_marketing: true }] };
                if (text.includes('AS event_ok')) return { rows: [{ event_ok: true, channel_ok: true }] };
                if (text.includes('SELECT email_enc, phone_enc FROM patients')) return { rows: [{ email_enc: 'v2:patient@example.com', phone_enc: 'v2:+201000000000' }] };
                if (text.includes('FROM notification_templates')) return { rows: [{ subject: `${params[1]} subject`, body: `${params[1]} body` }] };
                return { rows: [] };
            })
        };
        dispatch
            .mockResolvedValueOnce({ success: false, error: 'Email provider failed' })
            .mockResolvedValueOnce({ success: true, notificationId: 'notification-2' });

        const result = await dispatchWithFallback(db, {
            event_type: 'AppointmentReminder',
            channel: 'Email',
            priority: 'Action',
            recipient_type: 'Patient',
            recipient_id: 'patient-1',
            entity_type: 'Appointment',
            entity_id: 'appointment-1',
            variables: {},
        });

        expect(result).toEqual(expect.objectContaining({ success: true, channel: 'SMS' }));
        expect(dispatch.mock.calls[0].slice(0, 4)).toEqual(['Email', 'patient@example.com', 'Email subject', 'Email body']);
        expect(dispatch.mock.calls[1].slice(0, 4)).toEqual(['SMS', '+201000000000', 'SMS subject', 'SMS body']);
    });
});
