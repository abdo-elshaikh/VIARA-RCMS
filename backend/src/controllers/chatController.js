const realtimeService = require('../services/realtimeService');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const { cleanupUploadedFiles, parseAttachments } = require('../utils/chatAttachmentUpload');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');

const allowedMessageKinds = new Set(['text', 'sticker', 'attachment']);
const systemAdministratorRoles = new Set(['Admin', 'SuperAdmin', 'Developer']);
const externalInboxRoles = new Set(['Admin', 'Receptionist', 'Marketing', 'Developer']);
const validPostPermissions = new Set(['all_members', 'admins_only']);
const MAX_MESSAGE_LENGTH = 4000;

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

const sameId = (left, right) => String(left || '') === String(right || '');
const isSystemAdministrator = (role) => systemAdministratorRoles.has(role);
const hasAllowedRole = (channel, role) => Array.isArray(channel.allowed_roles)
    && channel.allowed_roles.length > 0
    && channel.allowed_roles.includes(role);

const canAccessChannel = (channel, userId, role, isMember = false) => {
    if (!channel) return false;
    if (isSystemAdministrator(role)) return true;
    if (sameId(channel.created_by, userId) || isMember) return true;
    if (hasAllowedRole(channel, role)) return true;
    return !channel.is_private && (!Array.isArray(channel.allowed_roles) || channel.allowed_roles.length === 0);
};

const getChannelAccess = async (db, channelId, user) => {
    const channelResult = await db.query('SELECT * FROM chat_channels WHERE channel_id = $1', [channelId]);
    const channel = channelResult.rows[0];
    if (!channel) throw new AppError('Channel not found', 404);

    const userId = user.user_id || user.userId;
    const membership = await db.query(
        'SELECT channel_role FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2',
        [channelId, userId]
    );
    const channelRole = membership.rows[0]?.channel_role || null;
    return {
        channel,
        channelRole,
        isMember: Boolean(channelRole),
        canAccess: canAccessChannel(channel, userId, user.role || '', Boolean(channelRole))
    };
};

const requireChannelAccess = async (db, channelId, user) => {
    const access = await getChannelAccess(db, channelId, user);
    if (!access.canAccess) throw new AppError('You do not have access to this channel', 403);
    return access;
};

const broadcastToChannelAudience = async (db, channel, event, data) => {
    try {
        const members = await db.query(
            'SELECT user_id FROM chat_channel_members WHERE channel_id = $1',
            [channel.channel_id]
        );
        const memberIds = new Set(members.rows.map(row => String(row.user_id)));
        realtimeService.broadcastToStaffMatching(
            (client) => canAccessChannel(channel, client.userId, client.role, memberIds.has(String(client.userId))),
            event,
            data
        );
    } catch (error) {
        // Persistence already succeeded; realtime delivery may safely recover by polling.
        logger.warn('Channel realtime broadcast failed', {
            channelId: channel.channel_id,
            event,
            error: error.message
        });
    }
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
        const recipientId = req.query.recipientId || req.query.recipient_id;
        const channelName = req.query.channelName || req.query.channel_name;

        if ((!recipientId && !channelName) || (recipientId && channelName)) {
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
            const readResult = await db.query(`
                UPDATE staff_messages
                SET is_read = TRUE, read_at = NOW()
                WHERE sender_id = $2 AND recipient_id = $1 AND is_read = FALSE
                RETURNING message_id
            `, [currentUserId, recipientId]);
            if (readResult.rows.length > 0) {
                realtimeService.sendToUser(recipientId, 'STAFF_MESSAGES_READ', {
                    reader_id: currentUserId,
                    message_ids: readResult.rows.map(row => row.message_id)
                });
            }
        } else {
            await requireChannelAccess(db, channelName, req.user);
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
        const recipientId = req.body.recipientId || req.body.recipient_id;
        const channelName = req.body.channelName || req.body.channel_name;
        const { body, messageKind, attachments } = getRichMessagePayload(req);

        if ((!recipientId && !channelName) || (recipientId && channelName)) {
            return next(new AppError('recipientId or channelName must be specified', 400));
        }

        let channelAccess = null;
        if (channelName) {
            channelAccess = await requireChannelAccess(db, channelName, req.user);
            if (channelAccess.channel.post_permission === 'admins_only') {
                const canAdminister = isSystemAdministrator(req.user.role)
                    || sameId(channelAccess.channel.created_by, currentUserId)
                    || channelAccess.channelRole === 'owner'
                    || channelAccess.channelRole === 'admin';
                if (!canAdminister) {
                    return next(new AppError('Posting in this channel is restricted to channel administrators', 403));
                }
            }
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
            await broadcastToChannelAudience(db, channelAccess.channel, 'NEW_STAFF_MESSAGE', payload);
        }

        res.status(201).json(payload);
    } catch (error) {
        cleanupUploadedFiles(req.files);
        next(error);
    }
};

// ─── Unread Summary (for the floating chat bubble badge) ──────────────────────

const getUnreadSummary = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;

        const canAccessExternalInbox = externalInboxRoles.has(req.user.role);
        const [staffRes, patientRes, doctorRes] = await Promise.all([
            db.query(`
                SELECT COUNT(*)::int AS count
                FROM staff_messages
                WHERE recipient_id = $1 AND is_read = FALSE
            `, [currentUserId]),
            canAccessExternalInbox ? db.query(`
                SELECT COUNT(*)::int AS count
                FROM patient_portal_messages
                WHERE sender_role = 'Patient' AND is_read = FALSE
            `) : Promise.resolve({ rows: [{ count: 0 }] }),
            canAccessExternalInbox ? db.query(`
                SELECT COUNT(*)::int AS count
                FROM doctor_portal_messages
                WHERE sender_role = 'Doctor' AND is_read = FALSE
            `) : Promise.resolve({ rows: [{ count: 0 }] })
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
        realtimeService.broadcastToStaffMatching(
            client => externalInboxRoles.has(client.role),
            'NEW_PATIENT_MESSAGE_UPDATE',
            payload
        );

        triggerEvent(db, 'ChatMessageReceived', {
            patientId,
            entityType: 'Message',
            entityId: message.message_id,
            channels: ['InApp'],
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
        realtimeService.broadcastToStaffMatching(
            client => externalInboxRoles.has(client.role),
            'NEW_DOCTOR_MESSAGE_UPDATE',
            payload
        );

        triggerEvent(db, 'ChatMessageReceived', {
            doctorId,
            entityType: 'Message',
            entityId: message.message_id,
            channels: ['InApp'],
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

const getChannels = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const userRole = req.user.role || '';
        const isSystemAdmin = isSystemAdministrator(userRole);

        const result = await db.query(`
            SELECT c.*,
                   COALESCE(
                       (SELECT COUNT(*) FROM staff_messages sm WHERE sm.channel_name = c.channel_id), 0
                   )::int AS message_count,
                   COALESCE(
                       (SELECT COUNT(*) FROM chat_channel_members cm WHERE cm.channel_id = c.channel_id), 0
                   )::int AS member_count,
                   cm.channel_role AS my_channel_role,
                   CASE WHEN cm.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_member
            FROM chat_channels c
            LEFT JOIN chat_channel_members cm ON c.channel_id = cm.channel_id AND cm.user_id = $1
            ORDER BY c.is_system DESC, c.created_at ASC
        `, [currentUserId]);

        // Filter by access
        const accessibleChannels = result.rows.filter(ch => (
            canAccessChannel(ch, currentUserId, userRole, ch.is_member)
        )).map(ch => {
            const isOwner = sameId(ch.created_by, currentUserId) || ch.my_channel_role === 'owner';
            const isChannelAdmin = isOwner || ch.my_channel_role === 'admin' || isSystemAdmin;
            const canPost = ch.post_permission === 'admins_only' ? isChannelAdmin : true;
            const canEdit = !ch.is_system && isChannelAdmin;
            const canDelete = !ch.is_system && (isOwner || isSystemAdmin);
            const canManageMembers = !ch.is_system && isChannelAdmin;

            return {
                ...ch,
                is_owner: isOwner,
                is_channel_admin: isChannelAdmin,
                can_post: canPost,
                can_edit: canEdit,
                can_delete: canDelete,
                can_manage_members: canManageMembers
            };
        });

        res.json(accessibleChannels);
    } catch (error) {
        next(error);
    }
};

const createChannel = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const {
            name,
            displayName,
            description,
            iconColor,
            isPrivate = false,
            postPermission = 'all_members',
            allowedRoles = [],
            initialMemberIds = []
        } = req.body;

        if (typeof name !== 'string' || !name.trim()) {
            return next(new AppError('Channel name is required', 400));
        }
        if (name.trim().length > 100 || (displayName && String(displayName).trim().length > 100)) {
            return next(new AppError('Channel name must not exceed 100 characters', 400));
        }
        if (!validPostPermissions.has(postPermission)) {
            return next(new AppError('Invalid channel posting permission', 400));
        }
        if (!Array.isArray(allowedRoles) || !Array.isArray(initialMemberIds) || initialMemberIds.length > 100) {
            return next(new AppError('Invalid channel role or member selection', 400));
        }

        const cleanSlug = (name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || `ch-${Date.now()}`)
            .slice(0, 64)
            .replace(/-+$/g, '');

        const result = await db.query(`
            INSERT INTO chat_channels (
                channel_id, name, display_name, description, icon_color, created_by, is_system, is_private, post_permission, allowed_roles
            )
            VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9)
            RETURNING *
        `, [
            cleanSlug,
            name.trim(),
            displayName?.trim() || name.trim(),
            description?.trim() || '',
            iconColor || 'from-teal-500 to-cyan-600',
            currentUserId,
            Boolean(isPrivate),
            postPermission === 'admins_only' ? 'admins_only' : 'all_members',
            Array.isArray(allowedRoles) ? allowedRoles : []
        ]);

        const newChannel = result.rows[0];

        // Add creator as owner
        await db.query(`
            INSERT INTO chat_channel_members (channel_id, user_id, channel_role, added_by)
            VALUES ($1, $2, 'owner', $2)
            ON CONFLICT (channel_id, user_id) DO NOTHING
        `, [cleanSlug, currentUserId]);

        // Add initial members if provided
        if (Array.isArray(initialMemberIds) && initialMemberIds.length > 0) {
            for (const memberId of initialMemberIds) {
                if (memberId && memberId !== currentUserId) {
                    await db.query(`
                        INSERT INTO chat_channel_members (channel_id, user_id, channel_role, added_by)
                        VALUES ($1, $2, 'member', $3)
                        ON CONFLICT (channel_id, user_id) DO NOTHING
                    `, [cleanSlug, memberId, currentUserId]);
                }
            }
        }

        await broadcastToChannelAudience(db, newChannel, 'NEW_CHAT_CHANNEL', newChannel);
        res.status(201).json(newChannel);
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('A channel with this name or identifier already exists', 409));
        }
        next(error);
    }
};

const updateChannel = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const userRole = req.user.role || '';
        const isSystemAdmin = isSystemAdministrator(userRole);
        const { channelId } = req.params;
        const { displayName, description, iconColor, isPrivate, postPermission, allowedRoles } = req.body;

        const access = await requireChannelAccess(db, channelId, req.user);
        const channel = access.channel;

        if (channel.is_system) {
            return next(new AppError('System channels cannot be modified', 403));
        }

        // Permission check: must be owner, channel admin, or system admin
        const isAllowed = isSystemAdmin || sameId(channel.created_by, currentUserId)
            || access.channelRole === 'owner' || access.channelRole === 'admin';

        if (!isAllowed) {
            return next(new AppError('You do not have permission to edit this channel', 403));
        }
        if (postPermission !== undefined && !validPostPermissions.has(postPermission)) {
            return next(new AppError('Invalid channel posting permission', 400));
        }
        if (allowedRoles !== undefined && !Array.isArray(allowedRoles)) {
            return next(new AppError('allowedRoles must be an array', 400));
        }
        if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 100)) {
            return next(new AppError('Channel display name must contain 1 to 100 characters', 400));
        }

        const result = await db.query(`
            UPDATE chat_channels
            SET display_name = COALESCE($1, display_name),
                description = COALESCE($2, description),
                icon_color = COALESCE($3, icon_color),
                is_private = COALESCE($4, is_private),
                post_permission = COALESCE($5, post_permission),
                allowed_roles = COALESCE($6, allowed_roles)
            WHERE channel_id = $7
            RETURNING *
        `, [
            displayName !== undefined ? displayName.trim() : null,
            description !== undefined ? description.trim() : null,
            iconColor || null,
            isPrivate !== undefined ? Boolean(isPrivate) : null,
            postPermission || null,
            Array.isArray(allowedRoles) ? allowedRoles : null,
            channelId
        ]);

        const updated = result.rows[0];
        await broadcastToChannelAudience(db, updated, 'CHAT_CHANNEL_UPDATED', updated);
        res.json(updated);
    } catch (error) {
        next(error);
    }
};

const deleteChannel = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const userRole = req.user.role || '';
        const isSystemAdmin = isSystemAdministrator(userRole);
        const { channelId } = req.params;

        const { channel } = await requireChannelAccess(db, channelId, req.user);
        if (channel.is_system) {
            return next(new AppError('System channels cannot be deleted', 403));
        }

        const isOwner = sameId(channel.created_by, currentUserId);
        if (!isOwner && !isSystemAdmin) {
            return next(new AppError('Only the channel owner or an admin can delete this channel', 403));
        }

        await broadcastToChannelAudience(db, channel, 'CHAT_CHANNEL_DELETED', { channel_id: channelId });
        await db.query('DELETE FROM chat_channels WHERE channel_id = $1', [channelId]);
        res.json({ message: 'Channel deleted successfully' });
    } catch (error) {
        next(error);
    }
};

const getChannelMembers = (db) => async (req, res, next) => {
    try {
        const { channelId } = req.params;
        await requireChannelAccess(db, channelId, req.user);

        const result = await db.query(`
            SELECT cm.id, cm.channel_id, cm.user_id, cm.channel_role, cm.added_at,
                   u.full_name, u.email, u.role, u.is_active
            FROM chat_channel_members cm
            JOIN users u ON cm.user_id = u.user_id
            WHERE cm.channel_id = $1
            ORDER BY
                CASE cm.channel_role
                    WHEN 'owner' THEN 1
                    WHEN 'admin' THEN 2
                    ELSE 3
                END,
                u.full_name ASC
        `, [channelId]);

        const onlineUserIds = realtimeService.getOnlineUserIds();
        const members = result.rows.map(m => ({
            ...m,
            isOnline: onlineUserIds.includes(m.user_id)
        }));

        res.json(members);
    } catch (error) {
        next(error);
    }
};

const addChannelMembers = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const userRole = req.user.role || '';
        const isSystemAdmin = isSystemAdministrator(userRole);
        const { channelId } = req.params;
        const { userIds = [], channelRole = 'member' } = req.body;

        const access = await requireChannelAccess(db, channelId, req.user);
        const channel = access.channel;
        if (channel.is_system) {
            return next(new AppError('System channel membership cannot be modified', 403));
        }
        if (!['admin', 'member'].includes(channelRole)) {
            return next(new AppError('channelRole must be either admin or member', 400));
        }

        // Check permission
        const isOwner = sameId(channel.created_by, currentUserId) || access.channelRole === 'owner';
        const isAllowed = isSystemAdmin || isOwner || access.channelRole === 'admin';

        if (!isAllowed) {
            return next(new AppError('You do not have permission to add members to this channel', 403));
        }
        if (channelRole === 'admin' && !isOwner && !isSystemAdmin) {
            return next(new AppError('Only the channel owner or a system administrator can add channel administrators', 403));
        }

        if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 100) {
            return next(new AppError('userIds must contain between 1 and 100 users', 400));
        }
        const targetIds = [...new Set(userIds.filter(Boolean).map(String))];
        const added = [];

        for (const uid of targetIds) {
            if (uid) {
                const ins = await db.query(`
                    INSERT INTO chat_channel_members (channel_id, user_id, channel_role, added_by)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (channel_id, user_id)
                    DO UPDATE SET channel_role = EXCLUDED.channel_role
                    RETURNING *
                `, [channelId, uid, channelRole, currentUserId]);
                added.push(ins.rows[0]);
            }
        }

        await broadcastToChannelAudience(db, channel, 'CHANNEL_MEMBERS_UPDATED', { channel_id: channelId });
        res.status(201).json({ message: 'Members added successfully', added });
    } catch (error) {
        next(error);
    }
};

const removeChannelMember = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const userRole = req.user.role || '';
        const isSystemAdmin = isSystemAdministrator(userRole);
        const { channelId, userId } = req.params;

        const access = await requireChannelAccess(db, channelId, req.user);
        const channel = access.channel;
        if (channel.is_system) {
            return next(new AppError('System channel membership cannot be modified', 403));
        }

        // Check if target is owner
        if (sameId(channel.created_by, userId)) {
            return next(new AppError('Channel owner cannot be removed', 400));
        }

        // Check permission: Self leave or admin/owner removing
        const isSelf = sameId(currentUserId, userId);
        const isChannelAdmin = isSystemAdmin || sameId(channel.created_by, currentUserId)
            || access.channelRole === 'owner' || access.channelRole === 'admin';

        if (!isSelf && !isChannelAdmin) {
            return next(new AppError('You do not have permission to remove members from this channel', 403));
        }

        const removed = await db.query(
            'DELETE FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2 RETURNING user_id',
            [channelId, userId]
        );
        if (removed.rows.length === 0) {
            return next(new AppError('Member not found in channel', 404));
        }
        await broadcastToChannelAudience(db, channel, 'CHANNEL_MEMBERS_UPDATED', { channel_id: channelId, removed_user_id: userId });
        realtimeService.sendToUser(userId, 'CHANNEL_MEMBERS_UPDATED', { channel_id: channelId, removed_user_id: userId });
        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        next(error);
    }
};

const updateChannelMemberRole = (db) => async (req, res, next) => {
    try {
        const currentUserId = req.user.user_id || req.user.userId;
        const userRole = req.user.role || '';
        const isSystemAdmin = isSystemAdministrator(userRole);
        const { channelId, userId } = req.params;
        const { channelRole } = req.body;

        if (!['admin', 'member'].includes(channelRole)) {
            return next(new AppError('channelRole must be either admin or member', 400));
        }

        const { channel } = await requireChannelAccess(db, channelId, req.user);
        if (channel.is_system) {
            return next(new AppError('System channel membership cannot be modified', 403));
        }
        if (sameId(channel.created_by, userId)) {
            return next(new AppError('Channel owner role cannot be changed', 400));
        }

        // Only channel owner or system Admin can promote/demote
        const isOwner = sameId(channel.created_by, currentUserId);
        if (!isOwner && !isSystemAdmin) {
            return next(new AppError('Only the channel owner or system admins can modify member roles', 403));
        }

        const result = await db.query(`
            UPDATE chat_channel_members
            SET channel_role = $1
            WHERE channel_id = $2 AND user_id = $3
            RETURNING *
        `, [channelRole, channelId, userId]);

        if (result.rows.length === 0) {
            return next(new AppError('Member not found in channel', 404));
        }

        await broadcastToChannelAudience(db, channel, 'CHANNEL_MEMBERS_UPDATED', { channel_id: channelId });
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getChatUsers,
    getChatMessages,
    sendChatMessage,
    getUnreadSummary,
    getChannels,
    createChannel,
    updateChannel,
    deleteChannel,
    getChannelMembers,
    addChannelMembers,
    removeChannelMember,
    updateChannelMemberRole,
    getPatientConversations,
    getPatientMessageHistory,
    replyToPatient,
    getDoctorConversations,
    getDoctorMessageHistory,
    replyToDoctor
};
