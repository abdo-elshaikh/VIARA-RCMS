const {
    claimReceptionTask,
    releaseReceptionTask,
    transferReceptionTask,
    renewReceptionTaskLeases,
    cleanupExpiredReceptionTasks,
    broadcastReceptionTaskChange
} = require('../services/receptionTaskService');
const { logAction } = require('../services/auditService');
const { AppError } = require('../utils/errors');
const { validateUUID } = require('../utils/queryValidator');

const rollbackQuietly = async (client) => {
    if (!client) return;
    try {
        await client.query('ROLLBACK');
    } catch {
        // Ignore rollback error
    }
};

const claimTask = (db) => async (req, res, next) => {
    let client;
    try {
        const appointmentId = req.params.appointmentId;
        validateUUID(appointmentId, 'appointmentId');
        const body = req.body || {};

        client = await db.connect();
        await client.query('BEGIN');

        const assignment = await claimReceptionTask(client, {
            appointmentId,
            examId: body.examId,
            user: req.user,
            desk: body.desk,
            expectedVersion: body.expectedVersion
        });

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_TASK_CLAIMED',
            resourceId: appointmentId,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: {
                desk: assignment.desk_identifier,
                version: assignment.version
            }
        });

        await client.query('COMMIT');
        broadcastReceptionTaskChange(assignment, 'RECEPTION_TASK_CLAIMED');
        res.json(assignment);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

const releaseTask = (db) => async (req, res, next) => {
    let client;
    try {
        const appointmentId = req.params.appointmentId;
        validateUUID(appointmentId, 'appointmentId');
        const body = req.body || {};

        client = await db.connect();
        await client.query('BEGIN');

        const assignment = await releaseReceptionTask(client, {
            appointmentId,
            user: req.user,
            reason: body.reason
        });

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_TASK_RELEASED',
            resourceId: appointmentId,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: {
                reason: body.reason || null
            }
        });

        await client.query('COMMIT');
        broadcastReceptionTaskChange(assignment, 'RECEPTION_TASK_RELEASED');
        res.json(assignment);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

const transferTask = (db) => async (req, res, next) => {
    let client;
    try {
        const appointmentId = req.params.appointmentId;
        validateUUID(appointmentId, 'appointmentId');
        const body = req.body || {};
        validateUUID(body.targetUserId, 'targetUserId');

        client = await db.connect();
        await client.query('BEGIN');

        const assignment = await transferReceptionTask(client, {
            appointmentId,
            user: req.user,
            targetUserId: body.targetUserId,
            desk: body.desk,
            reason: body.reason
        });

        await logAction(client, {
            userId: req.user.user_id,
            action: 'RECEPTION_TASK_TRANSFERRED',
            resourceId: appointmentId,
            resourceTable: 'appointments',
            ipAddress: req.ip,
            details: {
                targetUserId: req.body.targetUserId,
                desk: req.body.desk,
                reason: req.body.reason
            }
        });

        await client.query('COMMIT');
        broadcastReceptionTaskChange(assignment, 'RECEPTION_TASK_TRANSFERRED');
        res.json(assignment);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

const getActiveTasks = (db) => async (req, res, next) => {
    try {
        await cleanupExpiredReceptionTasks(db);
        const { date, modalityId } = req.query;
        let query = `
            SELECT rwi.work_item_id, rwi.appointment_id, rwi.exam_id, rwi.task_type,
                   rwi.modality_id, rwi.room_number, rwi.claimed_by, rwi.desk_identifier,
                   rwi.status, rwi.claimed_at, rwi.lease_expires_at, rwi.version,
                   u.full_name AS claimant_name,
                   m.name AS modality_name,
                   p.mrn,
                   a.start_time, a.status AS appointment_status
            FROM reception_work_items rwi
            JOIN appointments a ON rwi.appointment_id = a.appointment_id
            LEFT JOIN users u ON rwi.claimed_by = u.user_id
            LEFT JOIN modalities m ON rwi.modality_id = m.modality_id
            LEFT JOIN patients p ON a.patient_id = p.patient_id
            WHERE rwi.status IN ('Claimed', 'In_Progress')
              AND (rwi.lease_expires_at IS NULL OR rwi.lease_expires_at > CURRENT_TIMESTAMP)
        `;
        const params = [];
        if (date) {
            params.push(date);
            query += ` AND a.start_time::date = $${params.length}`;
        }
        if (modalityId) {
            params.push(modalityId);
            query += ` AND rwi.modality_id = $${params.length}`;
        }
        query += ` ORDER BY rwi.claimed_at DESC LIMIT 200`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const heartbeatTasks = (db) => async (req, res, next) => {
    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');
        const result = await renewReceptionTaskLeases(client, {
            user: req.user,
        });
        await client.query('COMMIT');
        res.json(result);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

module.exports = {
    claimTask,
    releaseTask,
    transferTask,
    getActiveTasks,
    heartbeatTasks
};
