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

/**
 * Replace {{variable}} placeholders with values from the variables object.
 */
const renderTemplate = (text, variables = {}) => {
    if (!text) return '';
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
};

const getAudienceType = (context = {}) => {
    if (context.audienceType) return context.audienceType;
    if (context.patientId) return 'Patient';
    if (context.doctorId || context.referringDoctorId) return 'Doctor';
    if (context.recipientUserId || context.audienceRole) return 'Staff';
    return 'Global';
};

const getNotificationContextValues = (context = {}) => [
    context.doctorId || context.referringDoctorId || null,
    context.recipientUserId || null,
    getAudienceType(context),
    context.audienceRole || null,
    context.priority || 'Normal'
];

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

        const decryptedPayload = {
            ...notification,
            recipient: decryptStored(notification.recipient),
            subject: decryptStored(notification.subject),
            content: decryptStored(notification.content)
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
            } else {
                realtimeService.broadcastToStaff('NEW_NOTIFICATION', decryptedPayload);
            }
        } else {
            // Email/SMS/WhatsApp logs update
            realtimeService.broadcastToStaff('NOTIFICATION_LOG_UPDATE', decryptedPayload);
        }
    } catch (err) {
        console.error('[NotificationRealtimePushError]', err.message);
    }
};

// ─── Channel Adapters ─────────────────────────────────────────────────────────

const sendEmail = async (to, subject, body, db, context = {}) => {
    const resolvedSubject = renderTemplate(subject, context.variables || {});
    const resolvedBody = renderTemplate(body, context.variables || {});

    try {
        if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
            throw new Error('Email provider is not configured');
        }
        const info = await transporter.sendMail({
            from: `"${process.env.CENTER_NAME || 'RCMS'}" <${process.env.SMTP_FROM || 'noreply@rcms.com'}>`,
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
                ...getNotificationContextValues(context)
            ]);
            const notificationId = result.rows[0].notification_id;
            await notifyClients(db, notificationId);
            return { success: true, messageId: info.messageId, notificationId };
        }
        return { success: true, messageId: info.messageId };
    } catch (error) {
        if (db) {
            const result = await db.query(`
                INSERT INTO notifications
                    (recipient, type, channel, subject, content, status, event_type, entity_id, patient_id,
                     referring_doctor_id, recipient_user_id, audience_type, audience_role, priority, error_message)
                VALUES ($1, 'Email', 'Email', $2, $3, 'Failed', $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING notification_id
            `, [
                encrypt(to), encrypt(resolvedSubject), encrypt(resolvedBody),
                context.eventType || null, context.entityId || null, context.patientId || null,
                ...getNotificationContextValues(context),
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

    const provider = process.env.SMS_PROVIDER?.toLowerCase();
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM;
    let success = false;
    let errorMsg = null;
    let isStub = false;
    let providerMessageId = null;

    if (!provider) {
        if (process.env.NODE_ENV === 'production') {
            errorMsg = 'SMS provider is not configured';
        } else {
            console.log('[SMS_STUB] Redacted development notification');
            success = true;
            isStub = true;
        }
    } else if (provider !== 'twilio') {
        errorMsg = `Unsupported SMS provider: ${provider}`;
    } else if (!accountSid || !authToken || !from) {
        errorMsg = 'Twilio SMS is configured but required credentials are missing';
    } else {
        try {
            const message = await twilio(accountSid, authToken, { timeout: 10000, autoRetry: true, maxRetries: 2 })
                .messages.create({ body: resolvedBody, from, to });
            providerMessageId = message.sid || null;
            success = true;
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
                    CASE WHEN $4 = 'Sent' THEN NOW() ELSE NULL END)
            RETURNING notification_id
        `, [
            encrypt(to), notifType, encrypt(resolvedBody), status,
            context.eventType || null, context.entityId || null, context.patientId || null,
            ...getNotificationContextValues(context),
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
    const provider = process.env.WHATSAPP_PROVIDER?.toLowerCase();
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;
    const configuredFrom = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM;
    let success = false;
    let errorMsg = null;
    let isStub = false;
    let providerMessageId = null;

    if (!provider) {
        if (process.env.NODE_ENV === 'production') {
            errorMsg = 'WhatsApp provider is not configured';
        } else {
            console.log('[WhatsApp_STUB] Redacted development notification');
            success = true;
            isStub = true;
        }
    } else if (provider !== 'twilio') {
        errorMsg = `Unsupported WhatsApp provider: ${provider}`;
    } else if (!accountSid || !authToken || !configuredFrom) {
        errorMsg = 'Twilio WhatsApp is configured but required credentials are missing';
    } else {
        try {
            const from = configuredFrom.startsWith('whatsapp:') ? configuredFrom : `whatsapp:${configuredFrom}`;
            const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
            const message = await twilio(accountSid, authToken, { timeout: 10000, autoRetry: true, maxRetries: 2 })
                .messages.create({ body: resolvedBody, from, to: recipient });
            providerMessageId = message.sid || null;
            success = true;
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
                    CASE WHEN $4 = 'Sent' THEN NOW() ELSE NULL END)
            RETURNING notification_id
        `, [
            encrypt(to), notifType, encrypt(resolvedBody), status,
            context.eventType || null, context.entityId || null, context.patientId || null,
            ...getNotificationContextValues(context),
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
                ...getNotificationContextValues(context)
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
        case 'Email':    return sendEmail(to, subject, body, db, context);
        case 'SMS':      return sendSms(to, body, db, context);
        case 'WhatsApp': return sendWhatsApp(to, body, db, context);
        case 'InApp':    return sendInApp(to, subject, body, db, context);
        default:         return { success: false, error: `Unknown channel: ${channel}` };
    }
};

module.exports = { sendEmail, sendSms, sendWhatsApp, sendInApp, dispatch, renderTemplate, notifyClients };
