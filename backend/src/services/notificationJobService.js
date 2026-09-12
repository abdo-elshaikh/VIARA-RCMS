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

const FALLBACK_CHAINS = {
    Critical: ['InApp', 'Email', 'SMS'],
    Action:   ['Email', 'SMS', 'WhatsApp'],
    Warning:  ['Email'],
    Normal:   ['Email']
};

const PRIORITY_RANK = { Normal: 0, Action: 1, Warning: 2, Critical: 3 };

const buildIdempotencyKey = (opts) => {
    if (opts.idempotencyKey) return opts.idempotencyKey;
    if (!opts.entityType || !opts.entityId || !opts.eventType || !opts.channel || !opts.recipientType) return null;
    const recipient = opts.recipientId || opts.recipientContact || 'custom';
    const occurrence = opts.occurrenceKey || opts.variables?.occurrence_key || null;
    return [opts.eventType, opts.channel, opts.recipientType, recipient, opts.entityType, opts.entityId, occurrence]
        .filter(value => value !== null && value !== undefined && value !== '')
        .join(':');
};

const getAppointmentOccurrenceKey = startTime => {
    if (!startTime) return null;
    const parsed = new Date(startTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const cancelPendingAppointmentReminders = async (db, appointmentId, exceptOccurrenceKey = null) => {
    const result = await db.query(`
        UPDATE notification_jobs
        SET status = 'Cancelled',
            processed_at = NOW(),
            next_retry_at = NULL,
            locked_at = NULL,
            locked_by = NULL,
            error_message = 'Appointment reminder superseded or cancelled'
        WHERE event_type = 'AppointmentReminder'
          AND entity_type = 'Appointment'
          AND entity_id = $1
          AND status = 'Pending'
          AND ($2::text IS NULL OR variables->>'occurrence_key' IS DISTINCT FROM $2::text)
        RETURNING job_id
    `, [appointmentId, exceptOccurrenceKey]);
    return result.rowCount ?? result.rows?.length ?? 0;
};

const scheduleAppointmentReminder = async (db, appointment, options = {}) => {
    const occurrenceKey = getAppointmentOccurrenceKey(appointment.start_time || appointment.startTime);
    if (!occurrenceKey || new Date(occurrenceKey) <= new Date()) return null;

    const reminderTime = new Date(new Date(occurrenceKey).getTime() - 24 * 60 * 60 * 1000);
    await cancelPendingAppointmentReminders(
        db,
        appointment.appointment_id || appointment.appointmentId,
        occurrenceKey
    );
    return triggerEvent(db, 'AppointmentReminder', {
        patientId: appointment.patient_id || appointment.patientId,
        entityType: 'Appointment',
        entityId: appointment.appointment_id || appointment.appointmentId,
        scheduledFor: options.scheduledFor || (reminderTime > new Date() ? reminderTime : new Date()),
        channels: options.channels || ['Email', 'SMS'],
        occurrenceKey,
        variables: {
            patient_name: appointment.patient_name || appointment.patientName || appointment.order_number || '',
            order_number: appointment.order_number || appointment.orderNumber || '',
            appointment_time: new Date(occurrenceKey).toLocaleString(),
            exam_type: appointment.exam_type_name || appointment.examTypeName || '',
            prep_instructions: appointment.preparation_instructions || appointment.prepInstructions || '',
            language: appointment.preferred_language || appointment.language || 'en'
        }
    });
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
                scheduled_for = CASE
                    WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN EXCLUDED.scheduled_for
                    ELSE notification_jobs.scheduled_for
                END,
                variables = notification_jobs.variables || EXCLUDED.variables,
                status = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN 'Pending' ELSE notification_jobs.status END,
                retry_count = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN 0 ELSE notification_jobs.retry_count END,
                processed_at = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN NULL ELSE notification_jobs.processed_at END,
                error_message = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN NULL ELSE notification_jobs.error_message END,
                locked_at = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN NULL ELSE notification_jobs.locked_at END,
                locked_by = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN NULL ELSE notification_jobs.locked_by END,
                next_retry_at = CASE WHEN notification_jobs.status IN ('Failed', 'Cancelled') THEN NULL ELSE notification_jobs.next_retry_at END
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
        if (opts.bestEffort === true) return null;
        throw err;
    }
};

// ─── Resolve recipient contact ─────────────────────────────────────────────────

const resolveContact = async (db, job, channel = job.channel) => {
    // If a custom contact is provided, use it directly
    if (job.recipient_contact_enc) return decryptStored(job.recipient_contact_enc);
    if (job.recipient_contact) return job.recipient_contact;

    // In-app delivery uses the recipient identity as an internal address and
    // does not require an email address or phone number.
    if (channel === 'InApp' && job.recipient_id) return String(job.recipient_id);

    if (job.recipient_type === 'Patient' && job.recipient_id) {
        const result = await db.query(
            'SELECT email_enc, phone_enc FROM patients WHERE patient_id = $1',
            [job.recipient_id]
        );
        const p = result.rows[0];
        if (!p) return null;
        return channel === 'Email' ? decryptStored(p.email_enc) : decryptStored(p.phone_enc);
    }

    if (job.recipient_type === 'Doctor' && job.recipient_id) {
        const result = await db.query(
            'SELECT email, phone FROM referring_doctors WHERE doctor_id = $1',
            [job.recipient_id]
        );
        const d = result.rows[0];
        if (!d) return null;
        return channel === 'Email' ? d.email : d.phone;
    }

    if (job.recipient_type === 'Staff' && job.recipient_id) {
        const result = await db.query(
            'SELECT email, phone FROM users WHERE user_id = $1 AND is_active = TRUE',
            [job.recipient_id]
        );
        const user = result.rows[0];
        if (!user) return null;
        return channel === 'Email' ? user.email : user.phone;
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
    InApp:    'inapp_enabled',
};

const isOptedIn = async (db, job) => {
    const eventCol = EVENT_PREF_COLUMN[job.event_type];
    const channelCol = CHANNEL_PREF_COLUMN[job.channel];

    const patientId = job.recipient_type === 'Patient' ? job.recipient_id : null;
    const doctorId = job.recipient_type === 'Doctor' ? job.recipient_id : null;

    if (!patientId && !doctorId) return true;
    if (!channelCol) return false;

    if (!eventCol) {
        const catalog = await db.query(
            'SELECT 1 FROM notification_event_catalog WHERE event_type = $1 LIMIT 1',
            [job.event_type]
        );
        if (catalog.rows.length === 0) return false;
    }

    if (patientId) {
        const consentResult = await db.query(`
            SELECT consent_email, consent_sms, consent_whatsapp, consent_marketing
            FROM patients
            WHERE patient_id = $1
        `, [patientId]);
        const consent = consentResult.rows[0];
        if (!consent) return false;

        if (job.channel !== 'InApp') {
            const channelConsent = {
                Email: consent.consent_email,
                SMS: consent.consent_sms,
                WhatsApp: consent.consent_whatsapp
            }[job.channel];
            if (!channelConsent) return false;
        }
        if (job.event_type === 'MarketingCampaign' && !consent.consent_marketing) return false;
    }

    const preferenceColumns = eventCol
        ? `${eventCol} AS event_ok, ${channelCol} AS channel_ok`
        : `TRUE AS event_ok, ${channelCol} AS channel_ok`;
    const result = patientId
        ? await db.query(`SELECT ${preferenceColumns} FROM notification_preferences WHERE patient_id = $1::uuid LIMIT 1`, [patientId])
        : await db.query(`SELECT ${preferenceColumns} FROM notification_preferences WHERE doctor_id = $1::uuid LIMIT 1`, [doctorId]);

    if (result.rows.length === 0) {
        return job.event_type !== 'FollowUpReminder';
    }
    const { event_ok, channel_ok } = result.rows[0];
    return event_ok && channel_ok;
};

// ─── Audience policy resolution ────────────────────────────────────────────────

const resolveAudiencePolicies = async (db, eventType, role) => {
    const result = await db.query(`
        SELECT event_type, event_category, role, allowed_channels, min_priority,
               inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled
        FROM notification_audience_policies
        WHERE (event_type = $1 OR event_category = (
            SELECT category FROM notification_event_catalog WHERE event_type = $1
        ))
          AND role = $2
        ORDER BY min_priority DESC
    `, [eventType, role]);
    return result.rows;
};

// ─── Staff notification preferences ───────────────────────────────────────────

const EVENT_SPECIFIC_PREF = {
    STAFF_CREATED: 'notify_staff_lifecycle',
    STAFF_UPDATED: 'notify_staff_lifecycle',
    STAFF_DEACTIVATED: 'notify_staff_lifecycle',
    STAFF_PASSWORD_RESET: 'notify_staff_lifecycle',
    ROLE_ASSIGNED: 'notify_staff_lifecycle',
    PACS_CONFIG_UPDATED: 'notify_pacs_alert',
    PACS_DEVICE_UNREACHABLE: 'notify_pacs_alert',
    PACS_STUDY_MISMATCH: 'notify_pacs_alert',
    CHAT_MESSAGE_RECEIVED: 'notify_chat_message',
    ChatMessageReceived: 'notify_chat_message',
    CHAT_DIRECT_MESSAGE: 'notify_chat_message',
    INVENTORY_LOW_STOCK: 'notify_inventory_expiry',
    LowStock: 'notify_inventory_expiry',
    INVENTORY_EXPIRY_WARNING: 'notify_inventory_expiry',
    ItemExpired: 'notify_inventory_expiry',
    INSURANCE_CLAIM_SUBMITTED: 'notify_claim_update',
    ClaimSubmitted: 'notify_claim_update',
    INSURANCE_CLAIM_APPROVED: 'notify_claim_update',
    ClaimApproved: 'notify_claim_update',
    INSURANCE_CLAIM_REJECTED: 'notify_claim_update',
    ClaimRejected: 'notify_claim_update',
    ClaimPaid: 'notify_claim_update',
};

const isStaffOptedIn = async (db, job) => {
    if (job.recipient_type !== 'Staff' || !job.recipient_id) return true;

    const result = await db.query(`
        SELECT notify_security_event, notify_staff_lifecycle, notify_order_events,
               notify_queue_change, notify_pacs_alert, notify_backup_status,
               notify_privacy_request, notify_chat_message, notify_inventory_expiry,
               notify_claim_update, notify_payment_update, inapp_enabled,
               email_enabled, sms_enabled, whatsapp_enabled,
               quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone
        FROM notification_preferences
        WHERE staff_user_id = $1
        LIMIT 1
    `, [job.recipient_id]);

    if (result.rows.length === 0) return true;

    const prefs = result.rows[0];

    // 1. Check specific event preference first if matched
    const specificPrefKey = EVENT_SPECIFIC_PREF[job.event_type];
    if (specificPrefKey && prefs[specificPrefKey] === false) {
        return false;
    }

    // 2. Check general category preference
    const categoryMap = {
        Security: 'notify_security_event',
        Clinical: 'notify_order_events',
        Financial: 'notify_payment_update',
        Operational: 'notify_queue_change',
        Patient: 'notify_privacy_request',
        System: 'notify_backup_status'
    };

    const catalogResult = await db.query(`
        SELECT category FROM notification_event_catalog WHERE event_type = $1
    `, [job.event_type]);
    const category = catalogResult.rows[0]?.category || 'Operational';
    const prefKey = categoryMap[category];

    if (prefKey && prefs[prefKey] === false) return false;

    const channelPreference = CHANNEL_PREF_COLUMN[job.channel];
    if (channelPreference && prefs[channelPreference] === false) return false;
    return true;
};

const getQuietHoursPrefs = async (db, job) => {
    if (job.recipient_type === 'Staff' && job.recipient_id) {
        const result = await db.query(`
            SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone
            FROM notification_preferences
            WHERE staff_user_id = $1
            LIMIT 1
        `, [job.recipient_id]);
        return result.rows[0] || {};
    }

    if (job.recipient_type === 'Patient' && job.recipient_id) {
        const result = await db.query(`
            SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone
            FROM notification_preferences
            WHERE patient_id = $1
            LIMIT 1
        `, [job.recipient_id]);
        return result.rows[0] || {};
    }

    if (job.recipient_type === 'Doctor' && job.recipient_id) {
        const result = await db.query(`
            SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end, time_zone
            FROM notification_preferences
            WHERE doctor_id = $1
            LIMIT 1
        `, [job.recipient_id]);
        return result.rows[0] || {};
    }

    return {};
};

// ─── Quiet hours ──────────────────────────────────────────────────────────────

const normalizeQuietHour = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
};

const getZonedHour = (date, timeZone = 'Africa/Cairo') => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            hour12: false
        });
        const hourStr = formatter.format(date);
        const parsed = Number.parseInt(hourStr, 10);
        return Number.isInteger(parsed) ? parsed : date.getHours();
    } catch {
        return date.getHours();
    }
};

const isQuietHours = (prefs = {}, now = new Date(), timeZone = 'Africa/Cairo') => {
    if (!prefs.quiet_hours_enabled) return false;
    const hour = getZonedHour(now, prefs.time_zone || timeZone);
    const start = normalizeQuietHour(prefs.quiet_hours_start, 22);
    const end = normalizeQuietHour(prefs.quiet_hours_end, 7);
    if (start === end) return true;
    if (start < end) return hour >= start && hour < end;
    return hour >= start || hour < end;
};

const resolveDeliveryTime = (job, prefs = {}, timeZone = 'Africa/Cairo') => {
    const zone = prefs.time_zone || timeZone;
    if (isQuietHours(prefs, new Date(), zone) && job.priority !== 'Critical') {
        const end = normalizeQuietHour(prefs.quiet_hours_end, 7);
        const now = new Date();
        for (let minutes = 1; minutes <= 48 * 60; minutes += 1) {
            const candidate = new Date(now.getTime() + minutes * 60 * 1000);
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: zone,
                hour: 'numeric',
                minute: 'numeric',
                hourCycle: 'h23'
            }).formatToParts(candidate);
            const hour = Number(parts.find(part => part.type === 'hour')?.value);
            const minute = Number(parts.find(part => part.type === 'minute')?.value);
            if (hour === end && minute === 0) return candidate;
        }
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
    return job.scheduled_for || new Date();
};

// ─── Channel fallback dispatcher ──────────────────────────────────────────────

const dispatchWithFallback = async (db, job, policies = []) => {
    const configuredChain = FALLBACK_CHAINS[job.priority] || FALLBACK_CHAINS.Normal;
    const independentlyScheduledChannels = new Set(job.variables?.requested_channels || []);
    const chain = job.recipient_type === 'Custom'
        ? [job.channel]
        : [...new Set([job.channel, ...configuredChain])]
            .filter(channel => channel === job.channel || !independentlyScheduledChannels.has(channel));
    let lastError = null;
    let eligibleChannelFound = false;

    const policyFlagByChannel = {
        InApp: 'inapp_enabled',
        Email: 'email_enabled',
        SMS: 'sms_enabled',
        WhatsApp: 'whatsapp_enabled'
    };

    for (const channel of chain) {
        if (job.recipient_type === 'Staff') {
            const policyFlag = policyFlagByChannel[channel];
            const allowed = policies.length === 0
                ? channel === 'InApp'
                : policies.some(policy => (
                    policy.allowed_channels?.includes(channel)
                    && (!policyFlag || policy[policyFlag] !== false)
                    && (PRIORITY_RANK[job.priority] ?? 0) >= (PRIORITY_RANK[policy.min_priority] ?? 0)
                ));
            if (!allowed) continue;
        }

        const attemptedJob = { ...job, channel };
        // Mandatory staff/doctor alerts may bypass a user preference, but a
        // patient contact-consent decision is a legal boundary and is never
        // bypassed by an event payload flag.
        const optedIn = job.recipient_type === 'Patient'
            ? await isOptedIn(db, attemptedJob)
            : job.variables?.force_delivery === true
                ? true
                : job.recipient_type === 'Staff'
                    ? await isStaffOptedIn(db, attemptedJob)
                    : await isOptedIn(db, attemptedJob);
        if (!optedIn) {
            lastError = `Recipient is not opted in for ${channel}`;
            continue;
        }

        eligibleChannelFound = true;
        const contact = await resolveContact(db, job, channel);
        if (!contact) {
            lastError = `No ${channel} contact found for recipient`;
            continue;
        }

        const language = job.variables?.language || 'en';
        const template = job.variables?.notification_body
            ? {
                subject: job.variables.notification_subject || '',
                body: job.variables.notification_body,
                language
            }
            : await resolveTemplate(db, job.event_type, channel, language);
        if (!template) {
            lastError = `No active template for ${job.event_type}/${channel}`;
            continue;
        }

        const renderedSubject = job.event_type === 'MarketingCampaign' && job.variables?.campaign_subject
            ? job.variables.campaign_subject
            : renderTemplate(template?.subject || '', job.variables);

        const result = await dispatch(
            channel, contact,
            renderedSubject,
            renderTemplate(template?.body || '', job.variables),
            db,
            {
                eventType: job.event_type,
                entityId: job.entity_id,
                patientId: job.recipient_type === 'Patient' ? job.recipient_id : null,
                doctorId: job.recipient_type === 'Doctor' ? job.recipient_id : null,
                recipientUserId: job.recipient_type === 'Staff' ? job.recipient_id : null,
                audienceType: job.recipient_type === 'Patient' ? 'Patient' : job.recipient_type === 'Doctor' ? 'Doctor' : 'Staff',
                audienceRole: job.recipient_type === 'Staff' ? job.variables?.role : null,
                priority: job.priority || 'Normal',
                idempotencyKey: job.job_id ? `notification-job:${job.job_id}:${channel}` : job.idempotency_key,
                variables: job.variables
            }
        );

        if (result.success) return { ...result, channel };
        lastError = result.error;
    }

    return {
        success: false,
        skipped: !eligibleChannelFound,
        error: lastError || 'No eligible delivery channel'
    };
};

const updateCampaignRecipient = async (db, job, status, updates = {}) => {
    if (job.event_type !== 'MarketingCampaign' || job.entity_type !== 'Campaign' || !job.entity_id || !job.recipient_id) return;

    await db.query(`
        UPDATE marketing_campaign_recipients
        SET status = $1::varchar,
            notification_id = COALESCE($2, notification_id),
            failure_reason = $3,
            sent_at = CASE WHEN $1::varchar = 'Sent' THEN NOW() ELSE sent_at END,
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

const resolveTemplate = async (db, eventType, channel, language = 'en') => {
    const preferred = await db.query(`
        SELECT subject, body, language FROM notification_templates
        WHERE event_type = $1 AND channel = $2 AND is_active = TRUE
          AND language IN ($3, 'en')
        ORDER BY (language = $3) DESC
        LIMIT 1
    `, [eventType, channel, language]);
    if (preferred.rows[0]) return preferred.rows[0];

    const anyLang = await db.query(`
        SELECT subject, body, language FROM notification_templates
        WHERE event_type = $1 AND channel = $2 AND is_active = TRUE
        ORDER BY (language = 'en') DESC
        LIMIT 1
    `, [eventType, channel]);
    return anyLang.rows[0] || null;
};

const validateRequiredVariables = async (db, eventType, variables = {}) => {
    const result = await db.query(`
        SELECT required_variables FROM notification_event_catalog WHERE event_type = $1
    `, [eventType]);
    const required = result.rows[0]?.required_variables || [];
    const missing = required.filter(variable => {
        if (!Object.prototype.hasOwnProperty.call(variables, variable)) return true;
        const value = variables[variable];
        return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
    });
    return missing;
};

const validateTemplatePlaceholders = (templateText, requiredVariables = []) => {
    if (!templateText || requiredVariables.length === 0) return [];
    const found = new Set();
    const regex = /\{\{([\w.-]+)\}\}/g;
    let match;
    while ((match = regex.exec(templateText)) !== null) {
        found.add(match[1]);
    }
    return requiredVariables.filter(v => !found.has(v));
};

// ─── Process pending jobs ─────────────────────────────────────────────────────

const processJobs = async (db) => {
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
        WITH claimed AS (
            SELECT job_id
            FROM notification_jobs
            WHERE status = 'Pending'
              AND scheduled_for <= NOW()
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            ORDER BY scheduled_for ASC
            LIMIT 20
            FOR UPDATE SKIP LOCKED
        )
        UPDATE notification_jobs n
        SET status = 'Processing',
            locked_at = NOW(),
            locked_by = $1
        FROM claimed
        WHERE n.job_id = claimed.job_id
        RETURNING n.*
    `, [WORKER_ID]);

    const jobs = claimedResult.rows;

    for (const job of jobs) {
        try {
            // Revalidate after claiming so stale reminders cannot be sent after
            // a cancellation or reschedule races the scheduler.
            if (job.event_type === 'AppointmentReminder' && job.entity_type === 'Appointment') {
                const appointmentResult = await db.query(
                    'SELECT status, start_time FROM appointments WHERE appointment_id = $1',
                    [job.entity_id]
                );
                const appointment = appointmentResult.rows[0];
                const currentOccurrence = getAppointmentOccurrenceKey(appointment?.start_time);
                const expectedOccurrence = job.variables?.occurrence_key || null;
                if (!appointment
                    || !['Scheduled', 'Confirmed'].includes(appointment.status)
                    || new Date(appointment.start_time) <= new Date()
                    || !expectedOccurrence
                    || currentOccurrence !== expectedOccurrence) {
                    await db.query(`
                        UPDATE notification_jobs
                        SET status = 'Cancelled', processed_at = NOW(),
                            error_message = 'Appointment is no longer eligible for this reminder',
                            next_retry_at = NULL, locked_at = NULL, locked_by = NULL
                        WHERE job_id = $1
                    `, [job.job_id]);
                    processed++;
                    continue;
                }
            }

            // 1. Enforce quiet hours (defer non-critical notifications)
            const quietPrefs = await getQuietHoursPrefs(db, job);
            if (isQuietHours(quietPrefs) && job.priority !== 'Critical') {
                const deferred = resolveDeliveryTime(job, quietPrefs);
                await db.query(
                    `UPDATE notification_jobs
                     SET status = 'Pending', scheduled_for = $1, locked_at = NULL, locked_by = NULL,
                         next_retry_at = NULL, error_message = 'Deferred due to quiet hours'
                     WHERE job_id = $2`,
                    [deferred, job.job_id]
                );
                processed++;
                continue;
            }

            // 2. Validate required template variables before dispatch
            const missingVars = await validateRequiredVariables(db, job.event_type, job.variables);
            if (missingVars.length > 0) {
                await db.query(
                    `UPDATE notification_jobs
                     SET status = $1, processed_at = NOW(), error_message = $2,
                         locked_at = NULL, locked_by = NULL
                     WHERE job_id = $3`,
                    ['Failed', `Missing required variables: ${missingVars.join(', ')}`, job.job_id]
                );
                await updateCampaignRecipient(db, job, 'Failed', { failureReason: `Missing required variables: ${missingVars.join(', ')}` });
                processed++;
                continue;
            }

            // 3. Resolve staff audience policies. Consent and channel preferences
            // are evaluated independently for every fallback attempt.
            const policies = job.recipient_type === 'Staff' && job.recipient_id
                ? await resolveAudiencePolicies(db, job.event_type, job.variables?.role)
                : [];

            // 4. Dispatch with channel-specific contact, template and consent.
            const result = await dispatchWithFallback(db, job, policies);

            const canRetry = !result.success && !result.skipped && job.retry_count < job.max_retries;
            const finalStatus = result.success ? 'Sent' : result.skipped ? 'Skipped' : canRetry ? 'Pending' : 'Failed';
            const retryDelayMinutes = Math.min(60, 5 * Math.pow(2, job.retry_count || 0));
            await db.query(`
                UPDATE notification_jobs
                SET status = $1::varchar,
                    processed_at = CASE WHEN $1::varchar = 'Pending' THEN NULL ELSE NOW() END,
                    notification_id = $2,
                    error_message = $3,
                    retry_count = retry_count + CASE WHEN $1::varchar IN ('Pending', 'Failed') THEN 1 ELSE 0 END,
                    next_retry_at = CASE WHEN $1::varchar = 'Pending' THEN NOW() + ($5::int * INTERVAL '1 minute') ELSE NULL END,
                    locked_at = NULL,
                    locked_by = NULL
                WHERE job_id = $4
            `, [finalStatus, result.notificationId || null, result.error || null, job.job_id, retryDelayMinutes]);

            await updateCampaignRecipient(db, job, finalStatus === 'Pending' ? 'Queued' : finalStatus, {
                notificationId: result.notificationId,
                failureReason: ['Failed', 'Skipped'].includes(finalStatus) ? result.error : null
            });

            processed++;
        } catch (err) {
            const canRetry = job.retry_count < job.max_retries;
            await db.query(`
                UPDATE notification_jobs
                SET status = $1::varchar,
                    retry_count = retry_count + 1,
                    error_message = $2,
                    next_retry_at = NOW() + ($4::int * INTERVAL '1 minute'),
                    processed_at = CASE WHEN $1::varchar = 'Pending' THEN NULL ELSE NOW() END,
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
 * @param {object} payload    { patientId, doctorId, staffId, staffRole, entityType, entityId, variables, channels }
 */
const triggerEvent = async (db, eventType, payload = {}) => {
    try {
        const {
            patientId,
            doctorId,
            staffId,
            staffRole,
            entityType,
            entityId,
            variables = {},
            channels,
            scheduledFor,
            occurrenceKey,
            priority
        } = payload;

        const jobs = [];
        const catalogResult = await db.query(`
            SELECT default_channels, default_priority
            FROM notification_event_catalog
            WHERE event_type = $1
            LIMIT 1
        `, [eventType]);
        const catalog = catalogResult.rows[0] || {};
        if (!catalogResult.rows[0]) throw new Error(`Unknown notification event: ${eventType}`);
        const effectivePriority = priority || catalog.default_priority || 'Normal';
        const baseChannels = channels || catalog.default_channels || ['Email', 'SMS'];
        const shouldAddPortalInApp = (patientId || doctorId) && baseChannels.some(channel => channel !== 'InApp');
        const inAppTemplate = shouldAddPortalInApp
            ? await db.query(`
                SELECT 1
                FROM notification_templates
                WHERE event_type = $1
                  AND channel = 'InApp'
                  AND is_active = TRUE
                LIMIT 1
            `, [eventType])
            : { rows: [] };
        const requestedChannels = [...new Set([
            ...baseChannels,
            ...(inAppTemplate.rows.length > 0 ? ['InApp'] : [])
        ])];

        for (const channel of requestedChannels) {
            if (patientId) {
                jobs.push({
                    eventType,
                    channel,
                    recipientType: 'Patient',
                    recipientId: patientId,
                    entityType,
                    entityId,
                    variables: { ...variables, requested_channels: requestedChannels, ...(occurrenceKey ? { occurrence_key: occurrenceKey } : {}) },
                    scheduledFor,
                    occurrenceKey,
                    priority: effectivePriority
                });
            }
        }

        if (doctorId) {
            const prefResult = await db.query(`
                SELECT email_enabled, sms_enabled, whatsapp_enabled, inapp_enabled
                FROM notification_preferences WHERE doctor_id = $1 LIMIT 1
            `, [doctorId]);
            const pref = prefResult.rows[0];
            const doctorChannels = variables.force_delivery === true
                ? requestedChannels
                : pref
                ? requestedChannels.filter(ch => pref[CHANNEL_PREF_COLUMN[ch]] !== false)
                : requestedChannels.filter(ch => ch === 'Email' || ch === 'InApp');
            for (const channel of doctorChannels) {
                jobs.push({
                    eventType, channel,
                    recipientType: 'Doctor', recipientId: doctorId,
                    entityType, entityId,
                    variables: { ...variables, requested_channels: doctorChannels, ...(occurrenceKey ? { occurrence_key: occurrenceKey } : {}) },
                    scheduledFor, occurrenceKey, priority: effectivePriority
                });
            }
        }

        if (staffId && staffRole) {
            const policies = await resolveAudiencePolicies(db, eventType, staffRole);
            const allowedChannels = policies.length > 0
                ? [...new Set(policies.flatMap(p => p.allowed_channels || []))]
                    .filter(channel => baseChannels.includes(channel))
                : ['InApp'];

            for (const channel of allowedChannels) {
                jobs.push({
                    eventType, channel,
                    recipientType: 'Staff', recipientId: staffId,
                    entityType, entityId,
                    variables: { ...variables, role: staffRole, requested_channels: allowedChannels, ...(occurrenceKey ? { occurrence_key: occurrenceKey } : {}) },
                    scheduledFor,
                    occurrenceKey,
                    priority: effectivePriority
                });
            }
        }

        for (const job of jobs) {
            await scheduleJob(db, job);
        }
        return { scheduled: jobs.length };
    } catch (err) {
        console.error(`[NotificationJobService] triggerEvent(${eventType}) error:`, err.message);
        if (payload.required === true) throw err;
        return { scheduled: 0, error: err.message };
    }
};

const triggerEventForRole = async (db, eventType, role, payload = {}) => {
    try {
        const usersResult = await db.query(`
            SELECT user_id FROM users WHERE role = $1 AND is_active = TRUE
        `, [role]);

        let scheduled = 0;
        for (const user of usersResult.rows) {
            const result = await triggerEvent(db, eventType, {
                ...payload,
                staffId: user.user_id,
                staffRole: role
            });
            scheduled += result?.scheduled || 0;
        }
        return { recipients: usersResult.rows.length, scheduled };
    } catch (err) {
        console.error(`[NotificationJobService] triggerEventForRole(${eventType}, ${role}) error:`, err.message);
        if (payload.required === true) throw err;
        return { recipients: 0, scheduled: 0, error: err.message };
    }
};

// ─── Start in-process polling ──────────────────────────────────────────────────

let pollingInterval = null;
let reminderInterval = null;
let criticalEscalationInterval = null;

const reconcileCriticalResultNotifications = async (db) => {
    const pendingResult = await db.query(`
        SELECT cra.acknowledgement_id, cra.exam_id, cra.recipient_user_id,
               cra.referring_doctor_id, cra.recipient_role, cra.escalation_level,
               cra.acknowledgement_due_at, e.order_number, e.critical_result_marked_at
        FROM critical_result_acknowledgements cra
        JOIN examinations e ON e.exam_id = cra.exam_id
        WHERE cra.status = 'Pending'
          AND e.critical_result = TRUE
        ORDER BY cra.created_at ASC
        LIMIT 100
    `);

    let reconciled = 0;
    for (const acknowledgement of pendingResult.rows) {
        const eventType = acknowledgement.escalation_level > 0
            ? 'CriticalResultEscalated'
            : 'CriticalResultFinalized';
        const payload = {
            entityType: 'Exam',
            entityId: acknowledgement.exam_id,
            occurrenceKey: acknowledgement.acknowledgement_id,
            priority: 'Critical',
            required: true,
            variables: {
                exam_id: acknowledgement.exam_id,
                order_number: acknowledgement.order_number || '',
                critical_marked_at: acknowledgement.critical_result_marked_at,
                overdue_since: acknowledgement.acknowledgement_due_at,
                force_delivery: true
            }
        };
        if (acknowledgement.referring_doctor_id) {
            await triggerEvent(db, eventType, {
                ...payload,
                doctorId: acknowledgement.referring_doctor_id
            });
        } else if (acknowledgement.recipient_user_id) {
            await triggerEvent(db, eventType, {
                ...payload,
                staffId: acknowledgement.recipient_user_id,
                staffRole: acknowledgement.recipient_role
            });
        }
        reconciled += 1;
    }
    return reconciled;
};

const processCriticalResultEscalations = async (db) => {
    const admins = await db.query(`
        SELECT user_id, role
        FROM users
        WHERE role = 'Admin' AND is_active = TRUE
        ORDER BY user_id
    `);
    if (admins.rows.length === 0) {
        return { escalated: 0, reconciled: await reconcileCriticalResultNotifications(db) };
    }

    const dueResult = await db.query(`
        SELECT cra.acknowledgement_id, cra.exam_id, cra.acknowledgement_due_at
        FROM critical_result_acknowledgements cra
        JOIN examinations e ON e.exam_id = cra.exam_id
        WHERE cra.status = 'Pending'
          AND cra.referring_doctor_id IS NOT NULL
          AND cra.acknowledgement_due_at <= NOW()
          AND cra.escalated_at IS NULL
          AND e.critical_result = TRUE
        ORDER BY cra.acknowledgement_due_at ASC
        LIMIT 50
    `);

    let escalated = 0;
    for (const acknowledgement of dueResult.rows) {

        for (const admin of admins.rows) {
            await db.query(`
                INSERT INTO critical_result_acknowledgements (
                    exam_id, recipient_user_id, recipient_role, status,
                    acknowledgement_due_at, escalation_level
                )
                VALUES ($1, $2, 'Admin', 'Pending', NOW() + INTERVAL '15 minutes', 1)
                ON CONFLICT (exam_id, recipient_user_id) WHERE recipient_user_id IS NOT NULL
                DO UPDATE SET escalation_level = GREATEST(critical_result_acknowledgements.escalation_level, 1)
            `, [acknowledgement.exam_id, admin.user_id]);
        }
        const claimed = await db.query(`
            UPDATE critical_result_acknowledgements
            SET escalated_at = NOW(), escalation_level = 1, updated_at = NOW()
            WHERE acknowledgement_id = $1
              AND status = 'Pending'
              AND escalated_at IS NULL
            RETURNING acknowledgement_id
        `, [acknowledgement.acknowledgement_id]);
        if (claimed.rows.length > 0) escalated += 1;
    }

    const reconciled = await reconcileCriticalResultNotifications(db);
    return { escalated, reconciled };
};

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
    if (!criticalEscalationInterval) {
        processCriticalResultEscalations(db).catch(err => {
            console.error('[NotificationJobService] Critical-result reconciliation error:', err.message);
        });
        criticalEscalationInterval = setInterval(() => {
            processCriticalResultEscalations(db).catch(err => {
                console.error('[NotificationJobService] Critical-result reconciliation error:', err.message);
            });
        }, 60 * 1000);
    }
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
    if (criticalEscalationInterval) {
        clearInterval(criticalEscalationInterval);
        criticalEscalationInterval = null;
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
                    p.first_name_enc, p.last_name_enc, p.preferred_language
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

            await scheduleAppointmentReminder(db, {
                ...appt,
                patient_name: patientName,
                appointment_time: apptTime
            }, { channels });
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

module.exports = {
    scheduleJob,
    processJobs,
    triggerEvent,
    triggerEventForRole,
    startPolling,
    stopPolling,
    scheduleReminders,
    scheduleAppointmentReminder,
    cancelPendingAppointmentReminders,
    getAppointmentOccurrenceKey,
    validateRequiredVariables,
    validateTemplatePlaceholders,
    buildIdempotencyKey,
    isQuietHours,
    resolveDeliveryTime,
    dispatchWithFallback,
    reconcileCriticalResultNotifications,
    processCriticalResultEscalations,
};
