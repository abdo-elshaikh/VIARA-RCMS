const { AppError } = require('../middleware/errorHandler');
const { setBranchContext, clearBranchContext } = require('../utils/branchTransaction');
const { logAction } = require('../services/auditService');
const { validateUUID } = require('../utils/queryValidator');
const { getRequestQuery } = require('../utils/requestQuery');
const branchService = require('../services/branchService');

const rollbackQuietly = async (client) => {
    if (!client) return;
    try {
        await client.query('ROLLBACK');
    } catch {
        // Preserve the original operation error.
    }
};

const getOpenFollowups = (db) => async (req, res, next) => {
    try {
        const query = getRequestQuery(req);
        const explicitBranch = query.branchId || req.headers?.['x-branch-id'];
        const isOrgAdmin = Boolean(req.user?.is_org_admin);

        let allowedBranchIds = [];
        if (!isOrgAdmin) {
            const userBranches = await require('../utils/requestBranches')(db, req);
            allowedBranchIds = userBranches.branches.map(b => b.id);
            if (explicitBranch && !allowedBranchIds.includes(explicitBranch)) {
                return next(new AppError(
                    'You do not have access to this branch | ليس لديك صلاحية لهذا الفرع',
                    403,
                    true,
                    'BRANCH_ACCESS_DENIED'
                ));
            }
        }

        let querySql = `
            SELECT task.task_id, task.exam_id, task.critical_marked_at, task.created_at,
                   exam.order_number, exam.branch_id
            FROM critical_result_admin_followup_tasks task
            JOIN examinations exam ON exam.exam_id = task.exam_id
            WHERE task.status = 'Open'
        `;
        const params = [];

        if (explicitBranch) {
            params.push(explicitBranch);
            querySql += ` AND exam.branch_id = $${params.length}`;
        } else if (!isOrgAdmin) {
            params.push(allowedBranchIds);
            querySql += ` AND exam.branch_id = ANY($${params.length}::uuid[])`;
        }

        querySql += `
            ORDER BY task.created_at ASC, task.task_id ASC
            LIMIT 200
        `;

        const result = await db.query(querySql, params);
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
        await setBranchContext(client, req);

        const existingTask = await client.query(`
            SELECT task.task_id, task.status, exam.branch_id, exam.exam_id
            FROM critical_result_admin_followup_tasks task
            JOIN examinations exam ON exam.exam_id = task.exam_id
            WHERE task.task_id = $1
            FOR UPDATE
        `, [taskId]);

        if (existingTask.rows.length === 0) {
            throw new AppError('Critical-result follow-up task not found', 404, true, 'TASK_NOT_FOUND');
        }
        const taskRow = existingTask.rows[0];
        if (taskRow.status === 'Completed') {
            throw new AppError('Critical-result follow-up task is already completed', 409, true, 'TASK_ALREADY_COMPLETED');
        }

        // Branch access authorization
        if (!req.user?.is_org_admin) {
            const userBranches = await require('../utils/requestBranches')(client, req);
            const hasAccess = userBranches.branches.some(b => b.id === taskRow.branch_id);
            if (!hasAccess) {
                throw new AppError(
                    'You do not have access to this branch | ليس لديك صلاحية لهذا الفرع',
                    403,
                    true,
                    'BRANCH_ACCESS_DENIED'
                );
            }
        }

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
        if (client) {
            await clearBranchContext(client);
            client.release();
        }
    }
};

module.exports = { getOpenFollowups, completeFollowup };
