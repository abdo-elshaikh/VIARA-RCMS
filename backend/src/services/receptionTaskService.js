const { AppError } = require('../utils/errors');
const realtimeService = require('./realtimeService');

/**
 * receptionTaskService.js
 * Atomic task assignment, soft locking, lease renewal, and concurrency control for Receptionists.
 */

const broadcastReceptionTaskChange = (payload, event = 'RECEPTION_WORK_ITEM_UPDATED') => {
    try {
        realtimeService.sendToRole('Receptionist', event, payload);
        realtimeService.sendToRole('Admin', event, payload);
        realtimeService.sendToRole('Cashier', event, payload);
        realtimeService.sendToRole('Developer', event, payload);
        if (payload.claimed_by) {
            realtimeService.sendToUser(payload.claimed_by, event, payload);
        }
    } catch (err) {
        // SSE broadcast errors are non-fatal
    }
};

const claimReceptionTask = async (client, { appointmentId, examId, user, desk, expectedVersion }) => {
    const userId = user.user_id || user.id;

    const result = await client.query(`
        SELECT a.appointment_id, a.exam_id, a.modality_id, a.status, a.priority,
               a.receptionist_id, a.receptionist_assigned_at, a.receptionist_desk,
               a.receptionist_assignment_version,
               u.full_name AS claimant_name,
               m.name AS modality_name, m.type AS modality_type, m.room_number, m.room_id,
               rss.session_id AS shift_session_id, rss.scope AS shift_scope,
               rss.room_ids AS shift_room_ids, rss.modality_ids AS shift_modality_ids,
               rss.desk_identifier AS shift_desk_identifier,
               rwi.work_item_id, rwi.lease_expires_at, rwi.status AS work_item_status
        FROM appointments a
        LEFT JOIN users u ON a.receptionist_id = u.user_id
        LEFT JOIN modalities m ON a.modality_id = m.modality_id
        LEFT JOIN LATERAL (
            SELECT session_id, scope, room_ids, modality_ids, desk_identifier
            FROM reception_shift_sessions
            WHERE user_id = $2 AND status = 'Open'
            LIMIT 1
        ) rss ON TRUE
        LEFT JOIN LATERAL (
            SELECT work_item_id, lease_expires_at, status
            FROM reception_work_items
            WHERE appointment_id = a.appointment_id
              AND status IN ('Claimed', 'In_Progress')
            ORDER BY claimed_at DESC NULLS LAST, created_at DESC
            LIMIT 1
        ) rwi ON TRUE
        WHERE a.appointment_id = $1
        FOR UPDATE OF a
    `, [appointmentId, userId]);

    if (result.rows.length === 0) {
        throw new AppError('Appointment not found', 404);
    }

    const row = result.rows[0];

    if (user.role === 'Receptionist' && row.shift_session_id === null) {
        throw new AppError('ابدأ وردية الاستقبال وحدد نطاق العمل قبل استلام الحالات', 409, true, 'RECEPTION_SHIFT_REQUIRED');
    }

    if (row.shift_session_id) {
        const normalize = (value) => String(value || '').trim().toLocaleLowerCase('en');
        const allowedRooms = Array.isArray(row.shift_room_ids) ? row.shift_room_ids.map(normalize) : [];
        const allowedModalities = Array.isArray(row.shift_modality_ids) ? row.shift_modality_ids.map(normalize) : [];
        const roomCandidates = [row.room_id, row.room_number].map(normalize).filter(Boolean);
        const modalityCandidates = [row.modality_id, row.modality_name, row.modality_type].map(normalize).filter(Boolean);
        const outsideRoomScope = row.shift_scope === 'rooms'
            && allowedRooms.length > 0
            && !allowedRooms.some((allowed) => roomCandidates.includes(allowed));
        const outsideModalityScope = row.shift_scope === 'modalities'
            && allowedModalities.length > 0
            && !allowedModalities.some((allowed) => modalityCandidates.includes(allowed));
        const outsideEmergencyScope = row.shift_scope === 'emergency'
            && !['Emergency', 'Urgent'].includes(row.priority);
        if (outsideRoomScope || outsideModalityScope || outsideEmergencyScope) {
            throw new AppError('الحالة خارج نطاق الغرف أو الأجهزة المخصصة لورديتك', 403, true, 'OUTSIDE_RECEPTION_SCOPE');
        }
    }

    // Check if currently claimed by someone else with an active lease
    const now = new Date();
    const isLeaseActive = row.lease_expires_at ? new Date(row.lease_expires_at) > now : true;
    const isClaimedByOther = row.receptionist_id && String(row.receptionist_id) !== String(userId);

    if (isClaimedByOther && isLeaseActive) {
        const claimantInfo = row.claimant_name || 'موظف آخر';
        const deskInfo = row.receptionist_desk ? ` (${row.receptionist_desk})` : '';
        throw new AppError(`الحالة قيد الاستقبال حالياً بواسطة ${claimantInfo}${deskInfo}`, 409, true, 'TASK_ALREADY_CLAIMED', {
            claimedBy: claimantInfo,
            claimantId: row.receptionist_id,
            desk: row.receptionist_desk,
            claimedAt: row.receptionist_assigned_at,
            version: row.receptionist_assignment_version
        });
    }

    // Check version collision
    if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== Number(row.receptionist_assignment_version)) {
        throw new AppError('تم تحديث بيانات هذه الحالة بواسطة موظف آخر، يرجى التحديث.', 409, true, 'STALE_VERSION', {
            currentVersion: row.receptionist_assignment_version
        });
    }

    const newDesk = row.shift_desk_identifier || desk || row.receptionist_desk || 'استقبال';
    const newVersion = (row.receptionist_assignment_version || 0) + 1;

    // Update appointment
    const updatedAppt = await client.query(`
        UPDATE appointments
        SET receptionist_id = $1,
            receptionist_assigned_at = CURRENT_TIMESTAMP,
            receptionist_desk = $2,
            receptionist_assignment_version = $3
        WHERE appointment_id = $4
        RETURNING appointment_id, receptionist_id, receptionist_assigned_at, receptionist_desk, receptionist_assignment_version
    `, [userId, newDesk, newVersion, appointmentId]);

    // Close the prior lease before creating the replacement. This keeps one
    // authoritative owner row per appointment, including lease renewals.
    await client.query(`
        UPDATE reception_work_items
        SET status = 'Released',
            notes = COALESCE(notes || E'\\n', '') || 'Lease replaced by a new reception claim',
            updated_at = CURRENT_TIMESTAMP
        WHERE appointment_id = $1
          AND status IN ('Claimed', 'In_Progress')
    `, [appointmentId]);

    // Create the active reception work item with a 15-minute safety lease.
    const effectiveExamId = examId || row.exam_id;
    const workItemResult = await client.query(`
        INSERT INTO reception_work_items (
            appointment_id, exam_id, modality_id, room_number,
            claimed_by, desk_identifier, status,
            claimed_at, lease_expires_at, version, shift_session_id
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, 'Claimed',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '15 minutes', $7,
            (SELECT session_id FROM reception_shift_sessions WHERE user_id = $5 AND status = 'Open' LIMIT 1)
        )
        RETURNING work_item_id, appointment_id, exam_id, modality_id, room_number,
                  claimed_by, desk_identifier, status, claimed_at, lease_expires_at, version
    `, [appointmentId, effectiveExamId, row.modality_id, row.room_number, userId, newDesk, newVersion]);

    const workItem = workItemResult.rows[0];
    const payload = {
        appointment_id: appointmentId,
        exam_id: effectiveExamId,
        receptionist_id: userId,
        claimed_by: userId,
        claimant_name: user.full_name || user.name || 'موظف الاستقبال',
        receptionist_desk: newDesk,
        desk_identifier: newDesk,
        status: 'Claimed',
        receptionist_assignment_version: newVersion,
        version: newVersion,
        claimed_at: updatedAppt.rows[0].receptionist_assigned_at,
        lease_expires_at: workItem.lease_expires_at,
        modality_id: row.modality_id,
        room_number: row.room_number
    };

    return payload;
};

const releaseReceptionTask = async (client, { appointmentId, user, reason }) => {
    const userId = user.user_id || user.id;
    const isAdmin = ['Admin', 'Developer'].includes(user.role);

    const result = await client.query(`
        SELECT a.appointment_id, a.receptionist_id, a.receptionist_assignment_version, a.modality_id,
               m.room_number
        FROM appointments a
        LEFT JOIN modalities m ON a.modality_id = m.modality_id
        WHERE a.appointment_id = $1
        FOR UPDATE OF a
    `, [appointmentId]);

    if (result.rows.length === 0) {
        throw new AppError('Appointment not found', 404);
    }

    const row = result.rows[0];
    if (row.receptionist_id && String(row.receptionist_id) !== String(userId) && !isAdmin) {
        throw new AppError('لا تملك صلاحية تحرير هذه الحالة لأنها مستلمة بواسطة موظف آخر', 403);
    }

    const newVersion = (row.receptionist_assignment_version || 0) + 1;

    await client.query(`
        UPDATE appointments
        SET receptionist_id = NULL,
            receptionist_assigned_at = NULL,
            receptionist_desk = NULL,
            receptionist_assignment_version = $1
        WHERE appointment_id = $2
    `, [newVersion, appointmentId]);

    await client.query(`
        UPDATE reception_work_items
        SET status = 'Released',
            notes = COALESCE(notes || E'\\n', '') || $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE appointment_id = $1 AND status IN ('Claimed', 'In_Progress')
    `, [appointmentId, reason ? `Released: ${reason}` : 'Released by staff']);

    const payload = {
        appointment_id: appointmentId,
        released: true,
        claimed_by: null,
        claimant_name: null,
        desk_identifier: null,
        status: 'Available',
        version: newVersion,
        modality_id: row.modality_id,
        room_number: row.room_number
    };

    return payload;
};

const transferReceptionTask = async (client, { appointmentId, user, targetUserId, desk, reason }) => {
    const userId = user.user_id || user.id;
    const isAdmin = ['Admin', 'Developer'].includes(user.role);

    const result = await client.query(`
        SELECT a.appointment_id, a.exam_id, a.modality_id, a.priority,
               a.receptionist_id, a.receptionist_assignment_version,
               m.name AS modality_name, m.type AS modality_type, m.room_number, m.room_id,
               u.full_name AS target_name, u.role AS target_role
        FROM appointments a
        LEFT JOIN modalities m ON a.modality_id = m.modality_id
        CROSS JOIN (
            SELECT full_name, role
            FROM users
            WHERE user_id = $2
              AND is_active = TRUE
              AND role IN ('Receptionist', 'Admin', 'Developer')
        ) u
        WHERE a.appointment_id = $1
        FOR UPDATE OF a
    `, [appointmentId, targetUserId]);

    if (result.rows.length === 0) {
        throw new AppError('Appointment or target staff not found', 404);
    }

    const row = result.rows[0];
    if (row.receptionist_id && String(row.receptionist_id) !== String(userId) && !isAdmin) {
        throw new AppError('لا تملك صلاحية تحويل هذه الحالة لأنها ليست مسندة إليك', 403);
    }

    const targetShiftResult = await client.query(`
        SELECT session_id, desk_identifier, scope, room_ids, modality_ids
        FROM reception_shift_sessions
        WHERE user_id = $1 AND status = 'Open'
        LIMIT 1
        FOR SHARE
    `, [targetUserId]);
    const targetShift = targetShiftResult.rows[0] || null;
    if (row.target_role === 'Receptionist' && !targetShift) {
        throw new AppError('يجب أن يبدأ موظف الاستقبال المستهدف ورديته قبل تحويل الحالة إليه', 409, true, 'TARGET_RECEPTION_SHIFT_REQUIRED');
    }
    if (targetShift) {
        const normalize = (value) => String(value || '').trim().toLocaleLowerCase('en');
        const roomCandidates = [row.room_id, row.room_number].map(normalize).filter(Boolean);
        const modalityCandidates = [row.modality_id, row.modality_name, row.modality_type].map(normalize).filter(Boolean);
        const allowedRooms = Array.isArray(targetShift.room_ids) ? targetShift.room_ids.map(normalize) : [];
        const allowedModalities = Array.isArray(targetShift.modality_ids) ? targetShift.modality_ids.map(normalize) : [];
        const roomMismatch = targetShift.scope === 'rooms'
            && !allowedRooms.some((allowed) => roomCandidates.includes(allowed));
        const modalityMismatch = targetShift.scope === 'modalities'
            && !allowedModalities.some((allowed) => modalityCandidates.includes(allowed));
        const emergencyMismatch = targetShift.scope === 'emergency'
            && !['Emergency', 'Urgent'].includes(row.priority);
        if (roomMismatch || modalityMismatch || emergencyMismatch) {
            throw new AppError('الحالة خارج نطاق الغرف أو الأجهزة المخصصة للموظف المستهدف', 409, true, 'TARGET_OUTSIDE_RECEPTION_SCOPE');
        }
    }

    const newVersion = (row.receptionist_assignment_version || 0) + 1;
    const newDesk = targetShift?.desk_identifier || desk || 'استقبال';

    await client.query(`
        UPDATE appointments
        SET receptionist_id = $1,
            receptionist_assigned_at = CURRENT_TIMESTAMP,
            receptionist_desk = $2,
            receptionist_assignment_version = $3
        WHERE appointment_id = $4
    `, [targetUserId, newDesk, newVersion, appointmentId]);

    await client.query(`
        UPDATE reception_work_items
        SET status = 'Released',
            notes = COALESCE(notes || E'\\n', '') || $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE appointment_id = $1
          AND status IN ('Claimed', 'In_Progress')
    `, [appointmentId, reason ? `Transferred: ${reason}` : 'Transferred to another receptionist']);

    await client.query(`
        INSERT INTO reception_work_items (
            appointment_id, exam_id, modality_id, room_number,
            claimed_by, desk_identifier, status,
            claimed_at, lease_expires_at, version, notes, shift_session_id
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, 'Claimed',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '15 minutes', $7, $8, $9
        )
    `, [
        appointmentId,
        row.exam_id,
        row.modality_id,
        row.room_number,
        targetUserId,
        newDesk,
        newVersion,
        reason ? `Transferred from ${userId}: ${reason}` : `Transferred from ${userId}`,
        targetShift?.session_id || null,
    ]);

    const payload = {
        appointment_id: appointmentId,
        claimed_by: targetUserId,
        claimant_name: row.target_name,
        desk_identifier: newDesk,
        status: 'Claimed',
        version: newVersion,
        modality_id: row.modality_id,
        room_number: row.room_number
    };

    return payload;
};

const completeReceptionTask = async (client, { appointmentId, userId }) => {
    await client.query(`
        UPDATE reception_work_items
        SET status = 'Completed',
            completed_at = CURRENT_TIMESTAMP,
            completed_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE appointment_id = $1 AND status IN ('Claimed', 'In_Progress')
    `, [appointmentId, userId]);

    const appointmentResult = await client.query(`
        UPDATE appointments
        SET receptionist_id = NULL,
            receptionist_assigned_at = NULL,
            receptionist_desk = NULL,
            receptionist_assignment_version = receptionist_assignment_version + 1
        WHERE appointment_id = $1
          AND receptionist_id IS NOT NULL
        RETURNING receptionist_assignment_version
    `, [appointmentId]);

    const payload = {
        appointment_id: appointmentId,
        claimed_by: null,
        claimant_name: null,
        desk_identifier: null,
        status: 'Completed',
        version: appointmentResult.rows[0]?.receptionist_assignment_version
    };

    return payload;
};

const cleanupExpiredReceptionTasks = async (client) => client.query(`
    WITH expired AS (
        UPDATE reception_work_items
        SET status = 'Released',
            notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Lease expired after heartbeat grace period'),
            updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('Claimed', 'In_Progress')
          AND lease_expires_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'
        RETURNING appointment_id
    )
    UPDATE appointments a
    SET receptionist_id = NULL,
        receptionist_assigned_at = NULL,
        receptionist_desk = NULL,
        receptionist_assignment_version = receptionist_assignment_version + 1
    WHERE a.appointment_id IN (SELECT appointment_id FROM expired)
      AND NOT EXISTS (
          SELECT 1 FROM reception_work_items active
          WHERE active.appointment_id = a.appointment_id
            AND active.status IN ('Claimed', 'In_Progress')
      )
    RETURNING a.appointment_id
`);

const renewReceptionTaskLeases = async (client, { user }) => {
    const userId = user.user_id || user.id;
    await cleanupExpiredReceptionTasks(client);

    const result = await client.query(`
        UPDATE reception_work_items rwi
        SET lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
            updated_at = CURRENT_TIMESTAMP,
            status = CASE WHEN rwi.status = 'Claimed' THEN 'In_Progress' ELSE rwi.status END
        FROM appointments a
        WHERE rwi.appointment_id = a.appointment_id
          AND rwi.claimed_by = $1
          AND a.receptionist_id = $1
          AND rwi.status IN ('Claimed', 'In_Progress')
          AND (rwi.lease_expires_at IS NULL OR rwi.lease_expires_at > CURRENT_TIMESTAMP - INTERVAL '2 minutes')
        RETURNING rwi.work_item_id, rwi.appointment_id, rwi.status,
                  rwi.desk_identifier, rwi.lease_expires_at, rwi.version
    `, [userId]);

    const sessionResult = await client.query(`
        UPDATE reception_shift_sessions
        SET last_heartbeat_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND status = 'Open'
        RETURNING session_id, started_at, last_heartbeat_at
    `, [userId]);

    return {
        renewed: result.rows.length,
        lease_expires_at: result.rows[0]?.lease_expires_at || null,
        tasks: result.rows,
        shift: sessionResult.rows[0] || null,
    };
};

module.exports = {
    claimReceptionTask,
    releaseReceptionTask,
    transferReceptionTask,
    completeReceptionTask,
    renewReceptionTaskLeases,
    cleanupExpiredReceptionTasks,
    broadcastReceptionTaskChange
};
