const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { validateUUID } = require('../utils/queryValidator');

const rollbackQuietly = async (client) => {
    if (!client) return;
    try {
        await client.query('ROLLBACK');
    } catch {
        // Preserve the original operation error.
    }
};

const getOpenFollowups = (db) => async (_req, res, next) => {
    try {
        const result = await db.query(`
            SELECT task.task_id, task.exam_id, task.critical_marked_at, task.created_at,
                   exam.order_number
            FROM critical_result_admin_followup_tasks task
            JOIN examinations exam ON exam.exam_id = task.exam_id
            WHERE task.status = 'Open'
            ORDER BY task.created_at ASC, task.task_id ASC
            LIMIT 200
        `);
        res.json({ items: result.rows });
    } catch (error) {
        next(error);
    }
};

const completeFollowup = (db) => async (req, res, next) => {
    let client;
    try {
        const taskId = req.params.id;
        validateUUID(taskId, 'taskId');
        const { contactedParty, followUpNotes } = req.body;
        client = await db.connect();
        await client.query('BEGIN');

        const result = await client.query(`
            UPDATE critical_result_admin_followup_tasks
            SET status = 'Completed',
                contacted_party = $2,
                follow_up_notes = $3,
                completed_by = $4,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE task_id = $1
              AND status = 'Open'
            RETURNING task_id, exam_id, status, contacted_party, follow_up_notes, completed_at
        `, [taskId, contactedParty, followUpNotes, req.user.user_id]);

        if (result.rows.length === 0) {
            const existingTask = await client.query(
                'SELECT 1 FROM critical_result_admin_followup_tasks WHERE task_id = $1',
                [taskId]
            );
            if (existingTask.rows.length === 0) {
                throw new AppError('Critical-result follow-up task not found', 404, true, 'TASK_NOT_FOUND');
            }
            throw new AppError('Critical-result follow-up task is already completed', 409, true, 'TASK_ALREADY_COMPLETED');
        }

        await logAction(client, {
            userId: req.user.user_id,
            action: 'CRITICAL_RESULT_ADMIN_FOLLOWUP_COMPLETED',
            resourceId: result.rows[0].task_id,
            resourceTable: 'critical_result_admin_followup_tasks',
            ipAddress: req.ip,
            details: { examId: result.rows[0].exam_id },
            required: true
        });

        await client.query('COMMIT');
        res.json({ success: true, task: result.rows[0] });
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

module.exports = { getOpenFollowups, completeFollowup };
