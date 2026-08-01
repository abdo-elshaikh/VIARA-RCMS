/**
 * notificationJobService.js
 * Database-driven notification job scheduler and processor.
 * No external queue dependency — uses polling against notification_jobs table.
 */
const { dispatch, renderTemplate } = require('./notificationService');
const { decrypt, encrypt } = require('../utils/crypto');

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const decryptStored = value => {
    if (!value) return null;
    if (!String(value).startsWith('v2:') && !/^[0-9a-f]+:[0-9a-f]+$/i.test(value)) return value;
    return decrypt(value);
};

const buildIdempotencyKey = (opts) => {
    if (opts.idempotencyKey) return opts.idempotencyKey;
    if (!opts.entityType || !opts.entityId || !opts.eventType || !opts.channel || !opts.recipientType) return null;
    const recipient = opts.recipientId || opts.recipientContact || 'custom';
    return [opts.eventType, opts.channel, opts.recipientType, recipient, opts.entityType, opts.entityId].join(':');
};

// ─── Schedule a job ───────────────────────────────────────────────────────────

/**
 * Insert a notification job into the queue.
 * @param {object} db - pg pool
 * @param {object} opts
 * @param {string} opts.eventType
 * @param {string} opts.channel - 'Email' | 'SMS' | 'WhatsApp'
 * @param {string} opts.recipientType - 'Patient' | 'Doctor' | 'Staff' | 'Custom'
 * @param {string} [opts.recipientId] - UUID of patient or doctor
 * @param {string} [opts.recipientContact] - override email/phone
 * @param {string} [opts.entityType] - e.g. 'Appointment', 'Exam'
 * @param {string} [opts.entityId] - UUID
 * @param {object} [opts.variables] - template variables
 * @param {Date|string} [opts.scheduledFor] - when to send (default: NOW)
 */
const scheduleJob = async (db, opts) => {
    try {
        const idempotencyKey = buildIdempotencyKey(opts);
        const result = await db.query(`
            INSERT INTO notification_jobs (
                event_type, channel, recipient_type, recipient_id,
                recipient_contact, recipient_contact_enc, entity_type, entity_id, variables,
                scheduled_for, idempotency_key, priority
            )
            VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
            DO UPDATE SET
                scheduled_for = LEAST(notification_jobs.scheduled_for, EXCLUDED.scheduled_for),
                variables = notification_jobs.variables || EXCLUDED.variables,
                status = CASE WHEN notification_jobs.status = 'Failed' THEN 'Pending' ELSE notification_jobs.status END,
                next_retry_at = NULL
            RETURNING *
        `, [
            opts.eventType,
            opts.channel,
            opts.recipientType,
            opts.recipientId || null,
            opts.recipientContact ? encrypt(opts.recipientContact) : null,
            opts.entityType || null,
            opts.entityId || null,
            opts.variables || {},
            opts.scheduledFor || new Date(),
            idempotencyKey,
            opts.priority || 'Normal'
        ]);
        return result.rows[0];
    } catch (err) {
        console.error('[NotificationJobService] scheduleJob error:', err.message);
        if (opts.throwOnError) throw err;
        return null;
    }
};

// ─── Resolve recipient contact ─────────────────────────────────────────────────

const resolveContact = async (db, job) => {
    // If a custom contact is provided, use it directly
    if (job.recipient_contact_enc) return decryptStored(job.recipient_contact_enc);
    if (job.recipient_contact) return job.recipient_contact;

    if (job.recipient_type === 'Patient' && job.recipient_id) {
        const result = await db.query(
            'SELECT email_enc, phone_enc FROM patients WHERE patient_id = $1',
            [job.recipient_id]
        );
        const p = result.rows[0];
        if (!p) return null;
        return job.channel === 'Email' ? decryptStored(p.email_enc) : decryptStored(p.phone_enc);
    }

    if (job.recipient_type === 'Doctor' && job.recipient_id) {
        const result = await db.query(
            'SELECT email, phone FROM referring_doctors WHERE doctor_id = $1',
            [job.recipient_id]
        );
        const d = result.rows[0];
        if (!d) return null;
        return job.channel === 'Email' ? d.email : d.phone;
    }

    return null;
};

// ─── Check notification preferences ───────────────────────────────────────────

const EVENT_PREF_COLUMN = {
    AppointmentCreated:    'notify_appointment_created',
    AppointmentReminder:   'notify_appointment_reminder',
    AppointmentRescheduled:'notify_appointment_rescheduled',
    AppointmentCancelled:  'notify_appointment_cancelled',
    PrepInstructions:      'notify_prep_instructions',
    PaymentDue:            'notify_payment_due',
    ReportReady:           'notify_report_ready',
    ResultDelivered:       'notify_result_delivered',
    FollowUpReminder:      'notify_followup_reminder',
    MarketingCampaign:     'notify_marketing',
};

const CHANNEL_PREF_COLUMN = {
    Email:    'email_enabled',
    SMS:      'sms_enabled',
    WhatsApp: 'whatsapp_enabled',
};

const isOptedIn = async (db, job) => {
    const eventCol = EVENT_PREF_COLUMN[job.event_type];
    const channelCol = CHANNEL_PREF_COLUMN[job.channel];

    if (!eventCol || !channelCol) return true; // unknown event — allow by default

    const patientId = job.recipient_type === 'Patient' ? job.recipient_id : null;
    const doctorId = job.recipient_type === 'Doctor' ? job.recipient_id : null;

    if (!patientId && !doctorId) return true;

    if (patientId) {
        const consentResult = await db.query(`
            SELECT consent_email, consent_sms, consent_whatsapp, consent_marketing
            FROM patients
            WHERE patient_id = $1
        `, [patientId]);
        const consent = consentResult.rows[0];
        if (!consent) return false;

        const channelConsent = {
            Email: consent.consent_email,
            SMS: consent.consent_sms,
            WhatsApp: consent.consent_whatsapp
        }[job.channel];

        if (!channelConsent) return false;
        if (job.event_type === 'MarketingCampaign' && !consent.consent_marketing) return false;
    }

    const result = await db.query(`
        SELECT ${eventCol} AS event_ok, ${channelCol} AS channel_ok
        FROM notification_preferences
        WHERE ($1::uuid IS NULL OR patient_id = $1)
          AND ($2::uuid IS NULL OR doctor_id = $2)
        LIMIT 1
    `, [patientId, doctorId]);

    if (result.rows.length === 0) {
        return job.event_type !== 'FollowUpReminder';
    }
    const { event_ok, channel_ok } = result.rows[0];
    return event_ok && channel_ok;
};

const updateCampaignRecipient = async (db, job, status, updates = {}) => {
    if (job.event_type !== 'MarketingCampaign' || job.entity_type !== 'Campaign' || !job.entity_id || !job.recipient_id) return;

    await db.query(`
        UPDATE marketing_campaign_recipients
        SET status = $1,
            notification_id = COALESCE($2, notification_id),
            failure_reason = $3,
            sent_at = CASE WHEN $1 = 'Sent' THEN NOW() ELSE sent_at END,
            updated_at = NOW()
        WHERE campaign_id = $4
          AND patient_id = $5
          AND channel = $6
    `, [
        status,
        updates.notificationId || null,
        updates.failureReason || null,
        job.entity_id,
        job.recipient_id,
        job.channel
    ]);
};

// ─── Resolve template ─────────────────────────────────────────────────────────

/**
 * Resolve a template with graceful language fallback:
 *   requested language → English → any active template for the event/channel.
 * Prevents silent "no template" job failures when a template exists but only
 * in a different language than requested.
 */
const resolveTemplate = async (db, eventType, channel, language = 'en') => {
    const preferred = await db.query(`
        SELECT subject, body, language FROM notification_templates
        WHERE event_type = $1 AND channel = $2 AND is_active = TRUE
          AND language IN ($3, 'en')
        ORDER BY (language = $3) DESC
        LIMIT 1
    `, [eventType, channel, language]);
    if (preferred.rows[0]) return preferred.rows[0];

    // Last resort: any active template for this event/channel, regardless of language.
    const anyLang = await db.query(`
        SELECT subject, body, language FROM notification_templates
        WHERE event_type = $1 AND channel = $2 AND is_active = TRUE
        ORDER BY (language = 'en') DESC
        LIMIT 1
    `, [eventType, channel]);
    return anyLang.rows[0] || null;
};

// ─── Process pending jobs ─────────────────────────────────────────────────────

const processJobs = async (db) => {
    const BATCH = 20;
    let processed = 0;

    // Recover work abandoned by a crashed worker before claiming a new batch.
    await db.query(`
        UPDATE notification_jobs
        SET status = 'Pending',
            scheduled_for = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            next_retry_at = NULL,
            error_message = COALESCE(error_message, 'Recovered stale processing job')
        WHERE status = 'Processing'
          AND COALESCE(locked_at, scheduled_for) < NOW() - INTERVAL '15 minutes'
    `);

    // Claim a batch of due pending jobs atomically
    const claimedResult = await db.query(`
        UPDATE notification_jobs
        SET status = 'Processing',
            locked_at = NOW(),
            locked_by = $2
        WHERE job_id IN (
            SELECT job_id FROM notification_jobs
            WHERE status = 'Pending'
              AND scheduled_for <= NOW()
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            ORDER BY scheduled_for ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `, [BATCH, WORKER_ID]);

    const jobs = claimedResult.rows;

    for (const job of jobs) {
        try {
            // 1. Check opt-in preferences
            const allowed = await isOptedIn(db, job);
            if (!allowed) {
                await db.query(
                    `UPDATE notification_jobs
                     SET status = $1, processed_at = NOW(), locked_at = NULL, locked_by = NULL
                     WHERE job_id = $2`,
                    ['Skipped', job.job_id]
                );
                await updateCampaignRecipient(db, job, 'Skipped', { failureReason: 'Recipient is not opted in for this campaign/channel' });
                processed++;
                continue;
            }

            // 2. Resolve recipient contact
            const contact = await resolveContact(db, job);
            if (!contact) {
                await db.query(
                    `UPDATE notification_jobs
                     SET status = $1, processed_at = NOW(), error_message = $2,
                         locked_at = NULL, locked_by = NULL
                     WHERE job_id = $3`,
                    ['Failed', 'No contact found for recipient', job.job_id]
                );
                await updateCampaignRecipient(db, job, 'Failed', { failureReason: 'No contact found for recipient' });
                processed++;
                continue;
            }

            // 3. Resolve template (honor recipient language when provided)
            const language = job.variables?.language || 'en';
            const template = await resolveTemplate(db, job.event_type, job.channel, language);
            if (!template) {
                await db.query(
                    `UPDATE notification_jobs
                     SET status = $1, processed_at = NOW(), error_message = $2,
                         locked_at = NULL, locked_by = NULL
                     WHERE job_id = $3`,
                    ['Failed', `No active template for ${job.event_type}/${job.channel}`, job.job_id]
                );
                await updateCampaignRecipient(db, job, 'Failed', { failureReason: `No active template for ${job.event_type}/${job.channel}` });
                processed++;
                continue;
            }

            // 4. Dispatch
            const renderedSubject = job.event_type === 'MarketingCampaign' && job.variables?.campaign_subject
                ? job.variables.campaign_subject
                : renderTemplate(template.subject || '', job.variables);
            const result = await dispatch(
                job.channel, contact,
                renderedSubject,
                renderTemplate(template.body, job.variables),
                db,
                {
                    eventType: job.event_type,
                    entityId: job.entity_id,
                    patientId: job.recipient_type === 'Patient' ? job.recipient_id : null,
                    doctorId: job.recipient_type === 'Doctor' ? job.recipient_id : null,
                    audienceType: job.recipient_type === 'Patient' ? 'Patient' : job.recipient_type === 'Doctor' ? 'Doctor' : 'Staff',
                    priority: job.priority || 'Normal',
                    variables: job.variables
                }
            );

            const canRetry = !result.success && job.retry_count < job.max_retries;
            const finalStatus = result.success ? 'Sent' : canRetry ? 'Pending' : 'Failed';
            const retryDelayMinutes = Math.min(60, 5 * Math.pow(2, job.retry_count || 0));
            await db.query(`
                UPDATE notification_jobs
                SET status = $1,
                    processed_at = CASE WHEN $1 = 'Pending' THEN NULL ELSE NOW() END,
                    notification_id = $2,
                    error_message = $3,
                    retry_count = retry_count + CASE WHEN $1 = 'Sent' THEN 0 ELSE 1 END,
                    next_retry_at = CASE WHEN $1 = 'Pending' THEN NOW() + ($5::int * INTERVAL '1 minute') ELSE NULL END,
                    locked_at = NULL,
                    locked_by = NULL
                WHERE job_id = $4
            `, [finalStatus, result.notificationId || null, result.error || null, job.job_id, retryDelayMinutes]);

            await updateCampaignRecipient(db, job, finalStatus === 'Pending' ? 'Queued' : finalStatus, {
                notificationId: result.notificationId,
                failureReason: finalStatus === 'Failed' ? result.error : null
            });

            processed++;
        } catch (err) {
            const canRetry = job.retry_count < job.max_retries;
            await db.query(`
                UPDATE notification_jobs
                SET status = $1,
                    retry_count = retry_count + 1,
                    error_message = $2,
                    next_retry_at = NOW() + ($4::int * INTERVAL '1 minute'),
                    processed_at = CASE WHEN $1 = 'Pending' THEN NULL ELSE NOW() END,
                    locked_at = NULL,
                    locked_by = NULL
                WHERE job_id = $3
            `, [canRetry ? 'Pending' : 'Failed', err.message, job.job_id, Math.min(60, 5 * Math.pow(2, job.retry_count || 0))]);
            await updateCampaignRecipient(db, job, canRetry ? 'Queued' : 'Failed', { failureReason: err.message });
            processed++;
        }
    }

    return { processed, total: jobs.length };
};

// ─── triggerEvent: the single entry point called by controllers ────────────────

/**
 * Schedule notification jobs for an event across relevant channels.
 * Always fire-and-forget (errors are logged, not thrown).
 *
 * @param {object} db
 * @param {string} eventType  e.g. 'AppointmentCreated'
 * @param {object} payload    { patientId, doctorId, entityType, entityId, variables, channels }
 */
const triggerEvent = async (db, eventType, payload = {}) => {
    try {
        const {
            patientId,
            doctorId,
            entityType,
            entityId,
            variables = {},
            channels = ['Email', 'SMS'],
            scheduledFor,
            priority = 'Normal'
        } = payload;

        const jobs = [];

        for (const channel of channels) {
            if (patientId) {
                jobs.push({
                    eventType,
                    channel,
                    recipientType: 'Patient',
                    recipientId: patientId,
                    entityType,
                    entityId,
                    variables,
                    scheduledFor,
                    priority
                });
            }
        }

        if (doctorId) {
            // Respect doctor channel preferences; fall back to Email-only when no prefs row exists.
            const prefResult = await db.query(`
                SELECT email_enabled, sms_enabled, whatsapp_enabled
                FROM notification_preferences WHERE doctor_id = $1 LIMIT 1
            `, [doctorId]);
            const pref = prefResult.rows[0];
            const doctorChannels = pref
                ? ['Email', 'SMS', 'WhatsApp'].filter(ch => pref[CHANNEL_PREF_COLUMN[ch]])
                : ['Email'];
            for (const channel of doctorChannels) {
                jobs.push({
                    eventType, channel,
                    recipientType: 'Doctor', recipientId: doctorId,
                    entityType, entityId, variables, scheduledFor, priority
                });
            }
        }

        for (const job of jobs) {
            await scheduleJob(db, job);
        }
    } catch (err) {
        console.error(`[NotificationJobService] triggerEvent(${eventType}) error:`, err.message);
    }
};

// ─── Start in-process polling ──────────────────────────────────────────────────

let pollingInterval = null;
let reminderInterval = null;

const startPolling = (db, intervalMs = 60000) => {
    if (pollingInterval) return; // already running
    console.log(`[NotificationJobService] Starting job polling every ${intervalMs / 1000}s`);
    pollingInterval = setInterval(async () => {
        try {
            const result = await processJobs(db);
            if (result.total > 0) {
                console.log(`[NotificationJobService] Processed ${result.processed}/${result.total} jobs`);
            }
        } catch (err) {
            console.error('[NotificationJobService] Polling error:', err.message);
        }
    }, intervalMs);

    // Start 24-hour appointment reminder scheduling (runs every 15 minutes)
    startReminderScheduler(db);
};

const stopPolling = () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
    }
};

// ─── 24-hour appointment reminder scheduler ──────────────────────────────────

/**
 * Finds appointments in the next 23–25 hour window that haven't had a reminder
 * job created yet, and schedules AppointmentReminder notifications for them.
 * Runs every 15 minutes to avoid duplicates via the SKIP check.
 */
const scheduleReminders = async (db) => {
    try {
        // Find appointments between 23 and 25 hours from now that are confirmed/scheduled
        const result = await db.query(`
            SELECT a.appointment_id, a.patient_id, a.referring_doctor_id,
                   a.order_number, a.start_time, a.status,
                   et.name AS exam_type_name,
                   p.first_name_enc, p.last_name_enc
            FROM appointments a
            JOIN patients p ON p.patient_id = a.patient_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            WHERE a.status IN ('Scheduled', 'Confirmed')
              AND a.start_time > NOW() + INTERVAL '23 hours'
              AND a.start_time <= NOW() + INTERVAL '25 hours'
        `);

        let scheduled = 0;
        for (const appt of result.rows) {
            const apptTime = new Date(appt.start_time).toLocaleString();
            const patientName = [
                decryptStored(appt.first_name_enc),
                decryptStored(appt.last_name_enc)
            ].filter(Boolean).join(' ');
            const prefResult = await db.query(`
                SELECT email_enabled, sms_enabled, whatsapp_enabled
                FROM notification_preferences
                WHERE patient_id = $1
                LIMIT 1
            `, [appt.patient_id]);
            const pref = prefResult.rows[0];
            const channels = pref
                ? ['Email', 'SMS', 'WhatsApp'].filter(channel => pref[CHANNEL_PREF_COLUMN[channel]])
                : ['Email', 'SMS'];

            for (const channel of channels) {
                await scheduleJob(db, {
                    eventType: 'AppointmentReminder',
                    channel,
                    recipientType: 'Patient',
                    recipientId: appt.patient_id,
                    entityType: 'Appointment',
                    entityId: appt.appointment_id,
                    variables: {
                        patient_name: patientName,
                        order_number: appt.order_number || '',
                        appointment_time: apptTime,
                        exam_type: appt.exam_type_name || ''
                    },
                    scheduledFor: new Date()
                });
            }
            scheduled++;
        }

        if (scheduled > 0) {
            console.log(`[NotificationJobService] Scheduled ${scheduled} appointment reminder(s)`);
        }
    } catch (err) {
        console.error('[NotificationJobService] scheduleReminders error:', err.message);
    }
};

const startReminderScheduler = (db) => {
    if (reminderInterval) return;
    const REMINDER_CHECK_MS = 15 * 60 * 1000; // every 15 minutes
    console.log('[NotificationJobService] Starting 24h appointment reminder scheduler (15-min interval)');
    // Run once immediately on startup
    scheduleReminders(db);
    reminderInterval = setInterval(() => scheduleReminders(db), REMINDER_CHECK_MS);
};

module.exports = { scheduleJob, processJobs, triggerEvent, startPolling, stopPolling, scheduleReminders };
