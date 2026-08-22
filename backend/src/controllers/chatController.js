const realtimeService = require('../services/realtimeService');
const { AppError } = require('../middleware/errorHandler');
const { cleanupUploadedFiles, parseAttachments } = require('../utils/chatAttachmentUpload');
const { triggerEventForRole } = require('../services/notificationJobService');

const allowedMessageKinds = new Set(['text', 'sticker', 'attachment']);

const attachmentPreviewSql = (alias) => `
    COALESCE(
        NULLIF(${alias}.body, ''),
        CASE
            WHEN ${alias}.message_kind = 'sticker' THEN 'Sticker'
            WHEN jsonb_array_length(COALESCE(${alias}.attachments, '[]'::jsonb)) > 0
                THEN CASE
                    WHEN COALESCE(${alias}.attachments, '[]'::jsonb) @> '[{"kind":"image"}]'::jsonb THEN 'Image'
                    ELSE 'File'
                END
            ELSE ''
        END
    )
`;

const sanitizeText = (value) => String(value || '').replace(/<\/?[^>]+(>|$)/g, '').trim();

const getRichMessagePayload = (req) => {
    const body = typeof req.body?.body === 'string' ? sanitizeText(req.body.body) : '';
    const attachments = parseAttachments(req.files || []);
    const requestedKind = typeof req.body?.messageKind === 'string' ? req.body.messageKind : 'text';
    const messageKind = attachments.length > 0
        ? 'attachment'
        : allowedMessageKinds.has(requestedKind)
            ? requestedKind
            : 'text';

    if (!body && attachments.length === 0) {
        throw new AppError('Message body or attachment is required', 400);
    }

    return { body, messageKind, attachments };
};

// ─── Staff-to-Staff Chat Controllers ──────────────────────────────────────────

const getChatUsers = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;

        const result = await db.query(`
            SELECT u.user_id, u.full_name, u.email, u.role, u.is_active,
                   COALESCE(unread.count, 0)::integer AS unread_count,
                   ${attachmentPreviewSql('last_message')} AS last_message_body,
                   last_message.created_at AS last_message_at,
                   last_message.sender_id AS last_message_sender_id
            FROM users u
            LEFT JOIN (
                SELECT sender_id, COUNT(*) AS count
                FROM staff_messages
                WHERE recipient_id = $1 AND is_read = FALSE
                GROUP BY sender_id
            ) unread ON u.user_id = unread.sender_id
            LEFT JOIN LATERAL (
                SELECT body, message_kind, attachments, created_at, sender_id
                FROM staff_messages sm
                WHERE (sm.sender_id = $1 AND sm.recipient_id = u.user_id)
                   OR (sm.sender_id = u.user_id AND sm.recipient_id = $1)
                ORDER BY sm.created_at DESC
                LIMIT 1
            ) last_message ON TRUE
            WHERE u.is_active = TRUE AND u.user_id != $1
            ORDER BY last_message.created_at DESC NULLS LAST, u.full_name ASC
        `, [currentUserId]);

        const onlineUserIds = realtimeService.getOnlineUserIds();
        
        const users = result.rows.map(user => ({
            ...user,
            isOnline: onlineUserIds.includes(user.user_id)
        }));

        res.json(users);
    } catch (error) {
        next(error);
    }
};

const getChatMessages = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const { recipientId, channelName } = req.query;

        if (!recipientId && !channelName) {
            return next(new AppError('recipientId or channelName is required', 400));
        }

        let query = '';
        let params = [];

        if (recipientId) {
            query = `
                SELECT sm.*, 
                       u1.full_name AS sender_name, u1.role AS sender_role,
                       u2.full_name AS recipient_name, u2.role AS recipient_role
                FROM staff_messages sm
                JOIN users u1 ON sm.sender_id = u1.user_id
                JOIN users u2 ON sm.recipient_id = u2.user_id
                WHERE (sm.sender_id = $1 AND sm.recipient_id = $2)
                   OR (sm.sender_id = $2 AND sm.recipient_id = $1)
                ORDER BY sm.created_at ASC
                LIMIT 150
            `;
            params = [currentUserId, recipientId];
            
            // Mark messages from the other user as read
            await db.query(`
                UPDATE staff_messages
                SET is_read = TRUE, read_at = NOW()
                WHERE sender_id = $2 AND recipient_id = $1 AND is_read = FALSE
            `, [currentUserId, recipientId]);
        } else {
            query = `
                SELECT sm.*, 
                       u.full_name AS sender_name, u.role AS sender_role
                FROM staff_messages sm
                JOIN users u ON sm.sender_id = u.user_id
                WHERE sm.channel_name = $1
                ORDER BY sm.created_at ASC
                LIMIT 150
            `;
            params = [channelName];
        }

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const sendChatMessage = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const { recipientId, channelName } = req.body;
        const { body, messageKind, attachments } = getRichMessagePayload(req);

        if (!recipientId && !channelName) {
            return next(new AppError('recipientId or channelName must be specified', 400));
        }

        const result = await db.query(`
            INSERT INTO staff_messages (sender_id, recipient_id, channel_name, body, message_kind, attachments)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING *
        `, [currentUserId, recipientId || null, channelName || null, body, messageKind, JSON.stringify(attachments)]);

        const message = result.rows[0];

        // Fetch sender info for real-time delivery
        const senderInfo = await db.query(`
            SELECT full_name AS sender_name, role AS sender_role 
            FROM users WHERE user_id = $1
        `, [currentUserId]);
        
        const payload = {
            ...message,
            sender_name: senderInfo.rows[0]?.sender_name,
            sender_role: senderInfo.rows[0]?.sender_role
        };

        if (recipientId) {
            // Push to both sender and receiver (covers multi-tab sync)
            realtimeService.sendToUser(recipientId, 'NEW_STAFF_MESSAGE', payload);
            realtimeService.sendToUser(currentUserId, 'NEW_STAFF_MESSAGE', payload);
        } else {
            // Channel message broadcast
            realtimeService.broadcastToStaff('NEW_STAFF_MESSAGE', payload);
        }

        triggerEventForRole(db, 'ChatMessageReceived', 'Admin', {
            priority: 'Normal',
            variables: {
                sender_name: senderInfo.rows[0]?.sender_name || 'Unknown',
                message_preview: body.length > 100 ? body.slice(0, 97) + '...' : body
            }
        }).catch(() => {});

        res.status(201).json(payload);
    } catch (error) {
        next(error);
    }
};

// ─── Unread Summary (for the floating chat bubble badge) ──────────────────────

const getUnreadSummary = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;

        const [staffRes, patientRes, doctorRes] = await Promise.all([
            db.query(`
                SELECT COUNT(*)::int AS count
                FROM staff_messages
                WHERE recipient_id = $1 AND is_read = FALSE
            `, [currentUserId]),
            db.query(`
                SELECT COUNT(*)::int AS count
                FROM patient_portal_messages
                WHERE sender_role = 'Patient' AND is_read = FALSE
            `),
            db.query(`
                SELECT COUNT(*)::int AS count
                FROM doctor_portal_messages
                WHERE sender_role = 'Doctor' AND is_read = FALSE
            `)
        ]);

        const staff = staffRes.rows[0]?.count || 0;
        const patient = patientRes.rows[0]?.count || 0;
        const doctor = doctorRes.rows[0]?.count || 0;

        res.json({
            staff,
            patient,
            doctor,
            total: staff + patient + doctor
        });
    } catch (error) {
        next(error);
    }
};

// ─── Patient-to-Staff Messaging Controllers (Staff Inbox View) ────────────────

const getPatientConversations = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT * FROM (
                SELECT DISTINCT ON (ppm.patient_id)
                    ppm.patient_id,
                    ${attachmentPreviewSql('ppm')} AS last_message_body,
                    ppm.created_at AS last_message_at,
                    ppm.sender_role AS last_message_sender,
                    p.first_name_enc,
                    p.last_name_enc,
                    p.mrn AS patient_mrn,
                    (SELECT COUNT(*)::int FROM patient_portal_messages WHERE patient_id = ppm.patient_id AND is_read = FALSE AND sender_role = 'Patient') AS unread_count
                FROM patient_portal_messages ppm
                JOIN patients p ON ppm.patient_id = p.patient_id
                ORDER BY ppm.patient_id, ppm.created_at DESC
            ) sub
            ORDER BY last_message_at DESC
        `);

        const { decrypt } = require('../utils/crypto');
        const decryptName = (firstEnc, lastEnc) => {
            if (!firstEnc && !lastEnc) return 'Patient';
            try {
                const first = firstEnc ? decrypt(firstEnc) : '';
                const last = lastEnc ? decrypt(lastEnc) : '';
                return [first, last].filter(Boolean).join(' ') || 'Patient';
            } catch (_) {
                return 'Patient';
            }
        };

        const conversations = result.rows.map(row => {
            const mapped = { ...row };
            mapped.patient_name = decryptName(row.first_name_enc, row.last_name_enc);
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            return mapped;
        });

        res.json(conversations);
    } catch (error) {
        next(error);
    }
};

const getPatientMessageHistory = (db) => async (req, res, next) => {
    try {
        const { patientId } = req.params;

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
            WHERE patient_id = $1 AND sender_role = 'Patient' AND is_read = FALSE
        `, [patientId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const replyToPatient = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const { patientId } = req.params;
        const { appointmentId } = req.body;
        const { body, messageKind, attachments } = getRichMessagePayload(req);

        const result = await db.query(`
            INSERT INTO patient_portal_messages (patient_id, sender_role, staff_user_id, body, appointment_id, message_kind, attachments)
            VALUES ($1, 'Staff', $2, $3, $4, $5, $6::jsonb)
            RETURNING *
        `, [patientId, currentUserId, body, appointmentId || null, messageKind, JSON.stringify(attachments)]);

        const message = result.rows[0];

        // Fetch staff sender name
        const staffInfo = await db.query(`
            SELECT full_name AS staff_name FROM users WHERE user_id = $1
        `, [currentUserId]);

        const payload = {
            ...message,
            staff_name: staffInfo.rows[0]?.staff_name
        };

        // Push real-time event to Patient and all connected Staff
        realtimeService.sendToPatient(patientId, 'NEW_PORTAL_MESSAGE', payload);
        realtimeService.broadcastToStaff('NEW_PATIENT_MESSAGE_UPDATE', payload);

        triggerEventForRole(db, 'ChatMessageReceived', 'Admin', {
            priority: 'Normal',
            variables: {
                sender_name: staffInfo.rows[0]?.staff_name || 'Staff',
                message_preview: body.length > 100 ? body.slice(0, 97) + '...' : body
            }
        }).catch(() => {});

        res.status(201).json(payload);
    } catch (error) {
        cleanupUploadedFiles(req.files);
        next(error);
    }
};

// ─── Referring Doctor-to-Staff Messaging Controllers (Staff Inbox View) ────────

const getDoctorConversations = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT * FROM (
                SELECT DISTINCT ON (dpm.doctor_id)
                    dpm.doctor_id,
                    ${attachmentPreviewSql('dpm')} AS last_message_body,
                    dpm.created_at AS last_message_at,
                    dpm.sender_role AS last_message_sender,
                    rd.full_name AS doctor_name,
                    rd.clinic_hospital AS doctor_clinic,
                    (SELECT COUNT(*)::int FROM doctor_portal_messages WHERE doctor_id = dpm.doctor_id AND is_read = FALSE AND sender_role = 'Doctor') AS unread_count
                FROM doctor_portal_messages dpm
                JOIN referring_doctors rd ON dpm.doctor_id = rd.doctor_id
                ORDER BY dpm.doctor_id, dpm.created_at DESC
            ) sub
            ORDER BY last_message_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const getDoctorMessageHistory = (db) => async (req, res, next) => {
    try {
        const { doctorId } = req.params;

        const result = await db.query(`
            SELECT dpm.*, u.full_name AS staff_name
            FROM doctor_portal_messages dpm
            LEFT JOIN users u ON dpm.staff_user_id = u.user_id
            WHERE dpm.doctor_id = $1
            ORDER BY dpm.created_at ASC
            LIMIT 150
        `, [doctorId]);

        // Mark incoming messages as read
        await db.query(`
            UPDATE doctor_portal_messages
            SET is_read = TRUE, read_at = NOW()
            WHERE doctor_id = $1 AND sender_role = 'Doctor' AND is_read = FALSE
        `, [doctorId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const replyToDoctor = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const { doctorId } = req.params;
        const { appointmentId, examId } = req.body;
        const { body, messageKind, attachments } = getRichMessagePayload(req);

        const result = await db.query(`
            INSERT INTO doctor_portal_messages (doctor_id, sender_role, staff_user_id, body, appointment_id, exam_id, message_kind, attachments)
            VALUES ($1, 'Staff', $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING *
        `, [doctorId, currentUserId, body, appointmentId || null, examId || null, messageKind, JSON.stringify(attachments)]);

        const message = result.rows[0];

        // Fetch staff sender name
        const staffInfo = await db.query(`
            SELECT full_name AS staff_name FROM users WHERE user_id = $1
        `, [currentUserId]);

        const payload = {
            ...message,
            staff_name: staffInfo.rows[0]?.staff_name
        };

        // Push real-time event to Referring Doctor and all connected Staff
        realtimeService.sendToDoctor(doctorId, 'NEW_DOCTOR_PORTAL_MESSAGE', payload);
        realtimeService.broadcastToStaff('NEW_DOCTOR_MESSAGE_UPDATE', payload);

        triggerEventForRole(db, 'ChatMessageReceived', 'Admin', {
            priority: 'Normal',
            variables: {
                sender_name: staffInfo.rows[0]?.staff_name || 'Staff',
                message_preview: body.length > 100 ? body.slice(0, 97) + '...' : body
            }
        }).catch(() => {});

        res.status(201).json(payload);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getChatUsers,
    getChatMessages,
    sendChatMessage,
    getUnreadSummary,
    getPatientConversations,
    getPatientMessageHistory,
    replyToPatient,
    getDoctorConversations,
    getDoctorMessageHistory,
    replyToDoctor
};
