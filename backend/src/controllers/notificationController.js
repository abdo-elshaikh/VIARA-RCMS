const twilio = require('twilio');
const { dispatch, notifyClients } = require('../services/notificationService');
const { processJobs, validateRequiredVariables, validateTemplatePlaceholders } = require('../services/notificationJobService');
const { AppError } = require('../middleware/errorHandler');
const { decrypt, hash } = require('../utils/crypto');
const settingsService = require('../services/settingsService');

const FULL_NOTIFICATION_ROLES = new Set(['Developer', 'Admin']);
const SEARCH_SCAN_LIMIT = Math.min(
    Math.max(Number(process.env.NOTIFICATION_SEARCH_SCAN_LIMIT || 1000), 100),
    5000
);

const getUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id || null;
const normalizeSearch = (value) => String(value ?? '').trim().toLocaleLowerCase();

const isNotificationReadSchemaMissing = (error) => {
    if (!['42P01', '42703'].includes(error?.code)) return false;
    const message = String(error?.message || '');
    return [
        'notification_reads',
        'audience_type',
        'audience_role',
        'recipient_user_id'
    ].some(identifier => message.includes(identifier));
};

const decryptStored = value => {
    if (!value || (!String(value).startsWith('v2:') && !/^[0-9a-f]+:[0-9a-f]+$/i.test(value))) return value;
    try {
        return decrypt(value);
    } catch {
        return value;
    }
};

const computeActionUrl = (item = {}) => {
    if (item.action_url) return item.action_url;
    const event = String(item.event_type || '').toUpperCase();
    const entityId = item.entity_id;
    const patientId = item.patient_id;

    if (event.includes('STAT') || event.includes('CRITICAL') || event.includes('EXAM') || event.includes('REPORT')) {
        return entityId ? `/worklist?examId=${entityId}` : '/worklist';
    }
    if (event.includes('INVOICE') || event.includes('PAYMENT') || event.includes('BILLING') || event.includes('REFUND')) {
        return entityId ? `/reception?tab=cashier&invoiceId=${entityId}` : '/reception';
    }
    if (event.includes('APPOINTMENT') || event.includes('WAITLIST') || event.includes('BOOKING')) {
        return entityId ? `/appointments?appointmentId=${entityId}` : '/appointments';
    }
    if (event.includes('INVENTORY') || event.includes('STOCK') || event.includes('EXPIRY')) {
        return '/inventory';
    }
    if (event.includes('EQUIPMENT') || event.includes('MAINTENANCE') || event.includes('DOWNTIME')) {
        return '/equipment';
    }
    if (event.includes('PAYROLL')) {
        return '/payroll';
    }
    if (patientId) {
        return `/patients?patientId=${patientId}`;
    }
    return null;
};

const mapNotificationRow = row => ({
    ...row,
    recipient: decryptStored(row.recipient),
    subject: decryptStored(row.subject),
    content: decryptStored(row.content),
    action_url: computeActionUrl(row)
});

const matchesNotificationSearch = (row, q) => {
    const term = normalizeSearch(q);
    if (!term) return true;
    return [
        row.recipient,
        row.subject,
        row.content,
        row.event_type,
        row.status,
        row.channel,
        row.patient_mrn
    ].some(value => normalizeSearch(value).includes(term));
};

const addStaffVisibilityFilter = (filters, values, param, req) => {
    if (FULL_NOTIFICATION_ROLES.has(req.user?.role)) return { filters, values, param };

    const role = req.user?.role || '';
    const userId = getUserId(req);
    filters += ` AND (
        n.audience_type = 'Global'
        OR n.recipient_user_id = $${param}
        OR (
            n.audience_type = 'Staff'
            AND n.recipient_user_id IS NULL
            AND n.audience_role = $${param + 1}
        )
    )`;
    values.push(userId, role);
    return { filters, values, param: param + 2 };
};

const buildStaffNotificationFilters = (req) => {
    const { channel, status, eventType, patientId, startDate, endDate } = req.query;
    const values = [];
    let param = 1;
    let filters = '';

    if (channel) { filters += ` AND n.channel = $${param++}`; values.push(channel); }
    if (status) { filters += ` AND n.status = $${param++}`; values.push(status); }
    if (eventType) { filters += ` AND n.event_type = $${param++}`; values.push(eventType); }
    if (patientId) { filters += ` AND n.patient_id = $${param++}`; values.push(patientId); }
    if (startDate) { filters += ` AND n.created_at >= $${param++}::date`; values.push(startDate); }
    if (endDate) { filters += ` AND n.created_at < ($${param++}::date + interval '1 day')`; values.push(endDate); }
    return addStaffVisibilityFilter(filters, values, param, req);
};

// ─── Notification Log ─────────────────────────────────────────────────────────

const getNotifications = (db) => async (req, res, next) => {
    try {
        const { limit = 50, offset = 0, q } = req.query;
        const userId = getUserId(req);
        let { filters, values, param } = buildStaffNotificationFilters(req);
        const viewCondition = req.query.view === 'unread'
            ? 'nr.read_at IS NULL'
            : req.query.view === 'failed' ? "n.status = 'Failed'" : 'TRUE';
        const viewFilter = ` AND ${viewCondition}`;
        const readParam = param;

        if (q) {
            const searchQuery = `
                SELECT n.*,
                       p.mrn AS patient_mrn,
                       (nr.read_at IS NOT NULL) AS is_read,
                       nr.read_at
                FROM notifications n
                LEFT JOIN patients p ON n.patient_id = p.patient_id
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.notification_id
                 AND nr.user_id = $${param++}
                 WHERE 1=1 ${filters}
                ORDER BY n.created_at DESC
                LIMIT $${param}
            `;
            const result = await db.query(searchQuery, [...values, userId, SEARCH_SCAN_LIMIT + 1]);
            const visibleRows = result.rows.slice(0, SEARCH_SCAN_LIMIT).map(mapNotificationRow);
            const matchingRows = visibleRows.filter(row => matchesNotificationSearch(row, q));
            const selectedRows = matchingRows.filter(row => (
                req.query.view === 'unread' ? !row.is_read
                    : req.query.view === 'failed' ? row.status === 'Failed' : true
            ));
            const pageRows = selectedRows.slice(offset, offset + limit);
            const counts = matchingRows.reduce((acc, row) => {
                acc.all += 1;
                if (!row.is_read) acc.unread += 1;
                if (row.status === 'Failed') acc.failed += 1;
                if (row.status === 'Pending') acc.pending += 1;
                if (row.status === 'Sent') acc.sent += 1;
                if (row.status === 'Delivered') acc.delivered += 1;
                return acc;
            }, { all: 0, unread: 0, failed: 0, pending: 0, sent: 0, delivered: 0 });

            return res.json({
                items: pageRows,
                total: selectedRows.length,
                limit,
                offset,
                counts,
                searchLimited: result.rows.length > SEARCH_SCAN_LIMIT,
                searchScanLimit: SEARCH_SCAN_LIMIT
            });
        }

        const dataQuery = `
            SELECT n.*,
                   p.mrn AS patient_mrn,
                   (nr.read_at IS NOT NULL) AS is_read,
                   nr.read_at
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $${param++}
            WHERE 1=1 ${filters} ${viewFilter}
            ORDER BY n.created_at DESC
            LIMIT $${param++} OFFSET $${param}
        `;
        const dataValues = [...values, userId, limit, offset];

        const countQuery = `
            SELECT
                COUNT(*) FILTER (WHERE ${viewCondition})::int AS filtered_total,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE nr.read_at IS NULL)::int AS unread,
                COUNT(*) FILTER (WHERE n.status = 'Failed')::int AS failed,
                COUNT(*) FILTER (WHERE n.status = 'Pending')::int AS pending,
                COUNT(*) FILTER (WHERE n.status = 'Sent')::int AS sent,
                COUNT(*) FILTER (WHERE n.status = 'Delivered')::int AS delivered
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $${readParam}
            WHERE 1=1 ${filters}
        `;
        const countValues = [...values, userId];

        const [result, countResult] = await Promise.all([
            db.query(dataQuery, dataValues),
            db.query(countQuery, countValues)
        ]);

        const items = result.rows.map(mapNotificationRow);
        const meta = countResult.rows[0] || { filtered_total: 0, total: 0, unread: 0, failed: 0, pending: 0, sent: 0, delivered: 0 };

        res.json({
            items,
            total: meta.filtered_total,
            limit,
            offset,
            counts: {
                all: meta.total,
                unread: meta.unread,
                failed: meta.failed,
                pending: meta.pending,
                sent: meta.sent,
                delivered: meta.delivered
            }
        });
    } catch (error) {
        next(error);
    }
};

const getUnreadCount = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { filters, values, param } = addStaffVisibilityFilter('', [], 1, req);
        const result = await db.query(`
            SELECT COUNT(*) AS unread_count
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $${param}
            WHERE nr.read_at IS NULL ${filters}
        `, [...values, userId]);
        res.json({ unreadCount: parseInt(result.rows[0].unread_count, 10) });
    } catch (error) {
        if (isNotificationReadSchemaMissing(error)) {
            try {
                const result = await db.query(`
                    SELECT COUNT(*) AS unread_count
                    FROM notifications n
                    WHERE COALESCE(n.is_read, FALSE) = FALSE
                `);
                return res.json({ unreadCount: parseInt(result.rows[0].unread_count, 10) });
            } catch (fallbackError) {
                return next(fallbackError);
            }
        }
        next(error);
    }
};

const getMyNotifications = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const role = req.user?.role || '';
        const { limit = 50, offset = 0, q } = req.query;
        const values = [userId, role];
        let param = 3;
        let filters = ` AND (
            n.recipient_user_id = $1
            OR n.audience_type = 'Global'
            OR (n.audience_type = 'Staff' AND n.recipient_user_id IS NULL AND n.audience_role = $2)
        )`;

        if (q) {
            const searchQuery = `
                SELECT n.*,
                       p.mrn AS patient_mrn,
                       (nr.read_at IS NOT NULL) AS is_read,
                       nr.read_at
                FROM notifications n
                LEFT JOIN patients p ON n.patient_id = p.patient_id
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.notification_id
                 AND nr.user_id = $1
                WHERE 1=1 ${filters}
                ORDER BY n.created_at DESC
                LIMIT $${param}
            `;
            const result = await db.query(searchQuery, [...values, SEARCH_SCAN_LIMIT + 1]);
            const visibleRows = result.rows.slice(0, SEARCH_SCAN_LIMIT).map(mapNotificationRow);
            const matchingRows = visibleRows.filter(row => matchesNotificationSearch(row, q));
            const pageRows = matchingRows.slice(offset, offset + limit);
            const counts = matchingRows.reduce((acc, row) => {
                acc.all += 1;
                if (!row.is_read) acc.unread += 1;
                return acc;
            }, { all: 0, unread: 0 });

            return res.json({
                items: pageRows,
                total: counts.all,
                limit,
                offset,
                counts
            });
        }

        const dataQuery = `
            SELECT n.*,
                   p.mrn AS patient_mrn,
                   (nr.read_at IS NOT NULL) AS is_read,
                   nr.read_at
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $1
            WHERE 1=1 ${filters}
            ORDER BY n.created_at DESC
            LIMIT $${param++} OFFSET $${param}
        `;

        const countQuery = `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE nr.read_at IS NULL)::int AS unread
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $1
            WHERE 1=1 ${filters}
        `;

        const [result, countResult] = await Promise.all([
            db.query(dataQuery, [userId, role, limit, offset]),
            db.query(countQuery, [userId, role])
        ]);

        const items = result.rows.map(mapNotificationRow);
        const meta = countResult.rows[0] || { total: 0, unread: 0 };

        res.json({
            items,
            total: meta.total,
            limit,
            offset,
            counts: {
                all: meta.total,
                unread: meta.unread
            }
        });
    } catch (error) {
        next(error);
    }
};

const markMyNotificationRead = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = getUserId(req);
        const role = req.user?.role || '';
        const result = await db.query(`
            INSERT INTO notification_reads (notification_id, user_id, read_at)
            SELECT n.notification_id, $1, NOW()
            FROM notifications n
            WHERE n.notification_id = $2
              AND (
                  n.recipient_user_id = $1
                  OR n.audience_type = 'Global'
                  OR (n.audience_type = 'Staff' AND n.recipient_user_id IS NULL AND n.audience_role = $3)
              )
            ON CONFLICT (notification_id, user_id)
            DO UPDATE SET read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at)
            RETURNING notification_id, TRUE AS is_read, read_at
        `, [userId, id, role]);

        if (result.rows.length === 0) {
            return next(new AppError('Notification not found', 404));
        }

        res.json({ message: 'Notification marked as read', notification: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const markAllMyNotificationsRead = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const role = req.user?.role || '';
        const result = await db.query(`
            INSERT INTO notification_reads (notification_id, user_id, read_at)
            SELECT n.notification_id, $1, NOW()
            FROM notifications n
            WHERE (
                n.recipient_user_id = $1
                OR n.audience_type = 'Global'
                OR (n.audience_type = 'Staff' AND n.recipient_user_id IS NULL AND n.audience_role = $2)
            )
              AND NOT EXISTS (
                  SELECT 1 FROM notification_reads nr
                  WHERE nr.notification_id = n.notification_id AND nr.user_id = $1
              )
            ON CONFLICT (notification_id, user_id)
            DO UPDATE SET read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at)
            RETURNING notification_id
        `, [userId, role]);
        res.json({ message: 'All notifications marked as read', count: result.rowCount });
    } catch (error) {
        next(error);
    }
};

const markAllRead = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { filters, values } = addStaffVisibilityFilter('', [], 2, req);
        const result = await db.query(`
            INSERT INTO notification_reads (notification_id, user_id, read_at)
            SELECT n.notification_id, $1, NOW()
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            WHERE 1=1 ${filters}
            ON CONFLICT (notification_id, user_id)
            DO UPDATE SET read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at)
            RETURNING notification_id
        `, [userId, ...values]);
        res.json({ message: 'All notifications marked as read', count: result.rowCount });
    } catch (error) {
        next(error);
    }
};

const markNotificationRead = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = getUserId(req);
        const { filters, values } = addStaffVisibilityFilter('', [], 3, req);
        const result = await db.query(`
            INSERT INTO notification_reads (notification_id, user_id, read_at)
            SELECT n.notification_id, $1, NOW()
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            WHERE n.notification_id = $2 ${filters}
            ON CONFLICT (notification_id, user_id)
            DO UPDATE SET read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at)
            RETURNING notification_id, TRUE AS is_read, read_at
        `, [userId, id, ...values]);

        if (result.rows.length === 0) {
            return next(new AppError('Notification not found', 404));
        }

        res.json({ message: 'Notification marked as read', notification: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

// ─── Templates ────────────────────────────────────────────────────────────────

const getTemplates = (db) => async (req, res, next) => {
    try {
        const { eventType, channel } = req.query;
        const values = [];
        let param = 1;
        let filters = '';
        if (eventType) { filters += ` AND event_type = $${param++}`; values.push(eventType); }
        if (channel)   { filters += ` AND channel = $${param++}`; values.push(channel); }

        const result = await db.query(
            `SELECT * FROM notification_templates WHERE 1=1 ${filters} ORDER BY event_type, channel`,
            values
        );
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createTemplate = (db) => async (req, res, next) => {
    try {
        const data = req.body;

        const requiredVars = await validateRequiredVariables(db, data.eventType, {});
        const missingInSubject = validateTemplatePlaceholders(data.subject || '', requiredVars);
        const missingInBody = validateTemplatePlaceholders(data.body || '', requiredVars);
        const allMissing = [...new Set([...missingInSubject, ...missingInBody])];

        if (allMissing.length > 0) {
            return next(new AppError(`Template is missing required placeholders: ${allMissing.join(', ')}`, 400));
        }

        const result = await db.query(`
            INSERT INTO notification_templates
                (event_type, channel, language, subject, body, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [data.eventType, data.channel, data.language || 'en', data.subject || null, data.body, data.isActive === true, req.user.user_id]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') return next(new AppError('Template for this event/channel/language already exists', 409));
        next(error);
    }
};

const updateTemplate = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const existing = await db.query('SELECT * FROM notification_templates WHERE template_id = $1', [id]);
        if (existing.rows.length === 0) return next(new AppError('Template not found', 404));

        const t = existing.rows[0];
        const subject = data.subject !== undefined ? data.subject : t.subject;
        const body = data.body !== undefined ? data.body : t.body;

        const requiredVars = await validateRequiredVariables(db, t.event_type, {});
        const missingInSubject = validateTemplatePlaceholders(subject || '', requiredVars);
        const missingInBody = validateTemplatePlaceholders(body || '', requiredVars);
        const allMissing = [...new Set([...missingInSubject, ...missingInBody])];

        if (allMissing.length > 0) {
            return next(new AppError(`Template is missing required placeholders: ${allMissing.join(', ')}`, 400));
        }

        const result = await db.query(`
            UPDATE notification_templates
            SET subject = $1, body = $2, is_active = $3, updated_at = NOW()
            WHERE template_id = $4
            RETURNING *
        `, [
            subject,
            body,
            data.isActive !== undefined ? data.isActive : t.is_active,
            id
        ]);
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const deleteTemplate = (db) => async (req, res, next) => {
    try {
        const result = await db.query('DELETE FROM notification_templates WHERE template_id = $1 RETURNING template_id', [req.params.id]);
        if (result.rows.length === 0) return next(new AppError('Template not found', 404));
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// ─── Jobs ─────────────────────────────────────────────────────────────────────

const getJobs = (db) => async (req, res, next) => {
    try {
        const { status, eventType, limit = 50, offset = 0 } = req.query;
        const values = [];
        let param = 1;
        let filters = '';
        if (status)    { filters += ` AND status = $${param++}`; values.push(status); }
        if (eventType) { filters += ` AND event_type = $${param++}`; values.push(eventType); }

        const [result, countResult] = await Promise.all([
            db.query(
                `SELECT * FROM notification_jobs WHERE 1=1 ${filters} ORDER BY scheduled_for DESC, job_id DESC LIMIT $${param++} OFFSET $${param}`,
                [...values, limit, offset]
            ),
            db.query(`SELECT COUNT(*)::int AS total FROM notification_jobs WHERE 1=1 ${filters}`, values)
        ]);
        res.json({ items: result.rows, total: countResult.rows[0]?.total || 0, limit, offset });
    } catch (error) {
        next(error);
    }
};

const retryJob = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            UPDATE notification_jobs
            SET status = 'Pending',
                retry_count = 0,
                scheduled_for = NOW(),
                next_retry_at = NULL,
                locked_at = NULL,
                locked_by = NULL,
                error_message = NULL
            WHERE job_id = $1 AND status = 'Failed'
            RETURNING *
        `, [id]);
        if (result.rows.length === 0) return next(new AppError('Job not found or not in Failed state', 404));
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const triggerProcessJobs = (db) => async (req, res, next) => {
    try {
        const result = await processJobs(db);
        res.json({ message: `Processed ${result.processed} of ${result.total} jobs`, ...result });
    } catch (error) {
        next(error);
    }
};

// ─── Manual send ──────────────────────────────────────────────────────────────

const sendManual = (db) => async (req, res, next) => {
    try {
        const data = req.body;

        let contact = data.recipientEmail || data.recipientPhone;

        if (data.patientId) {
            const p = await db.query(`
                SELECT email_enc, phone_enc, consent_email, consent_sms, consent_whatsapp
                FROM patients
                WHERE patient_id = $1
            `, [data.patientId]);
            if (p.rows.length === 0) return next(new AppError('Patient not found', 404));
            const consentField = {
                Email: 'consent_email',
                SMS: 'consent_sms',
                WhatsApp: 'consent_whatsapp'
            }[data.channel];
            if (consentField && p.rows[0][consentField] !== true) {
                return next(new AppError(`Patient has not consented to ${data.channel} notifications`, 409));
            }
            if (!contact) {
                contact = data.channel === 'Email' ? decrypt(p.rows[0].email_enc) : decrypt(p.rows[0].phone_enc);
            }
        }

        if (!contact) return next(new AppError('Could not resolve recipient contact', 400));

        const result = await dispatch(
            data.channel, contact, data.subject || '', data.body, db,
            {
                eventType: 'ManualSend',
                entityType: data.entityType,
                entityId: data.entityId,
                patientId: data.patientId,
                // Custom external messages are private operational records. They
                // must never become globally visible merely because no patient ID
                // was supplied.
                recipientUserId: getUserId(req),
                audienceType: data.patientId ? 'Patient' : 'Staff',
                priority: 'Action'
            }
        );

        if (!result.success) return next(new AppError('Failed to send notification', 500));
        res.json({ message: 'Notification sent', notificationId: result.notificationId });
    } catch (error) {
        next(error);
    }
};

// ─── Preferences ──────────────────────────────────────────────────────────────

const getPreferences = (db) => async (req, res, next) => {
    try {
        const { patientId, doctorId } = req.query;
        if (!patientId && !doctorId) return next(new AppError('Provide patientId or doctorId', 400));

        const result = await db.query(`
            SELECT * FROM notification_preferences
            WHERE ($1::uuid IS NULL OR patient_id = $1)
              AND ($2::uuid IS NULL OR doctor_id = $2)
            LIMIT 1
        `, [patientId || null, doctorId || null]);

        if (result.rows.length === 0) {
            return res.json({
                email_enabled: true, sms_enabled: true, whatsapp_enabled: false,
                notify_appointment_created: true, notify_appointment_reminder: true,
                notify_appointment_rescheduled: true, notify_appointment_cancelled: true,
                notify_prep_instructions: true, notify_payment_due: true,
                notify_report_ready: true, notify_result_delivered: true,
                notify_followup_reminder: false, notify_marketing: false
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getStaffPreferences = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const result = await db.query(`
            SELECT * FROM notification_preferences
            WHERE staff_user_id = $1
            LIMIT 1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.json({
                email_enabled: true, sms_enabled: true, whatsapp_enabled: false,
                inapp_enabled: true,
                notify_security_event: true, notify_staff_lifecycle: true,
                notify_order_events: true, notify_queue_change: true,
                notify_pacs_alert: true, notify_backup_status: true,
                notify_privacy_request: true, notify_chat_message: true,
                notify_inventory_expiry: true, notify_claim_update: true,
                notify_payment_update: true,
                quiet_hours_enabled: false, quiet_hours_start: 22, quiet_hours_end: 7
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updateStaffPreferences = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const data = req.body;

        const allowedFields = new Set([
            'email_enabled', 'sms_enabled', 'whatsapp_enabled', 'inapp_enabled',
            'notify_security_event', 'notify_staff_lifecycle', 'notify_order_events',
            'notify_queue_change', 'notify_pacs_alert', 'notify_backup_status',
            'notify_privacy_request', 'notify_chat_message', 'notify_inventory_expiry',
            'notify_claim_update', 'notify_payment_update',
            'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end'
        ]);

        const entries = Object.entries(data).filter(([k]) => allowedFields.has(k));
        if (entries.length === 0) return next(new AppError('No valid fields to update', 400));

        await db.query(`
            INSERT INTO notification_preferences (staff_user_id)
            VALUES ($1)
            ON CONFLICT DO NOTHING
        `, [userId]);

        const setClauses = entries.map(([k, v], i) => `${k} = $${i + 2}`).join(', ');
        const vals = entries.map(([, v]) => v);

        await db.query(
            `UPDATE notification_preferences SET ${setClauses}, updated_at = NOW() WHERE staff_user_id = $1`,
            [userId, ...vals]
        );

        const updated = await db.query('SELECT * FROM notification_preferences WHERE staff_user_id = $1', [userId]);
        res.json(updated.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updatePreferences = (db) => async (req, res, next) => {
    try {
        const { patientId, doctorId } = req.query;
        if (!patientId && !doctorId) return next(new AppError('Provide patientId or doctorId', 400));

        const data = req.body;
        const colMap = {
            emailEnabled: 'email_enabled', smsEnabled: 'sms_enabled', whatsappEnabled: 'whatsapp_enabled',
            notifyAppointmentCreated: 'notify_appointment_created',
            notifyAppointmentReminder: 'notify_appointment_reminder',
            notifyAppointmentRescheduled: 'notify_appointment_rescheduled',
            notifyAppointmentCancelled: 'notify_appointment_cancelled',
            notifyPrepInstructions: 'notify_prep_instructions',
            notifyPaymentDue: 'notify_payment_due',
            notifyReportReady: 'notify_report_ready',
            notifyResultDelivered: 'notify_result_delivered',
            notifyFollowupReminder: 'notify_followup_reminder',
            notifyMarketing: 'notify_marketing'
        };

        const sets = Object.entries(data)
            .filter(([k]) => colMap[k] !== undefined)
            .map(([k, v]) => ({ col: colMap[k], val: v }));

        if (sets.length === 0) return next(new AppError('No valid fields to update', 400));

        // Upsert
        await db.query(`
            INSERT INTO notification_preferences (patient_id, doctor_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        `, [patientId || null, doctorId || null]);

        const setClauses = sets.map((s, i) => `${s.col} = $${i + 3}`).join(', ');
        const vals = sets.map(s => s.val);

        await db.query(
            `UPDATE notification_preferences SET ${setClauses}, updated_at = NOW()
             WHERE ($1::uuid IS NULL OR patient_id = $1) AND ($2::uuid IS NULL OR doctor_id = $2)`,
            [patientId || null, doctorId || null, ...vals]
        );

        res.json({ message: 'Preferences updated' });
    } catch (error) {
        next(error);
    }
};

const sendReminder = (db) => async (req, res, next) => {
    try {
        const { appointmentId, recipientEmail, patientName, time } = req.body;
        if (!recipientEmail) return next(new AppError('Recipient email is required', 400));

        const allSettings = await settingsService.getAll();
        const centerName = [allSettings['center.name'], allSettings['center.branch']].filter(Boolean).join(' - ') || 'Radiology Center';
        const subject = `Appointment Reminder: ${patientName}`;
        const body = `Dear ${patientName},\n\nThis is a reminder for your appointment at ${centerName} scheduled for ${new Date(time).toLocaleString()}.\n\nPlease arrive 15 minutes early.\n\nRegards,\n${centerName} Team`;

        const result = await dispatch('Email', recipientEmail, subject, body, db, {
            eventType: 'ManualReminder',
            entityType: 'Appointment',
            entityId: appointmentId,
            audienceType: 'Patient',
            priority: 'Action'
        });
        if (result.success) {
            res.json({ message: 'Reminder sent successfully' });
        } else {
            return next(new AppError('Failed to send reminder', 500));
        }
    } catch (error) {
        next(error);
    }
};

const unsubscribe = (db) => async (req, res, next) => {
    try {
        const { phone, email } = req.body;

        let targetPatientId;

        if (!targetPatientId && phone) {
            const phoneHash = hash(String(phone).trim());
            const found = await db.query('SELECT patient_id FROM patients WHERE phone_hash = $1 LIMIT 1', [phoneHash]);
            targetPatientId = found.rows[0]?.patient_id;
        }

        if (!targetPatientId && email) {
            const emailHash = hash(String(email).trim().toLowerCase());
            const found = await db.query('SELECT patient_id FROM patients WHERE email_hash = $1 LIMIT 1', [emailHash]);
            targetPatientId = found.rows[0]?.patient_id;
        }

        if (!targetPatientId) {
            return next(new AppError('Patient not found for unsubscribe request', 404));
        }

        const channelColumn = email ? 'email_enabled' : 'sms_enabled';
        const consentColumn = email ? 'consent_email' : 'consent_sms';

        await db.query(`
            UPDATE patients
            SET opt_in_marketing = FALSE,
                consent_marketing = FALSE,
                ${consentColumn} = FALSE
            WHERE patient_id = $1
        `, [targetPatientId]);

        const pref = await db.query(
            'SELECT preference_id FROM notification_preferences WHERE patient_id = $1 LIMIT 1',
            [targetPatientId]
        );

        if (pref.rows.length) {
            await db.query(`
                UPDATE notification_preferences
                SET notify_marketing = FALSE, ${channelColumn} = FALSE, updated_at = NOW()
                WHERE patient_id = $1
            `, [targetPatientId]);
        } else {
            await db.query(`
                INSERT INTO notification_preferences (patient_id, notify_marketing, ${channelColumn})
                VALUES ($1, FALSE, FALSE)
            `, [targetPatientId]);
        }

        res.json({
            message: `Unsubscribed from marketing and ${email ? 'email' : 'SMS'} notifications`,
            channel: email ? 'Email' : 'SMS'
        });
    } catch (error) {
        next(error);
    }
};

// ─── Analytics ────────────────────────────────────────────────────────────────

const getNotificationAnalytics = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, eventType, channel, status } = req.query;
        let values = [];
        let param = 1;
        let filters = '';

        if (startDate) { filters += ` AND n.created_at >= $${param++}::date`; values.push(startDate); }
        if (endDate) { filters += ` AND n.created_at < ($${param++}::date + interval '1 day')`; values.push(endDate); }
        if (eventType) { filters += ` AND n.event_type = $${param++}`; values.push(eventType); }
        if (channel) { filters += ` AND n.channel = $${param++}`; values.push(channel); }
        if (status) { filters += ` AND n.status = $${param++}`; values.push(status); }
        ({ filters, values, param } = addStaffVisibilityFilter(filters, values, param, req));
        const readUserParam = param;
        const readValues = [...values, getUserId(req)];

        const [volumeByEvent, volumeByChannel, deliveryStats, readStats, topUnread] = await Promise.all([
            db.query(`
                SELECT n.event_type, ec.category, COUNT(*)::int AS count,
                       COUNT(*) FILTER (WHERE n.status = 'Sent')::int AS sent,
                       COUNT(*) FILTER (WHERE n.status = 'Delivered')::int AS delivered,
                       COUNT(*) FILTER (WHERE n.status = 'Failed')::int AS failed,
                       COUNT(*) FILTER (WHERE n.status = 'Pending')::int AS pending
                FROM notifications n
                LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
                WHERE 1=1 ${filters}
                GROUP BY n.event_type, ec.category
                ORDER BY count DESC
                LIMIT 20
            `, values),
            db.query(`
                SELECT n.channel, COUNT(*)::int AS count,
                       COUNT(*) FILTER (WHERE n.status = 'Delivered')::int AS delivered,
                       COUNT(*) FILTER (WHERE n.status = 'Sent')::int AS sent,
                       COUNT(*) FILTER (WHERE n.status = 'Failed')::int AS failed
                FROM notifications n
                WHERE 1=1 ${filters}
                GROUP BY n.channel
                ORDER BY count DESC
            `, values),
            db.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE status = 'Delivered')::int AS delivered,
                       COUNT(*) FILTER (WHERE status = 'Sent')::int AS sent,
                       COUNT(*) FILTER (WHERE status IN ('Sent', 'Delivered'))::int AS accepted,
                       COUNT(*) FILTER (WHERE status = 'Failed')::int AS failed,
                       COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending
                FROM notifications n
                WHERE 1=1 ${filters}
            `, values),
            db.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE nr.read_at IS NOT NULL)::int AS read_count,
                       COUNT(*) FILTER (WHERE nr.read_at IS NULL)::int AS unread_count
                FROM notifications n
                 LEFT JOIN notification_reads nr ON nr.notification_id = n.notification_id
                    AND nr.user_id = $${readUserParam}
                 WHERE 1=1 ${filters}
             `, readValues),
            db.query(`
                SELECT n.event_type, n.channel, n.created_at,
                       p.mrn AS patient_mrn,
                       (nr.read_at IS NOT NULL) AS is_read
                FROM notifications n
                LEFT JOIN patients p ON n.patient_id = p.patient_id
                 LEFT JOIN notification_reads nr ON nr.notification_id = n.notification_id
                    AND nr.user_id = $${readUserParam}
                 WHERE nr.read_at IS NULL ${filters}
                ORDER BY n.created_at DESC
                LIMIT 10
             `, readValues)
        ]);

        res.json({
            volumeByEvent: volumeByEvent.rows,
            volumeByChannel: volumeByChannel.rows,
            delivery: deliveryStats.rows[0] || { total: 0, delivered: 0, failed: 0, pending: 0 },
            reads: readStats.rows[0] || { total: 0, read_count: 0, unread_count: 0 },
            topUnread: topUnread.rows
        });
    } catch (error) {
        next(error);
    }
};

const TWILIO_STATUS_MAP = {
    delivered: 'Delivered',
    failed: 'Failed',
    undelivered: 'Failed',
};

const validateTwilioSignature = (req) => {
    const token = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;
    if (!token) return process.env.NODE_ENV !== 'production';

    const signature = req.get('x-twilio-signature');
    if (!signature) return false;

    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;
    return twilio.validateRequest(token, signature, url, req.body || {});
};

const handleTwilioWebhook = (db) => async (req, res) => {
    if (!validateTwilioSignature(req)) {
        return res.status(403).json({ error: 'Invalid Twilio signature' });
    }

    const { MessageSid, MessageStatus } = req.body;
    const mappedStatus = TWILIO_STATUS_MAP[MessageStatus];
    if (MessageSid && mappedStatus) {
        try {
            const result = await db.query(
                `UPDATE notifications
                 SET status = $1
                 WHERE provider_message_id = $2
                 RETURNING notification_id`,
                [mappedStatus, MessageSid]
            );
            for (const row of result.rows) {
                await db.query(`
                    UPDATE notification_jobs
                    SET status = CASE WHEN $1::text = 'Delivered' THEN 'Sent' ELSE 'Failed' END,
                        processed_at = COALESCE(processed_at, NOW()),
                        error_message = CASE WHEN $1::text = 'Failed' THEN COALESCE(error_message, 'Provider delivery failed') ELSE error_message END
                    WHERE notification_id = $2
                `, [mappedStatus, row.notification_id]);
                await notifyClients(db, row.notification_id);
            }
        } catch (err) {
            console.error('[TwilioWebhook] DB error:', err.message);
        }
    }
    return res.sendStatus(204);
};

module.exports = {
    getNotifications, getUnreadCount, markAllRead, markNotificationRead,
    getMyNotifications, markMyNotificationRead, markAllMyNotificationsRead,
    getTemplates, createTemplate, updateTemplate, deleteTemplate,
    getJobs, retryJob, triggerProcessJobs,
    sendManual, sendReminder, unsubscribe,
    getPreferences, updatePreferences,
    getStaffPreferences, updateStaffPreferences,
    getNotificationAnalytics,
    handleTwilioWebhook
};
