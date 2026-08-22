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

const buildIdempotencyKey = (opts) => {
    if (opts.idempotencyKey) return opts.idempotencyKey;
    if (!opts.entityType || !opts.entityId || !opts.eventType || !opts.channel || !opts.recipientType) return null;
    const recipient = opts.recipientId || opts.recipientContact || 'custom';
    const occurrence = opts.occurrenceKey || opts.variables?.occurrence_key || null;
    return [opts.eventType, opts.channel, opts.recipientType, recipient, opts.entityType, opts.entityId, occurrence]
        .filter(value => value !== null && value !== undefined && value !== '')
        .join(':');
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
                retry_count = CASE WHEN notification_jobs.status = 'Failed' THEN 0 ELSE notification_jobs.retry_count END,
                processed_at = CASE WHEN notification_jobs.status = 'Failed' THEN NULL ELSE notification_jobs.processed_at END,
                error_message = CASE WHEN notification_jobs.status = 'Failed' THEN NULL ELSE notification_jobs.error_message END,
                locked_at = CASE WHEN notification_jobs.status = 'Failed' THEN NULL ELSE notification_jobs.locked_at END,
                locked_by = CASE WHEN notification_jobs.status = 'Failed' THEN NULL ELSE notification_jobs.locked_by END,
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
    const result = await db.query(`
        SELECT ${preferenceColumns}
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
    CHAT_DIRECT_MESSAGE: 'notify_chat_message',
    INVENTORY_LOW_STOCK: 'notify_inventory_expiry',
    INVENTORY_EXPIRY_WARNING: 'notify_inventory_expiry',
    INSURANCE_CLAIM_SUBMITTED: 'notify_claim_update',
    INSURANCE_CLAIM_APPROVED: 'notify_claim_update',
    INSURANCE_CLAIM_REJECTED: 'notify_claim_update',
};

const isStaffOptedIn = async (db, job) => {
    if (job.recipient_type !== 'Staff' || !job.recipient_id) return true;

    const result = await db.query(`
        SELECT notify_security_event, notify_staff_lifecycle, notify_order_events,
               notify_queue_change, notify_pacs_alert, notify_backup_status,
               notify_privacy_request, notify_chat_message, notify_inventory_expiry,
               notify_claim_update, notify_payment_update, inapp_enabled,
               email_enabled, sms_enabled, whatsapp_enabled,
               quiet_hours_enabled, quiet_hours_start, quiet_hours_end
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
            SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end
            FROM notification_preferences
            WHERE staff_user_id = $1
            LIMIT 1
        `, [job.recipient_id]);
        return result.rows[0] || {};
    }

    if (job.recipient_type === 'Patient' && job.recipient_id) {
        const result = await db.query(`
            SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end
            FROM notification_preferences
            WHERE patient_id = $1
            LIMIT 1
        `, [job.recipient_id]);
        return result.rows[0] || {};
    }

    if (job.recipient_type === 'Doctor' && job.recipient_id) {
        const result = await db.query(`
            SELECT quiet_hours_enabled, quiet_hours_start, quiet_hours_end
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
    if (isQuietHours(prefs, new Date(), timeZone) && job.priority !== 'Critical') {
        const deferred = new Date();
        const end = normalizeQuietHour(prefs.quiet_hours_end, 7);
        deferred.setHours(end, 0, 0, 0);
        if (deferred <= new Date()) deferred.setDate(deferred.getDate() + 1);
        return deferred;
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
                ));
            if (!allowed) continue;
        }

        const attemptedJob = { ...job, channel };
        const optedIn = job.recipient_type === 'Staff'
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
        const template = await resolveTemplate(db, job.event_type, channel, language);
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
        SET status = $1,
            notification_id = COALESCE($2, notification_id),
            failure_reason = $3,
            sent_at = CASE WHEN $1::text = 'Sent' THEN NOW() ELSE sent_at END,
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
                SET status = $1,
                    processed_at = CASE WHEN $1::text = 'Pending' THEN NULL ELSE NOW() END,
                    notification_id = $2,
                    error_message = $3,
                    retry_count = retry_count + CASE WHEN $1::text IN ('Pending', 'Failed') THEN 1 ELSE 0 END,
                    next_retry_at = CASE WHEN $1::text = 'Pending' THEN NOW() + ($5::int * INTERVAL '1 minute') ELSE NULL END,
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
                SET status = $1,
                    retry_count = retry_count + 1,
                    error_message = $2,
                    next_retry_at = NOW() + ($4::int * INTERVAL '1 minute'),
                    processed_at = CASE WHEN $1::text = 'Pending' THEN NULL ELSE NOW() END,
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
            channels = ['Email', 'SMS'],
            scheduledFor,
            occurrenceKey,
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
                    variables: { ...variables, requested_channels: channels },
                    scheduledFor,
                    occurrenceKey,
                    priority
                });
            }
        }

        if (doctorId) {
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
                    entityType, entityId,
                    variables: { ...variables, requested_channels: doctorChannels },
                    scheduledFor, occurrenceKey, priority
                });
            }
        }

        if (staffId && staffRole) {
            const policies = await resolveAudiencePolicies(db, eventType, staffRole);
            const allowedChannels = policies.length > 0
                ? [...new Set(policies.flatMap(p => p.allowed_channels || []))]
                : ['InApp'];

            for (const channel of allowedChannels) {
                jobs.push({
                    eventType, channel,
                    recipientType: 'Staff', recipientId: staffId,
                    entityType, entityId,
                    variables: { ...variables, role: staffRole, requested_channels: allowedChannels },
                    scheduledFor,
                    occurrenceKey,
                    priority
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

const triggerEventForRole = async (db, eventType, role, payload = {}) => {
    try {
        const usersResult = await db.query(`
            SELECT user_id FROM users WHERE role = $1 AND is_active = TRUE
        `, [role]);

        for (const user of usersResult.rows) {
            await triggerEvent(db, eventType, {
                ...payload,
                staffId: user.user_id,
                staffRole: role
            });
        }
    } catch (err) {
        console.error(`[NotificationJobService] triggerEventForRole(${eventType}, ${role}) error:`, err.message);
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
                        exam_type: appt.exam_type_name || '',
                        language: appt.preferred_language || 'en',
                        requested_channels: channels
                    },
                    occurrenceKey: new Date(appt.start_time).toISOString(),
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

module.exports = {
    scheduleJob,
    processJobs,
    triggerEvent,
    triggerEventForRole,
    startPolling,
    stopPolling,
    scheduleReminders,
    validateRequiredVariables,
    validateTemplatePlaceholders,
    buildIdempotencyKey,
    isQuietHours,
    resolveDeliveryTime,
    dispatchWithFallback,
};
