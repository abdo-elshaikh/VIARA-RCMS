const realtimeService = require('../services/realtimeService');
const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');
const { cleanupUploadedFiles, parseAttachments } = require('../utils/chatAttachmentUpload');
const { triggerEventForRole } = require('../services/notificationJobService');

const allowedMessageKinds = new Set(['text', 'sticker', 'attachment']);
const externalInboxRoles = new Set(['Admin', 'Receptionist', 'Marketing', 'Developer']);
const MAX_MESSAGE_LENGTH = 4000;

const sanitizeText = (value) => String(value || '').replace(/<\/?[^>]+(>|$)/g, '').trim();

const getRichMessagePayload = (req) => {
    const body = typeof req.body?.body === 'string' ? sanitizeText(req.body.body) : '';
    const attachments = parseAttachments(req.files || []);
    const requestedKind = typeof (req.body?.messageKind || req.body?.message_kind) === 'string'
        ? (req.body.messageKind || req.body.message_kind)
        : 'text';
    const messageKind = attachments.length > 0
        ? 'attachment'
        : allowedMessageKinds.has(requestedKind)
            ? requestedKind
            : 'text';

    if (!body && attachments.length === 0) {
        throw new AppError('Message body or attachment is required', 400);
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
        throw new AppError(`Message body must not exceed ${MAX_MESSAGE_LENGTH} characters`, 400);
    }

    return { body, messageKind, attachments };
};

const getMyMessages = (db) => async (req, res, next) => {
    try {
        const patientId = req.user.userId; // Matches decoded.userId from patient JWT

        const result = await db.query(`
            SELECT ppm.*, u.full_name AS staff_name
            FROM patient_portal_messages ppm
            LEFT JOIN users u ON ppm.staff_user_id = u.user_id
            WHERE ppm.patient_id = $1
            ORDER BY ppm.created_at ASC
            LIMIT 150
        `, [patientId]);

        // Mark incoming messages as read
        await db.query(`
            UPDATE patient_portal_messages
            SET is_read = TRUE, read_at = NOW()
            WHERE patient_id = $1 AND sender_role = 'Staff' AND is_read = FALSE
        `, [patientId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const sendPortalMessage = (db) => async (req, res, next) => {
    try {
        const patientId = req.user.userId;
        const { appointmentId } = req.body;
        const { body, messageKind, attachments } = getRichMessagePayload(req);

        const result = await db.query(`
            INSERT INTO patient_portal_messages (patient_id, sender_role, body, appointment_id, message_kind, attachments)
            VALUES ($1, 'Patient', $2, $3, $4, $5::jsonb)
            RETURNING *
        `, [patientId, body, appointmentId || null, messageKind, JSON.stringify(attachments)]);

        const message = result.rows[0];

        // Fetch patient name details
        const patientInfo = await db.query(`
            SELECT first_name_enc, last_name_enc, mrn FROM patients WHERE patient_id = $1
        `, [patientId]);

        const decryptOptional = (value) => {
            if (!value) return '';
            try {
                return decrypt(value);
            } catch (_) {
                return value;
            }
        };

        const firstName = decryptOptional(patientInfo.rows[0]?.first_name_enc);
        const lastName = decryptOptional(patientInfo.rows[0]?.last_name_enc);
        const fullName = `${firstName} ${lastName}`.trim();

        const payload = {
            ...message,
            patient_name: fullName,
            patient_mrn: patientInfo.rows[0]?.mrn
        };

        // Notify staff (reception/admins) in real-time
        realtimeService.broadcastToStaffMatching(
            client => externalInboxRoles.has(client.role),
            'NEW_PATIENT_MESSAGE_ALERT',
            payload
        );

        const notificationPayload = {
            entityType: 'Message',
            entityId: message.message_id,
            priority: 'Normal',
            variables: {
                sender_name: fullName || 'Patient',
                message_preview: body ? (body.length > 100 ? `${body.slice(0, 97)}...` : body) : 'Attachment'
            }
        };
        for (const role of externalInboxRoles) {
            triggerEventForRole(db, 'ChatMessageReceived', role, notificationPayload).catch(() => {});
        }

        res.status(201).json(payload);
    } catch (error) {
        cleanupUploadedFiles(req.files);
        next(error);
    }
};

module.exports = {
    getMyMessages,
    sendPortalMessage
};
