/**
 * notificationService.js
 * Multi-channel notification dispatcher with pluggable adapters.
 * Channels: Email (nodemailer), SMS (stub/pluggable), WhatsApp (stub/pluggable), InApp (SSE)
 */
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { encrypt } = require('../utils/crypto');

// ─── Email Transporter ───────────────────────────────────────────────────────

const transporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    })
    : nodemailer.createTransport({ jsonTransport: true }); // dev/mock mode

// ─── Template engine ─────────────────────────────────────────────────────────

const getTemplateValue = (variables, path) => String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, key) => (value !== null && value !== undefined ? value[key] : undefined), variables);

const formatTemplateValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

/**
 * Render the deliberately small notification-template language without eval.
 * Supported forms are {{path.to.value}}, {{value || "fallback"}}, and
 * {{#if value}}...{{/if}}. Unknown or unsupported expressions are removed so
 * template source is never exposed to a recipient.
 */
const renderTemplate = (text, variables = {}) => {
    if (!text) return '';

    let rendered = String(text);
    const conditionalPattern = /\{\{#if\s+([\w.-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    let previous;
    let iterations = 0;
    do {
        previous = rendered;
        rendered = rendered.replace(conditionalPattern, (_, path, content) => (
            getTemplateValue(variables, path) ? content : ''
        ));
        iterations += 1;
    } while (rendered !== previous && iterations < 10 && rendered.includes('{{#if'));

    rendered = rendered.replace(
        /\{\{\s*([\w.-]+)\s*\|\|\s*(["'])(.*?)\2\s*\}\}/g,
        (_, path, _quote, fallback) => {
            const value = getTemplateValue(variables, path);
            return value === null || value === undefined || value === ''
                ? fallback
                : formatTemplateValue(value);
        }
    );

    rendered = rendered.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, path) => (
        formatTemplateValue(getTemplateValue(variables, path))
    ));

    return rendered.replace(/\{\{[\s\S]*?\}\}/g, '');
};

const getAudienceType = (context = {}) => {
    if (context.audienceType) return context.audienceType;
    if (context.patientId) return 'Patient';
    if (context.doctorId || context.referringDoctorId) return 'Doctor';
    if (context.recipientUserId || context.audienceRole) return 'Staff';
    return null;
};

const getNotificationContextValues = (context = {}) => {
    const audienceType = getAudienceType(context);
    if (!audienceType) {
        throw new Error('Persisted notifications require an explicit audience');
    }
    return [
        context.doctorId || context.referringDoctorId || null,
        context.recipientUserId || null,
        audienceType,
        context.audienceRole || null,
        context.priority || 'Normal'
    ];
};

const computeActionUrl = (item = {}, context = {}) => {
    if (context.actionUrl) return context.actionUrl;
    if (item.action_url) return item.action_url;

    const event = String(item.event_type || context.eventType || '').toUpperCase();
    const entityId = item.entity_id || context.entityId;
    const patientId = item.patient_id || context.patientId;
    const audienceType = item.audience_type || getAudienceType(context);
    const audienceRole = item.audience_role || context.audienceRole || '';

    if (audienceType === 'Patient') {
        if (event.includes('REPORT') || event.includes('RESULT') || event.includes('EXAM')) {
            return entityId
                ? `/patient/dashboard?tab=records&examId=${encodeURIComponent(entityId)}`
                : '/patient/dashboard?tab=records';
        }
        if (event.includes('INVOICE') || event.includes('PAYMENT') || event.includes('BILLING') || event.includes('REFUND')) {
            return '/patient/dashboard?tab=invoices';
        }
        if (event.includes('APPOINTMENT') || event.includes('WAITLIST') || event.includes('BOOKING')) {
            return '/patient/dashboard?tab=requests';
        }
        if (event.includes('DOCUMENT')) return '/patient/dashboard?tab=documents';
        if (event.includes('CHAT') || event.includes('MESSAGE')) return '/patient/dashboard?tab=messages';
        return '/patient/dashboard?tab=notifications';
    }

    if (audienceType === 'Doctor') {
        if (event.includes('REPORT') || event.includes('RESULT') || event.includes('EXAM') || event.includes('CRITICAL')) {
            return entityId
                ? `/doctor/dashboard?tab=cases&examId=${encodeURIComponent(entityId)}`
                : '/doctor/dashboard?tab=cases';
        }
        if (event.includes('CHAT') || event.includes('MESSAGE')) return '/doctor/dashboard?tab=messages';
        return '/doctor/dashboard?tab=notifications';
    }

    if (event.includes('PARTIALPAYMENTEXCEPTION')) {
        if (audienceRole === 'Nurse') return '/nurse';
        if (audienceRole === 'Technician') return '/modality';
        if (audienceRole === 'Accountant' || audienceRole === 'Admin') return '/approvals';
        if (audienceRole === 'Cashier') return '/reception?tab=cashier';
        return '/reception?tab=schedule';
    }

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

// ─── Realtime Push Dispatcher ────────────────────────────────────────────────

const notifyClients = async (db, notificationId) => {
    try {
        const { rows } = await db.query(`
            SELECT n.*, p.mrn AS patient_mrn
            FROM notifications n
            LEFT JOIN patients p ON n.patient_id = p.patient_id
            WHERE n.notification_id = $1
        `, [notificationId]);

        if (rows.length === 0) return;

        const notification = rows[0];

        // Decrypt values if encrypted
        const { decrypt } = require('../utils/crypto');
        const decryptStored = value => {
            if (!value || (!String(value).startsWith('v2:') && !/^[0-9a-f]+:[0-9a-f]+$/i.test(value))) return value;
            try {
                return decrypt(value);
            } catch (_) {
                return value;
            }
        };

        const actionUrl = computeActionUrl(notification);

        const decryptedPayload = {
            ...notification,
            recipient: decryptStored(notification.recipient),
            subject: decryptStored(notification.subject),
            content: decryptStored(notification.content),
            action_url: actionUrl
        };

        const realtimeService = require('./realtimeService');

        // Push notification in real-time
        if (notification.channel === 'InApp') {
            if (notification.recipient_user_id) {
                realtimeService.sendToUser(notification.recipient_user_id, 'NEW_NOTIFICATION', decryptedPayload);
            } else if (notification.audience_role) {
                realtimeService.sendToRole(notification.audience_role, 'NEW_NOTIFICATION', decryptedPayload);
            } else if (decryptedPayload.recipient === 'inventory-team') {
                realtimeService.broadcastToStaff('NEW_NOTIFICATION', decryptedPayload);
            } else if (notification.patient_id) {
                realtimeService.sendToPatient(notification.patient_id, 'NEW_NOTIFICATION', decryptedPayload);
            } else if (notification.referring_doctor_id) {
                realtimeService.sendToDoctor(notification.referring_doctor_id, 'NEW_NOTIFICATION', decryptedPayload);
            } else if (notification.audience_type === 'Global') {
                realtimeService.broadcastToStaff('NEW_NOTIFICATION', decryptedPayload);
            } else {
                console.warn('[NotificationRealtimePushSkipped] In-app notification has no explicit audience', notification.notification_id);
            }
        } else {
            // External-channel delivery logs may contain patient contact details and
            // message bodies. Staff clients only need a cache-invalidation signal;
            // never broadcast the decrypted record itself.
            realtimeService.broadcastToStaff('NOTIFICATION_LOG_UPDATE', {
                notification_id: notification.notification_id,
                channel: notification.channel,
                status: notification.status,
                event_type: notification.event_type,
                created_at: notification.created_at
            });
        }
    } catch (err) {
        console.error('[NotificationRealtimePushError]', err.message);
    }
};

// ─── Channel Adapters ─────────────────────────────────────────────────────────

const sendEmail = async (to, subject, body, db, context = {}) => {
    const resolvedSubject = renderTemplate(subject, context.variables || {});
    const resolvedBody = renderTemplate(body, context.variables || {});
    let notificationContextValues = null;

    try {
        notificationContextValues = db ? getNotificationContextValues(context) : null;
        if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
            throw new Error('Email provider is not configured');
        }
        const info = await transporter.sendMail({
            from: `"${process.env.CENTER_NAME || 'VIARA'}" <${process.env.SMTP_FROM || 'noreply@VIARA.com'}>`,
            to,
            subject: resolvedSubject,
            text: resolvedBody
        });

        const isReal = !!process.env.SMTP_HOST;
        const notifType = isReal ? 'Email' : 'Email_Stub';

        if (db) {
            const result = await db.query(`
                INSERT INTO notifications
                    (recipient, type, channel, subject, content, status, event_type, entity_id, patient_id,
                     referring_doctor_id, recipient_user_id, audience_type, audience_role, priority, sent_at)
                VALUES ($1, $2, 'Email', $3, $4, 'Sent', $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                RETURNING notification_id
            `, [
                encrypt(to), notifType,
                encrypt(resolvedSubject),
                encrypt(resolvedBody),
                context.eventType || null,
                context.entityId || null,
                context.patientId || null,
                ...notificationContextValues
            ]);
            const notificationId = result.rows[0].notification_id;
            await notifyClients(db, notificationId);
            return { success: true, messageId: info.messageId, notificationId };
        }
        return { success: true, messageId: info.messageId };
    } catch (error) {
        if (db && notificationContextValues) {
            const result = await db.query(`
                INSERT INTO notifications
                    (recipient, type, channel, subject, content, status, event_type, entity_id, patient_id,
                     referring_doctor_id, recipient_user_id, audience_type, audience_role, priority, error_message)
                VALUES ($1, 'Email', 'Email', $2, $3, 'Failed', $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING notification_id
            `, [
                encrypt(to), encrypt(resolvedSubject), encrypt(resolvedBody),
                context.eventType || null, context.entityId || null, context.patientId || null,
                ...notificationContextValues,
                error.message
            ]);
            const notificationId = result.rows[0]?.notification_id;
            if (notificationId) await notifyClients(db, notificationId);
        }
        return { success: false, error: error.message };
    }
};

const sendSms = async (to, body, db, context = {}) => {
    const resolvedBody = renderTemplate(body, context.variables || {});
    let success = false;
    let errorMsg = null;
    let providerMessageId = null;
    let isStub = false;
    let notificationContextValues = null;

    try {
        notificationContextValues = db ? getNotificationContextValues(context) : null;
    } catch (error) {
        return { success: false, error: error.message };
    }

    if (db) {
        try {
            const IntegrationService = require('../services/integrationService');
            const integrationService = new IntegrationService(db);
            const result = await integrationService.sendSMS(to, resolvedBody, {
                idempotencyKey: context.idempotencyKey,
                eventType: context.eventType,
                entityId: context.entityId,
                patientId: context.patientId,
                recipientUserId: context.recipientUserId,
                audienceType: context.audienceType,
                audienceRole: context.audienceRole,
                priority: context.priority
            });
            success = result.success;
            errorMsg = result.error;
            providerMessageId = result.providerMessageId;
            isStub = result.deduped;
        } catch (error) {
            errorMsg = error.message;
        }
    }

    const notifType = isStub ? 'SMS_Stub' : 'SMS';
    const status = success ? 'Sent' : 'Failed';

    if (db) {
        const result = await db.query(`
            INSERT INTO notifications
                (recipient, type, channel, content, status, event_type, entity_id, patient_id,
                 referring_doctor_id, recipient_user_id, audience_type, audience_role, priority,
                 error_message, provider_message_id, sent_at)
            VALUES ($1, $2, 'SMS', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                    CASE WHEN $4::text = 'Sent' THEN NOW() ELSE NULL END)
            RETURNING notification_id
        `, [
            encrypt(to), notifType, encrypt(resolvedBody), status,
            context.eventType || null, context.entityId || null, context.patientId || null,
            ...notificationContextValues,
            errorMsg, providerMessageId
        ]);
        const notificationId = result.rows[0]?.notification_id;
        if (notificationId) await notifyClients(db, notificationId);
        return { success, error: errorMsg, notificationId };
    }
    return { success, error: errorMsg };
};

const sendWhatsApp = async (to, body, db, context = {}) => {
    const resolvedBody = renderTemplate(body, context.variables || {});
    let success = false;
    let errorMsg = null;
    let providerMessageId = null;
    let isStub = false;
    let notificationContextValues = null;

    try {
        notificationContextValues = db ? getNotificationContextValues(context) : null;
    } catch (error) {
        return { success: false, error: error.message };
    }

    if (db) {
        try {
            const IntegrationService = require('../services/integrationService');
            const integrationService = new IntegrationService(db);
            const result = await integrationService.sendWhatsApp(to, resolvedBody, {
                idempotencyKey: context.idempotencyKey,
                eventType: context.eventType,
                entityId: context.entityId,
                patientId: context.patientId,
                recipientUserId: context.recipientUserId,
                audienceType: context.audienceType,
                audienceRole: context.audienceRole,
                priority: context.priority
            });
            success = result.success;
            errorMsg = result.error;
            providerMessageId = result.providerMessageId;
            isStub = result.deduped;
        } catch (error) {
            errorMsg = error.message;
        }
    }

    const notifType = isStub ? 'WhatsApp_Stub' : 'WhatsApp';
    const status = success ? 'Sent' : 'Failed';

    if (db) {
        const result = await db.query(`
            INSERT INTO notifications
                (recipient, type, channel, content, status, event_type, entity_id, patient_id,
                 referring_doctor_id, recipient_user_id, audience_type, audience_role, priority,
                 error_message, provider_message_id, sent_at)
            VALUES ($1, $2, 'WhatsApp', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                    CASE WHEN $4::text = 'Sent' THEN NOW() ELSE NULL END)
            RETURNING notification_id
        `, [
            encrypt(to), notifType, encrypt(resolvedBody), status,
            context.eventType || null, context.entityId || null, context.patientId || null,
            ...notificationContextValues,
            errorMsg, providerMessageId
        ]);
        const notificationId = result.rows[0]?.notification_id;
        if (notificationId) await notifyClients(db, notificationId);
        return { success, error: errorMsg, notificationId };
    }
    return { success, error: errorMsg };
};

const sendInApp = async (to, subject, body, db, context = {}) => {
    const resolvedSubject = renderTemplate(subject, context.variables || {});
    const resolvedBody = renderTemplate(body, context.variables || {});

    try {
        const notificationContextValues = db ? getNotificationContextValues(context) : null;
        if (db) {
            const result = await db.query(`
                INSERT INTO notifications
                    (recipient, type, channel, subject, content, status, event_type, entity_id, patient_id,
                     referring_doctor_id, recipient_user_id, audience_type, audience_role, priority, sent_at)
                VALUES ($1, 'InApp', 'InApp', $2, $3, 'Sent', $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                RETURNING notification_id
            `, [
                encrypt(to),
                encrypt(resolvedSubject),
                encrypt(resolvedBody),
                context.eventType || null,
                context.entityId || null,
                context.patientId || null,
                ...notificationContextValues
            ]);
            const notificationId = result.rows[0].notification_id;
            await notifyClients(db, notificationId);
            return { success: true, notificationId };
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// ─── Unified dispatcher ───────────────────────────────────────────────────────

const dispatch = async (channel, to, subject, body, db, context = {}) => {
    if (!to) return { success: false, error: 'No recipient contact' };
    switch (channel) {
        case 'Email': return sendEmail(to, subject, body, db, context);
        case 'SMS': return sendSms(to, body, db, context);
        case 'WhatsApp': return sendWhatsApp(to, body, db, context);
        case 'InApp': return sendInApp(to, subject, body, db, context);
        default: return { success: false, error: `Unknown channel: ${channel}` };
    }
};

module.exports = { sendEmail, sendSms, sendWhatsApp, sendInApp, dispatch, renderTemplate, notifyClients, computeActionUrl };
