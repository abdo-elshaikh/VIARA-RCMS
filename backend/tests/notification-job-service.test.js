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

const {
    scheduleJob,
    processJobs,
    scheduleReminders,
    scheduleAppointmentReminder,
    cancelPendingAppointmentReminders,
    isQuietHours,
    dispatchWithFallback,
    triggerEvent,
    buildIdempotencyKey,
    processCriticalResultEscalations,
    getRepairableNotificationJobs,
    repairRetryableNotificationJobs,
    normalizeNotificationLanguage,
    isOptedIn
} = require('../src/services/notificationJobService');
const { encrypt } = require('../src/utils/crypto');
const { dispatch } = require('../src/services/notificationService');

describe('notification job service hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each([
        ['ar', 'ar'],
        ['ar-EG', 'ar'],
        ['Arabic', 'ar'],
        ['العربية', 'ar'],
        ['en-US', 'en'],
        ['English', 'en'],
        ['', 'en']
    ])('normalizes notification language %s to %s', (input, expected) => {
        expect(normalizeNotificationLanguage(input)).toBe(expected);
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

    test('redacts patient names before storing marketing queue payloads', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({ rows: [{ job_id: 'job-1' }] })
        };

        await scheduleJob(db, {
            eventType: 'MarketingCampaign',
            channel: 'Email',
            recipientType: 'Patient',
            recipientId: 'patient-1',
            entityType: 'Campaign',
            entityId: 'campaign-1',
            variables: { patient_name: 'Ali Hassan', campaign_message: 'Welcome to the clinic' },
            priority: 'Normal'
        });

        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][1][7]).toEqual(expect.objectContaining({
            patient_name: 'Patient',
            campaign_message: 'Welcome to the clinic'
        }));
    });

    test('marketing jobs honor the canonical consent and legacy opt-in fallback together', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ consent_email: true, consent_sms: true, consent_whatsapp: true, consent_marketing: null, opt_in_marketing: true }] })
                .mockResolvedValueOnce({ rows: [{ event_ok: true, channel_ok: true }] })
        };

        const result = await isOptedIn(db, {
            event_type: 'MarketingCampaign',
            channel: 'Email',
            recipient_type: 'Patient',
            recipient_id: 'patient-1'
        });

        expect(result).toBe(true);
        expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT consent_email, consent_sms, consent_whatsapp, consent_marketing, opt_in_marketing'), ['patient-1']);
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
        expect(updateCall[0]).toContain('status = $1::varchar');
        expect(updateCall[0]).not.toContain('$1::text');
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
                        start_time: '2099-07-31T10:00:00.000Z',
                        status: 'Confirmed',
                        exam_type_name: 'MRI Brain',
                        first_name_enc: 'v2:Ali',
                        last_name_enc: 'v2:Hassan'
                    }]
                })
                .mockResolvedValueOnce({
                    rows: [{ email_enabled: false, sms_enabled: true, whatsapp_enabled: true }]
                })
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                .mockResolvedValueOnce({ rows: [{ default_channels: ['Email', 'SMS'], default_priority: 'Action' }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ job_id: 'sms-job' }] })
                .mockResolvedValueOnce({ rows: [{ job_id: 'wa-job' }] })
        };

        await scheduleReminders(db);

        expect(db.query.mock.calls[0][0]).not.toContain('NOT EXISTS');
        const insertCalls = db.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notification_jobs'));
        expect(insertCalls.map(([, params]) => params[1])).toEqual(['SMS', 'WhatsApp']);
        expect(insertCalls[0][1][7]).toEqual(expect.objectContaining({
            patient_name: 'Ali Hassan',
            order_number: 'ORD-1',
            exam_type: 'MRI Brain'
        }));
        expect(insertCalls[1][1][9]).toBe('AppointmentReminder:WhatsApp:Patient:patient-1:Appointment:appt-1:2099-07-31T10:00:00.000Z');
        expect(insertCalls[0][1][7].occurrence_key).toBe('2099-07-31T10:00:00.000Z');
    });

    test('builds an idempotency key for dated operational events without inventing a UUID entity id', () => {
        expect(buildIdempotencyKey({
            eventType: 'SHIFT_CLOSED_WITH_PENDING_EXAMS',
            channel: 'InApp',
            recipientType: 'Staff',
            recipientId: 'staff-1',
            entityType: 'DailyEndOfDayReview',
            occurrenceKey: '2026-09-23'
        })).toBe('SHIFT_CLOSED_WITH_PENDING_EXAMS:InApp:Staff:staff-1:DailyEndOfDayReview:2026-09-23');
    });

    test('uses the same reminder occurrence key for creation and periodic scheduling', async () => {
        const appointment = {
            appointment_id: 'appt-1',
            patient_id: 'patient-1',
            order_number: 'ORD-1',
            start_time: '2099-08-01T10:00:00.000Z',
            status: 'Confirmed',
            exam_type_name: 'CT Chest',
            patient_name: 'Ali Hassan'
        };
        const db = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('FROM appointments a')) {
                    return { rows: [{ ...appointment, first_name_enc: 'v2:Ali', last_name_enc: 'v2:Hassan' }] };
                }
                if (text.includes('SELECT default_channels')) {
                    return { rows: [{ default_channels: ['Email', 'SMS'], default_priority: 'Action' }] };
                }
                if (text.includes("channel = 'InApp'")) {
                    return { rows: [] };
                }
                if (text.includes('FROM notification_preferences')) {
                    return { rows: [{ email_enabled: true, sms_enabled: true, whatsapp_enabled: false }] };
                }
                return { rows: [{ job_id: 'job-1' }] };
            })
        };

        await scheduleAppointmentReminder(db, appointment);
        await scheduleReminders(db);

        const jobCalls = db.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notification_jobs'));
        expect(jobCalls).toHaveLength(4);
        expect(jobCalls[0][1][9]).toBe(jobCalls[2][1][9]);
        expect(jobCalls[1][1][9]).toBe(jobCalls[3][1][9]);
        expect(jobCalls[0][1][7].occurrence_key).toBe('2099-08-01T10:00:00.000Z');
    });

    test('cancels pending reminders except the replacement occurrence', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ job_id: 'old-job' }], rowCount: 1 }) };

        const cancelled = await cancelPendingAppointmentReminders(db, 'appt-1', '2099-08-01T10:00:00.000Z');

        expect(cancelled).toBe(1);
        expect(db.query.mock.calls[0][0]).toContain("status = 'Pending'");
        expect(db.query.mock.calls[0][0]).toContain("variables->>'occurrence_key' IS DISTINCT FROM");
        expect(db.query.mock.calls[0][1]).toEqual(['appt-1', '2099-08-01T10:00:00.000Z']);
    });

    test('cancels a claimed reminder when appointment status or occurrence is stale', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({
                    rows: [{
                        job_id: 'job-1',
                        event_type: 'AppointmentReminder',
                        channel: 'SMS',
                        recipient_type: 'Patient',
                        recipient_id: 'patient-1',
                        entity_type: 'Appointment',
                        entity_id: 'appt-1',
                        variables: { occurrence_key: '2099-08-01T10:00:00.000Z' },
                        retry_count: 0,
                        max_retries: 2
                    }]
                })
                .mockResolvedValueOnce({ rows: [{ status: 'Cancelled', start_time: '2099-08-01T10:00:00.000Z' }] })
                .mockResolvedValueOnce({ rows: [] })
        };

        const result = await processJobs(db);

        expect(result).toEqual({ processed: 1, total: 1 });
        expect(dispatch).not.toHaveBeenCalled();
        expect(db.query.mock.calls[3][0]).toContain("SET status = 'Cancelled'");
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
            job_id: 'job-1',
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
        expect(dispatch.mock.calls[1][5].idempotencyKey).toBe('notification-job:job-1:SMS');
    });

    test('selects the Arabic template for language names and regional tags', async () => {
        const db = {
            query: jest.fn(async (sql, params = []) => {
                if (String(sql).includes('FROM users WHERE user_id')) {
                    return { rows: [{ user_id: 'user-1' }] };
                }
                if (String(sql).includes('FROM notification_templates')) {
                    expect(params[2]).toBe('ar');
                    return { rows: [{ subject: 'تم إنشاء الفحص', body: 'تم إنشاء الفحص {{order_number}}.' }] };
                }
                return { rows: [] };
            })
        };
        dispatch.mockResolvedValue({ success: true, notificationId: 'notification-ar' });

        const result = await dispatchWithFallback(db, {
            job_id: 'job-ar', event_type: 'ExamCreated', channel: 'InApp',
            priority: 'Normal', recipient_type: 'Staff', recipient_id: 'user-1',
            variables: { language: 'Arabic', order_number: 'ORD-42', force_delivery: true }
        }, [{ allowed_channels: ['InApp'], min_priority: 'Normal', inapp_enabled: true }]);

        expect(result.success).toBe(true);
        expect(dispatch.mock.calls[0].slice(0, 4)).toEqual([
            'InApp', 'user-1', 'تم إنشاء الفحص', 'تم إنشاء الفحص ORD-42.'
        ]);
    });

    test('uses the staff account language when an event has no explicit language', async () => {
        const db = {
            query: jest.fn(async (sql, params = []) => {
                const text = String(sql);
                if (text.includes('FROM users WHERE user_id')) {
                    return { rows: [{ user_id: 'user-ar' }] };
                }
                if (text.includes("preferences->>'language'")) {
                    expect(params).toEqual(['user-ar']);
                    return { rows: [{ language: 'ar-EG' }] };
                }
                if (text.includes('FROM notification_templates')) {
                    expect(params[2]).toBe('ar');
                    return { rows: [{ subject: 'تنبيه جديد', body: 'لديك تحديث.' }] };
                }
                return { rows: [] };
            })
        };
        dispatch.mockResolvedValue({ success: true, notificationId: 'notification-staff-ar' });

        const result = await dispatchWithFallback(db, {
            job_id: 'job-staff-ar', event_type: 'ExamCreated', channel: 'InApp',
            priority: 'Normal', recipient_type: 'Staff', recipient_id: 'user-ar',
            variables: { force_delivery: true }
        }, [{ allowed_channels: ['InApp'], min_priority: 'Normal', inapp_enabled: true }]);

        expect(result.success).toBe(true);
        expect(dispatch.mock.calls[0].slice(0, 4)).toEqual([
            'InApp', 'user-ar', 'تنبيه جديد', 'لديك تحديث.'
        ]);
    });

    test('uses a generic Arabic in-app message when a catalogued event has no template', async () => {
        const db = { query: jest.fn(async sql => {
            const text = String(sql);
            if (text.includes('FROM users WHERE user_id')) return { rows: [{ user_id: 'user-1' }] };
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ exists: 1 }] };
            return { rows: [] };
        }) };
        dispatch.mockResolvedValue({ success: true, notificationId: 'notification-1' });

        const result = await dispatchWithFallback(db, {
            job_id: 'job-generic', event_type: 'ExamCreated', channel: 'InApp',
            recipient_type: 'Staff', recipient_id: 'user-1', priority: 'Normal',
            variables: { force_delivery: true, language: 'ar-EG', patient_name: 'PRIVATE' }
        }, [{ allowed_channels: ['InApp'], min_priority: 'Normal', inapp_enabled: true }]);

        expect(result.success).toBe(true);
        expect(dispatch.mock.calls[0].slice(0, 4)).toEqual([
            'InApp', 'user-1', 'تحديث جديد', 'يوجد تحديث جديد يتطلب المراجعة داخل النظام.'
        ]);
        expect(dispatch.mock.calls[0][3]).not.toContain('PRIVATE');
    });

    test('does not invent an external message without a template or explicit body', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        const result = await dispatchWithFallback(db, {
            job_id: 'job-no-template', event_type: 'ManualSend', channel: 'Email',
            recipient_type: 'Custom', recipient_contact: 'test@example.com', variables: {}
        });
        expect(result.success).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });

    test('allows explicit external content without a database template', async () => {
        const db = { query: jest.fn() };
        dispatch.mockResolvedValue({ success: true });
        const result = await dispatchWithFallback(db, {
            job_id: 'job-explicit', event_type: 'ManualSend', channel: 'Email',
            recipient_type: 'Custom', recipient_contact: 'test@example.com',
            variables: { notification_subject: 'Hello', notification_body: 'Message' }
        });
        expect(result.success).toBe(true);
        expect(dispatch.mock.calls[0].slice(0, 4)).toEqual(['Email', 'test@example.com', 'Hello', 'Message']);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('uses catalog defaults and adds an available in-app portal channel', async () => {
        const insertedChannels = [];
        const db = {
            query: jest.fn(async (sql, params = []) => {
                const text = String(sql);
                if (text.includes('SELECT default_channels')) {
                    return { rows: [{ default_channels: ['Email'], default_priority: 'Action' }] };
                }
                if (text.includes("channel = 'InApp'")) return { rows: [{ exists: 1 }] };
                if (text.includes('INSERT INTO notification_jobs')) {
                    insertedChannels.push(params[1]);
                    expect(params[10]).toBe('Action');
                    return { rows: [{ job_id: `job-${insertedChannels.length}` }] };
                }
                return { rows: [] };
            })
        };

        await triggerEvent(db, 'PaymentDue', {
            patientId: 'patient-1',
            entityType: 'Invoice',
            entityId: 'invoice-1',
            variables: { invoice_number: 'INV-1', amount: '100' }
        });

        expect(insertedChannels).toEqual(['Email', 'InApp']);
    });

    test('enforces audience minimum priority before dispatching staff alerts', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{
            inapp_enabled: true,
            notify_queue_change: true,
            notify_backup_status: true,
            notify_payment_update: true
        }] }) };

        const result = await dispatchWithFallback(db, {
            job_id: 'job-low-priority',
            event_type: 'EquipmentDowntimeCreated',
            channel: 'InApp',
            priority: 'Normal',
            recipient_type: 'Staff',
            recipient_id: 'user-1',
            variables: { role: 'Admin' }
        }, [{
            allowed_channels: ['InApp'],
            min_priority: 'Action',
            inapp_enabled: true
        }]);

        expect(result).toEqual(expect.objectContaining({ success: false, skipped: true }));
        expect(dispatch).not.toHaveBeenCalled();
    });

    test('never lets force delivery bypass patient channel consent', async () => {
        const db = { query: jest.fn(async (sql) => {
            const text = String(sql);
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ category: 'Clinical' }] };
            if (text.includes('FROM patients')) return { rows: [{ consent_email: false, consent_sms: false, consent_whatsapp: false }] };
            return { rows: [] };
        }) };
        const result = await dispatchWithFallback(db, {
            job_id: 'patient-critical',
            event_type: 'ResultDelivered',
            channel: 'Email',
            priority: 'Critical',
            recipient_type: 'Patient',
            recipient_id: 'patient-1',
            variables: { force_delivery: true }
        }, []);

        expect(result.success).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });

    test('only dry-runs repairable jobs when event catalog and template contract are valid', async () => {
        const db = { query: jest.fn(async (sql, params = []) => {
            const text = String(sql);
            if (text.includes('FROM notification_jobs')) {
                return { rows: [
                    { job_id: 'job-safe', event_type: 'ExamCreated', channel: 'InApp', recipient_type: 'Staff', entity_id: 'exam-1', status: 'Failed', error_message: 'No active template for ExamCreated/InApp', retry_count: 0, max_retries: 3, variables: {} },
                    { job_id: 'job-unknown', event_type: 'GhostEvent', channel: 'InApp', status: 'DeadLetter', error_message: 'Unknown event', retry_count: 0, max_retries: 3, variables: {} }
                ] };
            }
            if (text.includes('FROM notification_event_catalog')) {
                const eventType = params[0];
                return eventType === 'GhostEvent' ? { rows: [] } : { rows: [{ required_variables: [], event_type: eventType }] };
            }
            if (text.includes('FROM notification_templates')) {
                const eventType = params[0];
                return eventType === 'ExamCreated' ? { rows: [{ template_id: 1, subject: 'New exam', body: 'Body' }] } : { rows: [] };
            }
            if (text.includes('FROM examinations')) return { rows: [{ status: 'Scheduled' }] };
            return { rows: [] };
        }) };

        const preview = await getRepairableNotificationJobs(db, { dryRun: true, limit: 20 });
        expect(preview.eligibleIds).toEqual(['job-safe']);
        expect(preview.eligible).toHaveLength(1);
        expect(preview.blocked).toHaveLength(1);

        const repair = await repairRetryableNotificationJobs(db, { dryRun: true, limit: 20 });
        expect(repair.requeued).toBe(1);
        expect(repair.skipped).toBe(1);
        expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE notification_jobs'))).toBe(false);
    });

    test('marks a failed staff in-app job repairable without a template', async () => {
        const db = { query: jest.fn(async sql => {
            const text = String(sql);
            if (text.includes('FROM notification_jobs')) return { rows: [{
                job_id: 'job-1', event_type: 'ExamCreated', channel: 'InApp',
                recipient_type: 'Staff', entity_id: 'exam-1', status: 'Failed', variables: {}
            }] };
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ required_variables: [] }] };
            if (text.includes('FROM examinations')) return { rows: [{ status: 'Scheduled' }] };
            return { rows: [] };
        }) };
        const preview = await getRepairableNotificationJobs(db);
        expect(preview.eligibleIds).toEqual(['job-1']);
        expect(preview.eligible[0].template.body).toBe('There is a new update to review in the system.');
    });

    test('keeps a stale appointment reminder out of the repair preview', async () => {
        const db = { query: jest.fn(async sql => {
            const text = String(sql);
            if (text.includes('FROM notification_jobs')) return { rows: [{
                job_id: 'old-reminder', event_type: 'AppointmentReminder',
                channel: 'Email', recipient_type: 'Patient',
                entity_type: 'Appointment', entity_id: 'appointment-1',
                status: 'Failed', variables: {
                    appointment_time: '2026-01-01', occurrence_key: '2026-01-01T10:00:00.000Z'
                }
            }] };
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ required_variables: ['appointment_time'] }] };
            if (text.includes('FROM notification_templates')) return { rows: [{ subject: 'Reminder', body: 'Your appointment is {{appointment_time}}' }] };
            if (text.includes('FROM appointments')) return { rows: [{ status: 'Scheduled', start_time: '2026-01-01T10:00:00.000Z' }] };
            return { rows: [] };
        }) };

        const preview = await getRepairableNotificationJobs(db);
        expect(preview.eligibleIds).toEqual([]);
        expect(preview.blocked[0].reason).toBe('Appointment reminder is stale or not due');
    });

    test('never requeues a batch without explicit job IDs', async () => {
        const db = { query: jest.fn() };
        await expect(repairRetryableNotificationJobs(db, { dryRun: false, limit: 200 }))
            .rejects.toThrow('Select 1 to 20 jobIds');
        expect(db.query).not.toHaveBeenCalled();
    });

    test('does not offer patient reminders for repair without channel consent', async () => {
        const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const db = { query: jest.fn(async sql => {
            const text = String(sql);
            if (text.includes('FROM notification_jobs')) return { rows: [{
                job_id: 'reminder-no-consent', event_type: 'AppointmentReminder',
                channel: 'SMS', recipient_type: 'Patient', recipient_id: 'patient-1',
                entity_type: 'Appointment', entity_id: 'appointment-1',
                status: 'Failed', variables: {
                    appointment_time: startTime, occurrence_key: startTime
                }
            }] };
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ required_variables: ['appointment_time'] }] };
            if (text.includes('FROM notification_templates')) return { rows: [{ subject: '', body: 'Appointment at {{appointment_time}}' }] };
            if (text.includes('FROM appointments')) return { rows: [{ status: 'Scheduled', start_time: startTime }] };
            if (text.includes('FROM patients')) return { rows: [{ consent_sms: false, consent_email: false, consent_whatsapp: false }] };
            return { rows: [] };
        }) };

        const preview = await getRepairableNotificationJobs(db);
        expect(preview.eligibleIds).toEqual([]);
        expect(preview.blocked[0].reason).toBe('Recipient consent or preference does not allow this channel');
    });

    test('blocks replay of a staff alert that has no entity or event details', async () => {
        const db = { query: jest.fn(async sql => {
            const text = String(sql);
            if (text.includes('FROM notification_jobs')) return { rows: [{
                job_id: 'contextless', event_type: 'ExamStatusChanged',
                channel: 'InApp', recipient_type: 'Staff', recipient_id: 'user-1',
                entity_id: null, status: 'DeadLetter', variables: { role: 'Radiologist', requested_channels: ['InApp'] }
            }] };
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ required_variables: [] }] };
            if (text.includes('FROM notification_templates')) return { rows: [{ subject: 'Exam update', body: 'Review exam' }] };
            return { rows: [] };
        }) };

        const preview = await getRepairableNotificationJobs(db);
        expect(preview.eligibleIds).toEqual([]);
        expect(preview.blocked[0].reason).toBe('Notification has no event context for replay');
    });

    test('does not replay a new-exam alert after the exam has progressed', async () => {
        const db = { query: jest.fn(async sql => {
            const text = String(sql);
            if (text.includes('FROM notification_jobs')) return { rows: [{
                job_id: 'old-exam', event_type: 'ExamCreated',
                channel: 'InApp', recipient_type: 'Staff', recipient_id: 'user-1',
                entity_type: 'Exam', entity_id: 'exam-1', status: 'DeadLetter', variables: { role: 'Radiologist' }
            }] };
            if (text.includes('FROM notification_event_catalog')) return { rows: [{ required_variables: [] }] };
            if (text.includes('FROM notification_templates')) return { rows: [{ subject: 'New exam', body: 'A new exam was created' }] };
            if (text.includes('FROM examinations')) return { rows: [{ status: 'Reporting' }] };
            return { rows: [] };
        }) };

        const preview = await getRepairableNotificationJobs(db);
        expect(preview.eligibleIds).toEqual([]);
        expect(preview.blocked[0].reason).toBe('Exam has moved beyond the notified state');
    });

    test('creates idempotent admin acknowledgement tasks before marking a critical escalation', async () => {
        const calls = [];
        const db = {
            query: jest.fn(async (sql, params = []) => {
                const text = String(sql);
                calls.push(text);
                if (text.includes("WHERE role = 'Admin'")) {
                    return { rows: [{ user_id: 'admin-1', role: 'Admin' }] };
                }
                if (text.includes('cra.referring_doctor_id IS NOT NULL')) {
                    return { rows: [{
                        acknowledgement_id: 'doctor-ack-1',
                        exam_id: 'exam-1',
                        acknowledgement_due_at: '2026-08-29T12:00:00.000Z'
                    }] };
                }
                if (text.includes('INSERT INTO critical_result_acknowledgements')) return { rows: [], rowCount: 1 };
                if (text.includes('SET escalated_at = NOW()')) return { rows: [{ acknowledgement_id: 'doctor-ack-1' }] };
                if (text.includes('SELECT cra.acknowledgement_id')) {
                    return { rows: [{
                        acknowledgement_id: 'admin-ack-1',
                        exam_id: 'exam-1',
                        recipient_user_id: 'admin-1',
                        referring_doctor_id: null,
                        recipient_role: 'Admin',
                        escalation_level: 1,
                        acknowledgement_due_at: '2026-08-29T12:15:00.000Z',
                        order_number: 'ORD-1',
                        critical_result_marked_at: '2026-08-29T11:45:00.000Z'
                    }] };
                }
                if (text.includes('SELECT default_channels')) {
                    return { rows: [{ default_channels: ['InApp'], default_priority: 'Critical' }] };
                }
                if (text.includes('FROM notification_audience_policies')) {
                    return { rows: [{ allowed_channels: ['InApp'], min_priority: 'Critical', inapp_enabled: true }] };
                }
                if (text.includes('INSERT INTO notification_jobs')) return { rows: [{ job_id: 'job-1' }] };
                return { rows: [] };
            })
        };

        const result = await processCriticalResultEscalations(db);

        expect(result).toEqual({ escalated: 1, reconciled: 1 });
        expect(calls.findIndex(text => text.includes('INSERT INTO critical_result_acknowledgements')))
            .toBeLessThan(calls.findIndex(text => text.includes('SET escalated_at = NOW()')));
        const jobCall = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notification_jobs'));
        expect(jobCall[1][9]).toBe('CriticalResultEscalated:InApp:Staff:admin-1:Exam:exam-1:admin-ack-1');
    });
});
