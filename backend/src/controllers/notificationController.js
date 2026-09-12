const twilio = require('twilio');
const { dispatch, notifyClients, computeActionUrl } = require('../services/notificationService');
const { processJobs, validateRequiredVariables, validateTemplatePlaceholders } = require('../services/notificationJobService');
const { AppError } = require('../middleware/errorHandler');
const { decrypt, hash } = require('../utils/crypto');
const { verifyUnsubscribeToken } = require('../utils/notificationUnsubscribeToken');
const settingsService = require('../services/settingsService');
const { logAction } = require('../services/auditService');

const FULL_NOTIFICATION_ROLES = new Set(['Developer', 'Admin']);
const SEARCH_SCAN_LIMIT = Math.min(
    Math.max(Number(process.env.NOTIFICATION_SEARCH_SCAN_LIMIT || 1000), 100),
    5000
);

const getUserId = (req) => req.user?.user_id || req.user?.userId || req.user?.id || null;
const normalizeSearch = (value) => String(value ?? '').trim().toLocaleLowerCase();

const decryptStored = value => {
    if (!value || (!String(value).startsWith('v2:') && !/^[0-9a-f]+:[0-9a-f]+$/i.test(value))) return value;
    try {
        return decrypt(value);
    } catch {
        return value;
    }
};

const mapNotificationRow = row => ({
    ...row,
    recipient: decryptStored(row.recipient),
    subject: decryptStored(row.subject),
    content: decryptStored(row.content),
    // These endpoints are staff surfaces even when the delivery itself targets
    // a patient or doctor. Never send a staff operator into a portal route.
    action_url: computeActionUrl({ ...row, audience_type: 'Staff' })
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
        n.recipient_user_id = $${param}
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
    const { channel, status, eventType, category, priority, patientId, startDate, endDate } = req.query;
    const values = [];
    let param = 1;
    let filters = '';

    if (channel) { filters += ` AND n.channel = $${param++}`; values.push(channel); }
    if (status) { filters += ` AND n.status = $${param++}`; values.push(status); }
    if (eventType) { filters += ` AND n.event_type = $${param++}`; values.push(eventType); }
    if (category) { filters += ` AND ec.category = $${param++}`; values.push(category); }
    if (priority) { filters += ` AND n.priority = $${param++}`; values.push(priority); }
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
        const viewCondition = req.query.view === 'unread' || req.query.readState === 'unread'
            ? 'nr.read_at IS NULL'
            : req.query.readState === 'read' ? 'nr.read_at IS NOT NULL'
            : req.query.view === 'failed' ? "n.status = 'Failed'" : 'TRUE';
        const viewFilter = ` AND ${viewCondition}`;
        const readParam = param;

        if (q) {
            const searchQuery = `
                SELECT n.*,
                       ec.category,
                       p.mrn AS patient_mrn,
                       cra.status AS acknowledgement_status,
                       cra.acknowledgement_due_at,
                       cra.escalated_at,
                       (nr.read_at IS NOT NULL) AS is_read,
                       nr.read_at
                FROM notifications n
                LEFT JOIN patients p ON n.patient_id = p.patient_id
                LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
                LEFT JOIN critical_result_acknowledgements cra
                  ON cra.exam_id = n.entity_id
                 AND cra.recipient_user_id = $${readParam}
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.notification_id
                 AND nr.user_id = $${param++}
                  WHERE 1=1 ${filters} ${viewFilter}
                 ORDER BY n.created_at DESC, n.notification_id DESC
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
                if (row.priority === 'Critical') acc.critical += 1;
                return acc;
            }, { all: 0, unread: 0, failed: 0, pending: 0, sent: 0, delivered: 0, critical: 0 });

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
                   ec.category,
                   p.mrn AS patient_mrn,
                   cra.status AS acknowledgement_status,
                   cra.acknowledgement_due_at,
                   cra.escalated_at,
                   (nr.read_at IS NOT NULL) AS is_read,
                   nr.read_at
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
            LEFT JOIN critical_result_acknowledgements cra
              ON cra.exam_id = n.entity_id
             AND cra.recipient_user_id = $${readParam}
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $${param++}
            WHERE 1=1 ${filters} ${viewFilter}
            ORDER BY n.created_at DESC, n.notification_id DESC
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
                COUNT(*) FILTER (WHERE n.status = 'Delivered')::int AS delivered,
                COUNT(*) FILTER (WHERE n.priority = 'Critical')::int AS critical
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
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
        const meta = countResult.rows[0] || { filtered_total: 0, total: 0, unread: 0, failed: 0, pending: 0, sent: 0, delivered: 0, critical: 0 };

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
                delivered: meta.delivered,
                critical: meta.critical
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
            WHERE n.channel = 'InApp' AND nr.read_at IS NULL ${filters}
        `, [...values, userId]);
        res.json({ unreadCount: parseInt(result.rows[0].unread_count, 10) });
    } catch (error) {
        next(error);
    }
};

const getMyNotifications = (db) => async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const role = req.user?.role || '';
        const { limit = 50, offset = 0, q, channel, status, eventType, category, priority, readState } = req.query;
        const values = [userId, role];
        let param = 3;
        let filters = ` AND n.channel = 'InApp' AND (
            n.recipient_user_id = $1
            OR (n.audience_type = 'Global' AND $2::text IN ('Admin', 'Developer'))
            OR (n.audience_type = 'Staff' AND n.recipient_user_id IS NULL AND n.audience_role = $2)
        )`;
        if (channel) { filters += ` AND n.channel = $${param++}`; values.push(channel); }
        if (status) { filters += ` AND n.status = $${param++}`; values.push(status); }
        if (eventType) { filters += ` AND n.event_type = $${param++}`; values.push(eventType); }
        if (category) { filters += ` AND ec.category = $${param++}`; values.push(category); }
        if (priority) { filters += ` AND n.priority = $${param++}`; values.push(priority); }
        const readCondition = readState === 'unread'
            ? 'nr.read_at IS NULL'
            : readState === 'read' ? 'nr.read_at IS NOT NULL' : 'TRUE';

        if (q) {
            const searchQuery = `
                SELECT n.*,
                       ec.category,
                       p.mrn AS patient_mrn,
                       cra.status AS acknowledgement_status,
                       cra.acknowledgement_due_at,
                       cra.escalated_at,
                       (nr.read_at IS NOT NULL) AS is_read,
                       nr.read_at
             FROM notifications n
                LEFT JOIN patients p ON n.patient_id = p.patient_id
                LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
                LEFT JOIN critical_result_acknowledgements cra
                  ON cra.exam_id = n.entity_id
                 AND cra.recipient_user_id = $1
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.notification_id
                 AND nr.user_id = $1
                WHERE 1=1 ${filters} AND ${readCondition}
                ORDER BY n.created_at DESC, n.notification_id DESC
                LIMIT $${param}
            `;
            const result = await db.query(searchQuery, [...values, SEARCH_SCAN_LIMIT + 1]);
            const visibleRows = result.rows.slice(0, SEARCH_SCAN_LIMIT).map(mapNotificationRow);
            const matchingRows = visibleRows.filter(row => matchesNotificationSearch(row, q));
            const pageRows = matchingRows.slice(offset, offset + limit);
            const counts = matchingRows.reduce((acc, row) => {
                acc.all += 1;
                if (!row.is_read) acc.unread += 1;
                if (row.priority === 'Critical') acc.critical += 1;
                return acc;
            }, { all: 0, unread: 0, critical: 0 });

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
                   ec.category,
                   p.mrn AS patient_mrn,
                   cra.status AS acknowledgement_status,
                   cra.acknowledgement_due_at,
                   cra.escalated_at,
                   (nr.read_at IS NOT NULL) AS is_read,
                   nr.read_at
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
            LEFT JOIN critical_result_acknowledgements cra
              ON cra.exam_id = n.entity_id
             AND cra.recipient_user_id = $1
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $1
            WHERE 1=1 ${filters} AND ${readCondition}
            ORDER BY n.created_at DESC, n.notification_id DESC
            LIMIT $${param++} OFFSET $${param}
        `;

        const countQuery = `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE nr.read_at IS NULL)::int AS unread,
                COUNT(*) FILTER (WHERE n.priority = 'Critical')::int AS critical
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            LEFT JOIN notification_event_catalog ec ON ec.event_type = n.event_type
            LEFT JOIN notification_reads nr
              ON nr.notification_id = n.notification_id
             AND nr.user_id = $1
            WHERE 1=1 ${filters} AND ${readCondition}
        `;

        const [result, countResult] = await Promise.all([
            db.query(dataQuery, [...values, limit, offset]),
            db.query(countQuery, values)
        ]);

        const items = result.rows.map(mapNotificationRow);
        const meta = countResult.rows[0] || { total: 0, unread: 0, critical: 0 };

        res.json({
            items,
            total: meta.total,
            limit,
            offset,
            counts: {
                all: meta.total,
                unread: meta.unread,
                critical: meta.critical
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
              AND n.channel = 'InApp'
              AND (
                  n.recipient_user_id = $1
                  OR (n.audience_type = 'Global' AND $3::text IN ('Admin', 'Developer'))
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
            WHERE n.channel = 'InApp'
              AND (
                n.recipient_user_id = $1
                OR (n.audience_type = 'Global' AND $2::text IN ('Admin', 'Developer'))
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
            WHERE n.channel = 'InApp' AND 1=1 ${filters}
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
            WHERE n.notification_id = $2 AND n.channel = 'InApp' ${filters}
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
        const templateText = `${data.subject || ''}\n${data.body || ''}`;
        const allMissing = validateTemplatePlaceholders(templateText, requiredVars);
        if (/\{\{\s*(?:#|\/)|\|\||[^{}]*[^\w.\s][^{}]*\}\}/.test(templateText)) {
            return next(new AppError('Template contains unsupported syntax; use simple {{variable}} placeholders', 400));
        }

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
        const templateText = `${subject || ''}\n${body || ''}`;
        const allMissing = validateTemplatePlaceholders(templateText, requiredVars);
        if (/\{\{\s*(?:#|\/)|\|\||[^{}]*[^\w.\s][^{}]*\}\}/.test(templateText)) {
            return next(new AppError('Template contains unsupported syntax; use simple {{variable}} placeholders', 400));
        }

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
        if (req.user?.role === 'Marketing') {
            filters += ` AND event_type = $${param++}`;
            values.push('MarketingCampaign');
        }
        if (status)    { filters += ` AND status = $${param++}`; values.push(status); }
        if (eventType) { filters += ` AND event_type = $${param++}`; values.push(eventType); }

        const [result, countResult] = await Promise.all([
            db.query(
                `SELECT job_id, event_type, channel, recipient_type,
                        CASE WHEN $${param}::text = 'Marketing' THEN NULL ELSE recipient_id END AS recipient_id,
                        entity_type, entity_id, status, scheduled_for, processed_at,
                        notification_id,
                        CASE WHEN $${param}::text = 'Marketing' THEN NULL ELSE error_message END AS error_message,
                        retry_count, max_retries, created_at,
                        CASE WHEN $${param}::text = 'Marketing' THEN '{}'::jsonb ELSE variables END AS variables
                 FROM notification_jobs
                 WHERE 1=1 ${filters}
                 ORDER BY scheduled_for DESC, job_id DESC
                 LIMIT $${param + 1} OFFSET $${param + 2}`,
                [...values, req.user?.role || '', limit, offset]
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
            const patientContact = data.channel === 'Email'
                ? decrypt(p.rows[0].email_enc)
                : decrypt(p.rows[0].phone_enc);
            if (!patientContact) {
                return next(new AppError(`Patient ${data.channel} contact is unavailable`, 409));
            }
            if (contact && String(contact).trim().toLowerCase() !== String(patientContact).trim().toLowerCase()) {
                return next(new AppError('Recipient contact does not belong to the selected patient', 409));
            }
            contact = patientContact;
        }

        if (!contact) return next(new AppError('Could not resolve recipient contact', 400));

        await logAction(db, {
            userId: getUserId(req),
            action: 'NOTIFICATION_MANUAL_SEND_REQUESTED',
            resourceId: data.patientId || data.entityId || null,
            resourceTable: data.patientId ? 'patients' : (data.entityType || 'notifications'),
            ipAddress: req.ip,
            details: { channel: data.channel, eventType: 'ManualSend', patientBound: Boolean(data.patientId) },
            required: true
        });

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
                // sentBy belongs in the audit trail, not recipient_user_id. An
                // external manual dispatch must not become an inbox item for its
                // sender merely to give the delivery log an owner.
                recipientUserId: null,
                audienceType: data.patientId ? 'Patient' : 'Staff',
                priority: 'Action'
            }
        );

        if (!result.success) return next(new AppError('Failed to send notification', 500));
        await logAction(db, {
            userId: getUserId(req),
            action: 'NOTIFICATION_MANUAL_SEND_COMPLETED',
            resourceId: data.patientId || data.entityId || null,
            resourceTable: data.patientId ? 'patients' : (data.entityType || 'notifications'),
            ipAddress: req.ip,
            details: {
                channel: data.channel,
                eventType: 'ManualSend',
                notificationId: result.notificationId || null,
                patientBound: Boolean(data.patientId)
            },
            required: false
        });
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

        const result = patientId
            ? await db.query('SELECT * FROM notification_preferences WHERE patient_id = $1::uuid LIMIT 1', [patientId])
            : await db.query('SELECT * FROM notification_preferences WHERE doctor_id = $1::uuid LIMIT 1', [doctorId]);

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
            'notify_claim_update', 'notify_payment_update', 'time_zone',
            'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end'
        ]);

        const entries = Object.entries(data).filter(([k]) => allowedFields.has(k));
        if (entries.length === 0) return next(new AppError('No valid fields to update', 400));

        await db.query(`
            INSERT INTO notification_preferences (staff_user_id)
            VALUES ($1)
            ON CONFLICT DO NOTHING
        `, [userId]);

        const setClauses = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
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
            inappEnabled: 'inapp_enabled',
            notifyAppointmentCreated: 'notify_appointment_created',
            notifyAppointmentReminder: 'notify_appointment_reminder',
            notifyAppointmentRescheduled: 'notify_appointment_rescheduled',
            notifyAppointmentCancelled: 'notify_appointment_cancelled',
            notifyPrepInstructions: 'notify_prep_instructions',
            notifyPaymentDue: 'notify_payment_due',
            notifyReportReady: 'notify_report_ready',
            notifyResultDelivered: 'notify_result_delivered',
            notifyFollowupReminder: 'notify_followup_reminder',
            notifyMarketing: 'notify_marketing',
            quietHoursEnabled: 'quiet_hours_enabled',
            quietHoursStart: 'quiet_hours_start',
            quietHoursEnd: 'quiet_hours_end',
            timeZone: 'time_zone'
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

        const setClauses = sets.map((s, i) => `${s.col} = $${i + 2}`).join(', ');
        const vals = sets.map(s => s.val);

        if (patientId) {
            await db.query(
                `UPDATE notification_preferences SET ${setClauses}, updated_at = NOW() WHERE patient_id = $1::uuid`,
                [patientId, ...vals]
            );
        } else {
            await db.query(
                `UPDATE notification_preferences SET ${setClauses}, updated_at = NOW() WHERE doctor_id = $1::uuid`,
                [doctorId, ...vals]
            );
        }

        res.json({ message: 'Preferences updated' });
    } catch (error) {
        next(error);
    }
};

const sendReminder = (db) => async (req, res, next) => {
    try {
        const { appointmentId } = req.body;
        if (!appointmentId) return next(new AppError('Appointment is required', 400));

        const appointmentResult = await db.query(`
            SELECT a.appointment_id, a.patient_id, a.order_number, a.start_time, a.status,
                   p.email_enc, p.first_name_enc, p.last_name_enc
            FROM appointments a
            JOIN patients p ON p.patient_id = a.patient_id
            WHERE a.appointment_id = $1
            LIMIT 1
        `, [appointmentId]);
        const appointment = appointmentResult.rows[0];
        if (!appointment) return next(new AppError('Appointment not found', 404));
        if (!['Scheduled', 'Confirmed'].includes(appointment.status)) {
            return next(new AppError('Only scheduled or confirmed appointments can be reminded', 409));
        }
        if (!appointment.start_time || new Date(appointment.start_time) <= new Date()) {
            return next(new AppError('Appointment time must be in the future', 409));
        }
        const recipientEmail = decrypt(appointment.email_enc);
        if (!recipientEmail) return next(new AppError('Patient email is unavailable', 409));
        const patientName = [decrypt(appointment.first_name_enc), decrypt(appointment.last_name_enc)]
            .filter(Boolean).join(' ') || appointment.order_number;
        const time = appointment.start_time;

        const allSettings = await settingsService.getAll();
        const centerName = [allSettings['center.name'], allSettings['center.branch']].filter(Boolean).join(' - ') || 'Radiology Center';
        const subject = `Appointment Reminder: ${patientName}`;
        const body = `Dear ${patientName},\n\nThis is a reminder for your appointment at ${centerName} scheduled for ${new Date(time).toLocaleString()}.\n\nPlease arrive 15 minutes early.\n\nRegards,\n${centerName} Team`;

        await logAction(db, {
            userId: getUserId(req),
            action: 'APPOINTMENT_REMINDER_MANUAL_SEND_REQUESTED',
            resourceId: appointmentId,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: { channel: 'Email' },
            required: true
        });

        const result = await dispatch('Email', recipientEmail, subject, body, db, {
            eventType: 'ManualReminder',
            entityType: 'Appointment',
            entityId: appointmentId,
            patientId: appointment.patient_id,
            audienceType: 'Patient',
            variables: {
                patient_name: patientName,
                order_number: appointment.order_number,
                appointment_time: new Date(time).toLocaleString()
            },
            priority: 'Action'
        });
        if (result.success) {
            await logAction(db, {
                userId: getUserId(req),
                action: 'APPOINTMENT_REMINDER_MANUAL_SEND_COMPLETED',
                resourceId: appointmentId,
                resourceTable: 'appointments',
                ipAddress: req.ip,
                details: { notificationId: result.notificationId || null, channel: 'Email' },
                required: false
            });
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
        const { phone, email, token } = req.body;
        const contact = email || phone;
        const channel = email ? 'Email' : 'SMS';
        const response = {
            message: 'If the unsubscribe request was valid, marketing preferences have been updated.'
        };

        if (!verifyUnsubscribeToken({ token, contact, channel })) {
            return res.json(response);
        }

        const contactHash = hash(String(contact).trim().toLowerCase());
        const contactHashColumn = email ? 'email_hash' : 'phone_hash';
        await db.query(`
            WITH target AS (
                SELECT patient_id
                FROM patients
                WHERE ${contactHashColumn} = $1
                LIMIT 1
            ), updated_patient AS (
                UPDATE patients p
                SET opt_in_marketing = FALSE,
                    consent_marketing = FALSE
                FROM target
                WHERE p.patient_id = target.patient_id
                RETURNING p.patient_id
            )
            INSERT INTO notification_preferences (patient_id, notify_marketing)
            SELECT patient_id, FALSE
            FROM updated_patient
            ON CONFLICT (patient_id) WHERE patient_id IS NOT NULL
            DO UPDATE SET notify_marketing = FALSE, updated_at = NOW()
        `, [contactHash]);

        res.json(response);
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
    queued: 'Pending',
    accepted: 'Pending',
    scheduled: 'Pending',
    sending: 'Pending',
    sent: 'Sent',
    delivered: 'Delivered',
    failed: 'Failed',
    undelivered: 'Failed',
};

const applyTwilioDeliveryReceipt = async (db, { MessageSid, MessageStatus }) => {
    const mappedStatus = TWILIO_STATUS_MAP[String(MessageStatus || '').toLowerCase()];
    if (!MessageSid || !mappedStatus) return { updated: 0, status: mappedStatus || null };

    const result = await db.query(`
        UPDATE notifications
        SET status = $1,
            error_message = CASE
                WHEN $1::text = 'Failed' THEN COALESCE(error_message, 'Provider delivery failed')
                WHEN $1::text = 'Delivered' THEN NULL
                ELSE error_message
            END
        WHERE provider_message_id = $2
          AND (
              ($1::text = 'Pending' AND status = 'Pending')
              OR ($1::text = 'Sent' AND status IN ('Pending', 'Sent'))
              OR ($1::text = 'Delivered' AND status <> 'Delivered')
              OR ($1::text = 'Failed' AND status NOT IN ('Delivered', 'Failed'))
          )
        RETURNING notification_id
    `, [mappedStatus, MessageSid]);

    for (const row of result.rows) {
        await db.query(`
            UPDATE notification_jobs
            SET status = CASE
                    WHEN $1::text = 'Failed' THEN 'Failed'
                    WHEN $1::text IN ('Sent', 'Delivered') THEN 'Sent'
                    ELSE status
                END,
                processed_at = CASE
                    WHEN $1::text IN ('Sent', 'Delivered', 'Failed') THEN COALESCE(processed_at, NOW())
                    ELSE processed_at
                END,
                error_message = CASE
                    WHEN $1::text = 'Failed' THEN COALESCE(error_message, 'Provider delivery failed')
                    WHEN $1::text = 'Delivered' THEN NULL
                    ELSE error_message
                END
            WHERE notification_id = $2
              AND status NOT IN ('Cancelled', 'Skipped')
        `, [mappedStatus, row.notification_id]);
        await notifyClients(db, row.notification_id);
    }

    return { updated: result.rowCount || result.rows.length, status: mappedStatus };
};

const validateTwilioSignature = (req) => {
    if (req.webhookSignatureVerified === 'Twilio') return true;
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

    try {
        await applyTwilioDeliveryReceipt(db, req.body || {});
        return res.sendStatus(204);
    } catch (err) {
        console.error('[TwilioWebhook] DB error:', err.message);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
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
    handleTwilioWebhook,
    applyTwilioDeliveryReceipt
};
