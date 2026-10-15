const { z } = require('zod');
const { AppError } = require('../utils/errors');
const { logAction } = require('../services/auditService');

const assignmentSchema = z.object({
    supervisorId: z.string().uuid(),
    employeeId: z.string().uuid(),
    canViewShifts: z.boolean().default(true),
    canManageHandovers: z.boolean().default(false),
    canTransferTasks: z.boolean().default(false),
    endsAt: z.string().datetime({ offset: true }).optional(),
});
const updateSchema = assignmentSchema.pick({
    canViewShifts: true, canManageHandovers: true,
    canTransferTasks: true, endsAt: true,
}).partial().extend({ endsAt: z.string().datetime({ offset: true }).nullable().optional() });

const listAssignments = (db) => async (req, res, next) => {
    try {
        const canManage = ['Admin', 'Developer', 'HR'].includes(req.user.role);
        const result = await db.query(`
            SELECT a.*, supervisor.full_name AS supervisor_name, employee.full_name AS employee_name
            FROM reception_supervisor_assignments a
            JOIN users supervisor ON supervisor.user_id = a.supervisor_id
            JOIN users employee ON employee.user_id = a.employee_id
            WHERE ($1::boolean OR a.supervisor_id = $2)
              AND a.revoked_at IS NULL
              AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP)
            ORDER BY a.created_at DESC
            LIMIT 1000
        `, [canManage, req.user.user_id]);
        res.json(result.rows);
    } catch (error) { next(error); }
};

const listSupervisedTasks = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT rwi.appointment_id, rwi.claimed_by AS employee_id,
                   employee.full_name AS employee_name, rwi.status,
                   rwi.room_number, rwi.desk_identifier,
                   rwi.modality_id, modality.name AS modality_name,
                   appointment.start_time, appointment.receptionist_assignment_version AS version
            FROM reception_work_items rwi
            JOIN appointments appointment ON appointment.appointment_id = rwi.appointment_id
            JOIN users employee ON employee.user_id = rwi.claimed_by
                AND employee.is_active = TRUE AND employee.role = 'Receptionist'
            LEFT JOIN modalities modality ON modality.modality_id = rwi.modality_id
            WHERE rwi.status IN ('Claimed', 'In_Progress')
              AND appointment.receptionist_id = rwi.claimed_by
              AND (rwi.lease_expires_at IS NULL OR rwi.lease_expires_at > CURRENT_TIMESTAMP)
              AND EXISTS (
                  SELECT 1 FROM reception_supervisor_assignments assignment
                  JOIN users supervisor ON supervisor.user_id = assignment.supervisor_id
                      AND supervisor.is_active = TRUE AND supervisor.role = 'Receptionist'
                  WHERE assignment.employee_id = employee.user_id
                    AND assignment.supervisor_id = $1
                    AND assignment.can_transfer_tasks = TRUE
                    AND assignment.revoked_at IS NULL
                    AND assignment.starts_at <= CURRENT_TIMESTAMP
                    AND (assignment.ends_at IS NULL OR assignment.ends_at > CURRENT_TIMESTAMP)
              )
            ORDER BY rwi.claimed_at DESC
            LIMIT 100
        `, [req.user.user_id]);
        res.json(result.rows);
    } catch (error) { next(error); }
};

const createAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        const data = assignmentSchema.parse(req.body || {});
        if (data.supervisorId === data.employeeId) throw new AppError('A supervisor cannot supervise themselves', 400);
        if (data.canManageHandovers && !data.canViewShifts) throw new AppError('Handover management requires shift visibility', 400);
        if (data.endsAt && new Date(data.endsAt) <= new Date()) throw new AppError('End time must be in the future', 400);
        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 18105))',
            [`${data.supervisorId}:${data.employeeId}`]);
        const staff = await client.query(`
            SELECT user_id FROM users
            WHERE user_id = ANY($1::uuid[]) AND role = 'Receptionist' AND is_active = TRUE
            FOR SHARE
        `, [[data.supervisorId, data.employeeId]]);
        if (staff.rows.length !== 2) throw new AppError('Both users must be active receptionists', 400);
        const existing = await client.query(`
            SELECT 1 FROM reception_supervisor_assignments
            WHERE supervisor_id = $1 AND employee_id = $2 AND revoked_at IS NULL
              AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            LIMIT 1
        `, [data.supervisorId, data.employeeId]);
        if (existing.rows.length) throw new AppError('An active assignment already exists for this pair', 409);
        const result = await client.query(`
            INSERT INTO reception_supervisor_assignments
                (supervisor_id, employee_id, can_view_shifts, can_manage_handovers,
                 can_transfer_tasks, ends_at, assigned_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [data.supervisorId, data.employeeId, data.canViewShifts,
            data.canManageHandovers, data.canTransferTasks, data.endsAt || null, req.user.user_id]);
        await logAction(client, {
            userId: req.user.user_id, action: 'RECEPTION_SUPERVISOR_ASSIGNED',
            resourceId: result.rows[0].assignment_id, resourceTable: 'reception_supervisor_assignments',
            ipAddress: req.ip, details: data, required: true,
        });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally { client?.release(); }
};

const revokeAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        const assignmentId = z.string().uuid().parse(req.params.assignmentId);
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE reception_supervisor_assignments
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE assignment_id = $1 AND revoked_at IS NULL
            RETURNING *
        `, [assignmentId]);
        if (!result.rows.length) throw new AppError('Active assignment not found', 404);
        await logAction(client, {
            userId: req.user.user_id, action: 'RECEPTION_SUPERVISOR_REVOKED',
            resourceId: assignmentId, resourceTable: 'reception_supervisor_assignments',
            ipAddress: req.ip, details: { supervisorId: result.rows[0].supervisor_id, employeeId: result.rows[0].employee_id },
            required: true,
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally { client?.release(); }
};

const updateAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        const assignmentId = z.string().uuid().parse(req.params.assignmentId);
        const data = updateSchema.parse(req.body || {});
        if (!Object.keys(data).length) throw new AppError('No changes provided', 400);
        if (data.endsAt && new Date(data.endsAt) <= new Date()) throw new AppError('End time must be in the future', 400);
        client = await db.connect();
        await client.query('BEGIN');
        const before = await client.query(`
            SELECT * FROM reception_supervisor_assignments
            WHERE assignment_id = $1 AND revoked_at IS NULL
              AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            FOR UPDATE
        `, [assignmentId]);
        if (!before.rows.length) throw new AppError('Active assignment not found', 404);
        const original = before.rows[0];
        const canViewShifts = data.canViewShifts ?? original.can_view_shifts;
        const canManageHandovers = data.canManageHandovers ?? original.can_manage_handovers;
        if (canManageHandovers && !canViewShifts) throw new AppError('Handover management requires shift visibility', 400);
        if (new Date(original.starts_at) > new Date(data.endsAt || original.ends_at || '9999-12-31')) {
            throw new AppError('End time must be after the assignment start', 400);
        }
        const result = await client.query(`
            UPDATE reception_supervisor_assignments SET
                can_view_shifts = $2, can_manage_handovers = $3,
                can_transfer_tasks = $4, ends_at = $5
            WHERE assignment_id = $1 RETURNING *
        `, [assignmentId,
            canViewShifts,
            canManageHandovers,
            data.canTransferTasks ?? original.can_transfer_tasks,
            data.endsAt === undefined ? original.ends_at : data.endsAt]);
        await logAction(client, {
            userId: req.user.user_id, action: 'RECEPTION_SUPERVISOR_UPDATED',
            resourceId: assignmentId, resourceTable: 'reception_supervisor_assignments',
            ipAddress: req.ip, details: { before: original, after: result.rows[0] }, required: true,
        });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally { client?.release(); }
};

module.exports = { listAssignments, listSupervisedTasks, createAssignment, updateAssignment, revokeAssignment };
