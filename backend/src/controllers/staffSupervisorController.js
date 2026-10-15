const { z } = require('zod');
const { AppError } = require('../utils/errors');
const { logAction } = require('../services/auditService');
const { OPERATIONAL_ROLES, isGlobalReviewer, assertStaffSupervision, isSupervisionRoleCompatible } = require('../services/staffSupervisorService');

const assignmentFields = z.object({
    canApproveLeave: z.boolean().default(false),
    canApproveAttendance: z.boolean().default(false),
    canApproveShifts: z.boolean().default(false),
    canRecommendAdjustments: z.boolean().default(false),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const createSchema = assignmentFields.extend({
    supervisorId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    employeeIds: z.array(z.string().uuid()).min(1).max(200).optional(),
}).refine(
    (data) => Boolean(data.employeeId) || (Array.isArray(data.employeeIds) && data.employeeIds.length > 0),
    { message: 'Either employeeId or a non-empty employeeIds array must be provided' }
);
const updateSchema = assignmentFields.partial();
const recommendationSchema = z.object({
    employeeId: z.string().uuid(),
    type: z.enum(['Incentive', 'Deduction', 'Penalty']),
    amount: z.number().positive().max(1000000),
    reason: z.string().trim().min(10).max(2000),
});
const reviewSchema = z.object({ status: z.enum(['Approved', 'Rejected']), notes: z.string().trim().max(1000).optional() });
const getActorId = (req) => req.user?.user_id || req.user?.userId;

const listAssignments = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT assignment.*, supervisor.full_name AS supervisor_name,
                   employee.full_name AS employee_name, employee.role AS department_role
            FROM staff_supervisor_assignments assignment
            JOIN users supervisor ON supervisor.user_id = assignment.supervisor_id
            JOIN users employee ON employee.user_id = assignment.employee_id
            WHERE ($1::boolean OR assignment.supervisor_id = $2)
              AND assignment.revoked_at IS NULL
              AND (assignment.ends_at IS NULL OR assignment.ends_at > CURRENT_TIMESTAMP)
            ORDER BY assignment.created_at DESC LIMIT 1000
        `, [isGlobalReviewer(req.user), getActorId(req)]);
        res.json(result.rows);
    } catch (error) { next(error); }
};

const createAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        const data = createSchema.parse(req.body || {});
        const rawIds = Array.isArray(data.employeeIds) && data.employeeIds.length > 0
            ? data.employeeIds
            : [data.employeeId];
        const employeeIds = [...new Set(rawIds.filter(Boolean))];

        if (employeeIds.length === 0) {
            throw new AppError('No valid employees selected', 400);
        }
        if (employeeIds.includes(data.supervisorId)) {
            throw new AppError('A supervisor cannot supervise themselves', 400);
        }
        if (data.endsAt && new Date(data.endsAt) <= new Date()) {
            throw new AppError('End time must be in the future', 400);
        }

        client = await db.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 18205))', [data.supervisorId]);

        const allUserIds = [data.supervisorId, ...employeeIds];
        const staffRes = await client.query(`
            SELECT user_id, role, full_name FROM users
            WHERE user_id = ANY($1::uuid[]) AND is_active = TRUE FOR SHARE
        `, [allUserIds]);

        const supervisorUser = staffRes.rows.find((u) => u.user_id === data.supervisorId);
        if (!supervisorUser) {
            throw new AppError('Supervisor not found or inactive', 400);
        }

        const employeeUsers = staffRes.rows.filter((u) => u.user_id !== data.supervisorId);
        if (employeeUsers.length !== employeeIds.length) {
            throw new AppError('One or more selected employees were not found or are inactive', 400);
        }

        for (const emp of employeeUsers) {
            if (!isSupervisionRoleCompatible(supervisorUser.role, emp.role)) {
                throw new AppError(`Supervisor with role ${supervisorUser.role} cannot supervise role ${emp.role} (${emp.full_name})`, 400);
            }
        }

        const existingRes = await client.query(`
            SELECT employee_id FROM staff_supervisor_assignments
            WHERE supervisor_id = $1 AND employee_id = ANY($2::uuid[]) AND revoked_at IS NULL
              AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
        `, [data.supervisorId, employeeIds]);

        const alreadyAssignedSet = new Set(existingRes.rows.map((r) => r.employee_id));

        if (employeeIds.length === 1 && alreadyAssignedSet.has(employeeIds[0])) {
            throw new AppError('An active supervision assignment already exists', 409);
        }

        const idsToInsert = employeeIds.filter((id) => !alreadyAssignedSet.has(id));
        const idsToUpdate = employeeIds.filter((id) => alreadyAssignedSet.has(id));
        const results = [];

        if (idsToUpdate.length > 0) {
            const updateRes = await client.query(`
                UPDATE staff_supervisor_assignments
                SET can_approve_leave = $1,
                    can_approve_attendance = $2,
                    can_approve_shifts = $3,
                    can_recommend_adjustments = $4,
                    ends_at = $5,
                    assigned_by = $6,
                    updated_at = CURRENT_TIMESTAMP
                WHERE supervisor_id = $7 AND employee_id = ANY($8::uuid[]) AND revoked_at IS NULL
                  AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
                RETURNING *
            `, [
                data.canApproveLeave, data.canApproveAttendance, data.canApproveShifts,
                data.canRecommendAdjustments, data.endsAt || null, getActorId(req),
                data.supervisorId, idsToUpdate
            ]);
            results.push(...updateRes.rows);
        }

        for (const empId of idsToInsert) {
            const insertRes = await client.query(`
                INSERT INTO staff_supervisor_assignments
                    (supervisor_id, employee_id, can_approve_leave, can_approve_attendance,
                     can_approve_shifts, can_recommend_adjustments, ends_at, assigned_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
            `, [
                data.supervisorId, empId, data.canApproveLeave, data.canApproveAttendance,
                data.canApproveShifts, data.canRecommendAdjustments, data.endsAt || null, getActorId(req)
            ]);
            results.push(insertRes.rows[0]);
        }

        await logAction(client, {
            userId: getActorId(req),
            action: 'STAFF_SUPERVISOR_ASSIGNED',
            resourceId: results[0]?.assignment_id || data.supervisorId,
            resourceTable: 'staff_supervisor_assignments',
            ipAddress: req.ip,
            details: {
                supervisorId: data.supervisorId,
                assignedCount: results.length,
                employeeIds,
                capabilities: {
                    leave: data.canApproveLeave,
                    attendance: data.canApproveAttendance,
                    shifts: data.canApproveShifts,
                    adjustments: data.canRecommendAdjustments,
                }
            },
            required: true
        });

        await client.query('COMMIT');

        if (data.employeeId && (!data.employeeIds || data.employeeIds.length <= 1)) {
            res.status(201).json(results[0]);
        } else {
            res.status(201).json({
                success: true,
                count: results.length,
                assignments: results,
                rows: results,
            });
        }
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        client?.release();
    }
};

const updateAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        const id = z.string().uuid().parse(req.params.id);
        const data = updateSchema.parse(req.body || {});
        if (!Object.keys(data).length) throw new AppError('No changes provided', 400);
        if (data.endsAt && new Date(data.endsAt) <= new Date()) throw new AppError('End time must be in the future', 400);
        client = await db.connect();
        await client.query('BEGIN');
        const before = await client.query(`
            SELECT * FROM staff_supervisor_assignments WHERE assignment_id = $1
              AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
            FOR UPDATE
        `, [id]);
        if (!before.rows.length) throw new AppError('Active assignment not found', 404);
        const old = before.rows[0];
        const result = await client.query(`
            UPDATE staff_supervisor_assignments SET can_approve_leave = $2,
                can_approve_attendance = $3, can_approve_shifts = $4,
                can_recommend_adjustments = $5, ends_at = $6
            WHERE assignment_id = $1 RETURNING *
        `, [id, data.canApproveLeave ?? old.can_approve_leave,
            data.canApproveAttendance ?? old.can_approve_attendance,
            data.canApproveShifts ?? old.can_approve_shifts,
            data.canRecommendAdjustments ?? old.can_recommend_adjustments,
            data.endsAt === undefined ? old.ends_at : data.endsAt]);
        await logAction(client, { userId: getActorId(req), action: 'STAFF_SUPERVISOR_UPDATED',
            resourceId: id, resourceTable: 'staff_supervisor_assignments', ipAddress: req.ip,
            details: { before: old, after: result.rows[0] }, required: true });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) { if (client) await client.query('ROLLBACK'); next(error); }
    finally { client?.release(); }
};

const revokeAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        const id = z.string().uuid().parse(req.params.id);
        client = await db.connect();
        await client.query('BEGIN');
        const result = await client.query(`
            UPDATE staff_supervisor_assignments SET revoked_at = CURRENT_TIMESTAMP
            WHERE assignment_id = $1 AND revoked_at IS NULL RETURNING *
        `, [id]);
        if (!result.rows.length) throw new AppError('Active assignment not found', 404);
        await logAction(client, { userId: getActorId(req), action: 'STAFF_SUPERVISOR_REVOKED',
            resourceId: id, resourceTable: 'staff_supervisor_assignments', ipAddress: req.ip,
            details: { supervisorId: result.rows[0].supervisor_id, employeeId: result.rows[0].employee_id }, required: true });
        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) { if (client) await client.query('ROLLBACK'); next(error); }
    finally { client?.release(); }
};

const getInbox = (db) => async (req, res, next) => {
    try {
        const global = isGlobalReviewer(req.user);
        const actorId = getActorId(req);
        const [leave, attendance, shifts] = await Promise.all([
            db.query(`SELECT l.request_id AS id, l.user_id AS employee_id, u.full_name AS employee_name,
                        u.role AS employee_role, 'leave' AS kind, l.leave_type AS type, l.reason,
                        l.start_date, l.end_date, l.created_at
                      FROM leave_requests l JOIN users u ON u.user_id = l.user_id
                      WHERE l.status = 'Pending' AND l.user_id <> $2
                        AND ($1::boolean OR EXISTS (
                            SELECT 1 FROM staff_supervisor_assignments a
                            JOIN users supervisor ON supervisor.user_id = a.supervisor_id
                                AND supervisor.is_active = TRUE
                            WHERE a.supervisor_id = $2 AND u.is_active = TRUE
                              AND a.employee_id = l.user_id AND a.can_approve_leave = TRUE
                              AND a.revoked_at IS NULL AND a.starts_at <= CURRENT_TIMESTAMP
                              AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP)))
                      ORDER BY l.created_at DESC LIMIT 100`, [global, actorId]),
            db.query(`SELECT p.permission_id AS id, p.user_id AS employee_id, u.full_name AS employee_name,
                        u.role AS employee_role, 'attendance' AS kind, p.permission_type AS type, p.reason,
                        p.effective_date, p.allowed_time, p.minutes_granted, p.created_at
                      FROM attendance_permissions p JOIN users u ON u.user_id = p.user_id
                      WHERE p.status = 'Pending' AND p.user_id <> $2
                        AND ($1::boolean OR EXISTS (
                            SELECT 1 FROM staff_supervisor_assignments a
                            JOIN users supervisor ON supervisor.user_id = a.supervisor_id
                                AND supervisor.is_active = TRUE
                            WHERE a.supervisor_id = $2 AND u.is_active = TRUE
                              AND a.employee_id = p.user_id AND a.can_approve_attendance = TRUE
                              AND a.revoked_at IS NULL AND a.starts_at <= CURRENT_TIMESTAMP
                              AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP)))
                      ORDER BY p.created_at DESC LIMIT 100`, [global, actorId]),
            db.query(`SELECT s.request_id AS id, s.user_id AS employee_id, u.full_name AS employee_name,
                        u.role AS employee_role, 'shifts' AS kind, s.request_type AS type, s.reason,
                        s.target_user_id, tu.full_name AS target_user_name,
                        s.requested_start_time, s.requested_end_time, s.created_at
                      FROM staff_shift_requests s
                      JOIN users u ON u.user_id = s.user_id
                      LEFT JOIN users tu ON tu.user_id = s.target_user_id
                      WHERE s.status = 'Pending' AND s.user_id <> $2
                        AND (s.target_user_id IS NULL OR s.target_user_id <> $2)
                        AND ($1::boolean OR (EXISTS (
                            SELECT 1 FROM staff_supervisor_assignments a
                            JOIN users supervisor ON supervisor.user_id = a.supervisor_id
                                AND supervisor.is_active = TRUE
                            WHERE a.supervisor_id = $2 AND u.is_active = TRUE
                              AND a.employee_id = s.user_id AND a.can_approve_shifts = TRUE
                              AND a.revoked_at IS NULL AND a.starts_at <= CURRENT_TIMESTAMP
                              AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP))
                          AND (s.target_user_id IS NULL OR EXISTS (
                            SELECT 1 FROM staff_supervisor_assignments a
                            JOIN users supervisor ON supervisor.user_id = a.supervisor_id
                                AND supervisor.is_active = TRUE
                            JOIN users target ON target.user_id = a.employee_id
                                AND target.is_active = TRUE
                            WHERE a.supervisor_id = $2 AND u.is_active = TRUE
                              AND a.employee_id = s.target_user_id AND a.can_approve_shifts = TRUE
                              AND a.revoked_at IS NULL AND a.starts_at <= CURRENT_TIMESTAMP
                              AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP)))))
                      ORDER BY s.created_at DESC LIMIT 100`, [global, actorId]),
        ]);
        res.json([...leave.rows, ...attendance.rows, ...shifts.rows]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (error) { next(error); }
};

const listRecommendations = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT recommendation.*, employee.full_name AS employee_name,
                   supervisor.full_name AS supervisor_name
            FROM supervisor_adjustment_recommendations recommendation
            JOIN users employee ON employee.user_id = recommendation.employee_id
            JOIN users supervisor ON supervisor.user_id = recommendation.supervisor_id
            WHERE $1::boolean OR recommendation.supervisor_id = $2
            ORDER BY recommendation.created_at DESC LIMIT 300
        `, [isGlobalReviewer(req.user), getActorId(req)]);
        res.json(result.rows);
    } catch (error) { next(error); }
};

const createRecommendation = (db) => async (req, res, next) => {
    let client;
    try {
        const data = recommendationSchema.parse(req.body || {});
        client = await db.connect();
        await client.query('BEGIN');
        await assertStaffSupervision(client, req.user, data.employeeId, 'adjustments', { lock: true });
        const result = await client.query(`
            INSERT INTO supervisor_adjustment_recommendations
                (supervisor_id, employee_id, recommendation_type, amount, reason)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [getActorId(req), data.employeeId, data.type, data.amount, data.reason]);
        await logAction(client, { userId: getActorId(req), action: 'SUPERVISOR_ADJUSTMENT_RECOMMENDED',
            resourceId: result.rows[0].recommendation_id,
            resourceTable: 'supervisor_adjustment_recommendations', ipAddress: req.ip,
            details: { employeeId: data.employeeId, type: data.type, amount: data.amount }, required: true });
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (error) { if (client) await client.query('ROLLBACK'); next(error); }
    finally { client?.release(); }
};

const reviewRecommendation = (db) => async (req, res, next) => {
    let client;
    try {
        const id = z.string().uuid().parse(req.params.id);
        const data = reviewSchema.parse(req.body || {});
        client = await db.connect();
        await client.query('BEGIN');
        const before = await client.query(`
            SELECT * FROM supervisor_adjustment_recommendations
            WHERE recommendation_id = $1 FOR UPDATE
        `, [id]);
        if (!before.rows.length) throw new AppError('Recommendation not found', 404);
        if (before.rows[0].status !== 'Pending') throw new AppError('Recommendation has already been reviewed', 409);
        if ([before.rows[0].supervisor_id, before.rows[0].employee_id].includes(getActorId(req))) {
            throw new AppError('You cannot review your own recommendation', 403);
        }
        const result = await client.query(`
            UPDATE supervisor_adjustment_recommendations
            SET status = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, review_notes = $4
            WHERE recommendation_id = $1 RETURNING *
        `, [id, data.status, getActorId(req), data.notes || null]);
        await logAction(client, { userId: getActorId(req), action: 'SUPERVISOR_ADJUSTMENT_REVIEWED',
            resourceId: id, resourceTable: 'supervisor_adjustment_recommendations', ipAddress: req.ip,
            details: { status: data.status, notes: data.notes || null,
                payrollApplied: false }, required: true });
        await client.query('COMMIT');
        res.json({ ...result.rows[0], payrollApplied: false });
    } catch (error) { if (client) await client.query('ROLLBACK'); next(error); }
    finally { client?.release(); }
};

module.exports = { listAssignments, createAssignment, updateAssignment, revokeAssignment,
    getInbox, listRecommendations, createRecommendation, reviewRecommendation };
