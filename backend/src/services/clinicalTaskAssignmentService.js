const { AppError } = require('../utils/errors');

const CLINICAL_TASK_ROLES = ['Nurse', 'Technician', 'Radiologist'];

const ROLE_CONFIG = Object.freeze({
    Nurse: {
        station: 'Nurse',
        stages: ['Prep Pending'],
        table: 'appointments',
        idColumn: 'appointment_id',
        assigneeColumn: 'nurse_id',
        assignedAtColumn: 'nurse_assigned_at',
        availableAtColumn: 'nurse_task_available_at',
        startedAtColumn: 'nurse_task_started_at',
        versionColumn: 'nurse_assignment_version'
    },
    Technician: {
        station: 'Modality',
        stages: ['Ready for Exam', 'In Exam'],
        table: 'appointments',
        idColumn: 'appointment_id',
        assigneeColumn: 'technician_id',
        assignedAtColumn: 'technician_assigned_at',
        availableAtColumn: 'technician_task_available_at',
        startedAtColumn: 'technician_task_started_at',
        versionColumn: 'technician_assignment_version'
    },
    Radiologist: {
        station: 'Radiologist',
        stages: ['Reporting'],
        table: 'examinations',
        idColumn: 'exam_id',
        assigneeColumn: 'performing_radiologist_id',
        assignedAtColumn: 'radiologist_assigned_at',
        availableAtColumn: 'radiologist_task_available_at',
        startedAtColumn: 'radiologist_task_started_at',
        versionColumn: 'radiologist_assignment_version'
    }
});

const roleForStation = (station) => CLINICAL_TASK_ROLES.find((role) => ROLE_CONFIG[role].station === station) || null;

const selectTaskForUpdate = async (client, examId) => {
    const result = await client.query(`
        SELECT e.exam_id, e.appointment_id, e.queue_stage, e.current_station,
               e.performing_radiologist_id, e.radiologist_assigned_at,
               e.radiologist_task_available_at, e.radiologist_task_started_at, e.radiologist_assignment_version,
               a.nurse_id, a.nurse_assigned_at, a.nurse_task_available_at, a.nurse_task_started_at, a.nurse_assignment_version,
               a.technician_id, a.technician_assigned_at, a.technician_task_available_at, a.technician_task_started_at, a.technician_assignment_version
        FROM examinations e
        JOIN appointments a ON a.appointment_id = e.appointment_id
        WHERE e.exam_id = $1
        FOR UPDATE OF e, a
    `, [examId]);
    return result.rows[0] || null;
};

const assignmentFromRow = (row, role) => {
    const config = ROLE_CONFIG[role];
    return {
        assignedUserId: row?.[config.assigneeColumn] || null,
        assignedAt: row?.[config.assignedAtColumn] || null,
        availableAt: row?.[config.availableAtColumn] || null,
        startedAt: row?.[config.startedAtColumn] || null,
        version: Number(row?.[config.versionColumn] || 0)
    };
};

const assertTaskMatchesRole = (row, role) => {
    const config = ROLE_CONFIG[role];
    if (!config || row.current_station !== config.station || !config.stages.includes(row.queue_stage)) {
        throw new AppError('Clinical task not found or not available for this role', 404, true, 'TASK_NOT_FOUND');
    }
};

const writeAssignmentEvent = async (client, {
    row,
    role,
    action,
    previousUserId,
    newUserId,
    performedBy,
    reason,
    version
}) => {
    await client.query(`
        INSERT INTO clinical_task_assignment_events (
            exam_id, appointment_id, task_role, action, previous_user_id,
            new_user_id, performed_by, reason, assignment_version
            , available_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
        row.exam_id,
        row.appointment_id,
        role,
        action,
        previousUserId,
        newUserId,
        performedBy,
        reason || null,
        version,
        row[ROLE_CONFIG[role].availableAtColumn] || null
    ]);
};

const updateAssignment = async (client, row, role, userId) => {
    const config = ROLE_CONFIG[role];
    const recordId = row[config.idColumn];
    const result = await client.query(`
        UPDATE ${config.table}
        SET ${config.assigneeColumn} = $1,
            ${config.assignedAtColumn} = NOW(),
            ${config.startedAtColumn} = NULL,
            ${config.versionColumn} = ${config.versionColumn} + 1
        WHERE ${config.idColumn} = $2
        RETURNING ${config.assigneeColumn} AS assigned_user_id,
                  ${config.assignedAtColumn} AS assigned_at,
                  ${config.versionColumn} AS assignment_version
    `, [userId, recordId]);
    return result.rows[0];
};

const clearAssignment = async (client, row, role) => {
    const config = ROLE_CONFIG[role];
    const recordId = row[config.idColumn];
    const result = await client.query(`
        UPDATE ${config.table}
        SET ${config.assigneeColumn} = NULL,
            ${config.assignedAtColumn} = NULL,
            ${config.availableAtColumn} = NOW(),
            ${config.startedAtColumn} = NULL,
            ${config.versionColumn} = ${config.versionColumn} + 1
        WHERE ${config.idColumn} = $1
        RETURNING ${config.availableAtColumn} AS task_available_at,
                  ${config.versionColumn} AS assignment_version
    `, [recordId]);
    return result.rows[0];
};

const claimTask = async (client, { examId, user }) => {
    const role = user.role;
    if (!CLINICAL_TASK_ROLES.includes(role)) {
        throw new AppError('Only eligible clinical users may accept this task', 403, true, 'ROLE_NOT_ELIGIBLE');
    }

    const row = await selectTaskForUpdate(client, examId);
    if (!row) throw new AppError('Clinical task not found', 404, true, 'TASK_NOT_FOUND');
    assertTaskMatchesRole(row, role);

    const current = assignmentFromRow(row, role);
    if (current.assignedUserId) {
        if (String(current.assignedUserId) === String(user.user_id)) {
            return {
                exam_id: row.exam_id,
                appointment_id: row.appointment_id,
                task_role: role,
                assigned_user_id: current.assignedUserId,
                assigned_at: current.assignedAt,
                assignment_version: current.version,
                assignment_status: 'Assigned'
            };
        }
        throw new AppError('This task was accepted by another user', 409, true, 'TASK_ALREADY_ASSIGNED');
    }

    const assignment = await updateAssignment(client, row, role, user.user_id);
    await writeAssignmentEvent(client, {
        row,
        role,
        action: 'Claim',
        previousUserId: null,
        newUserId: user.user_id,
        performedBy: user.user_id,
        version: assignment.assignment_version
    });

    return {
        exam_id: row.exam_id,
        appointment_id: row.appointment_id,
        task_role: role,
        ...assignment,
        assignment_status: 'Assigned'
    };
};

const markTaskStarted = async (client, row, role) => {
    const config = ROLE_CONFIG[role];
    if (!config) return null;
    const result = await client.query(`
        UPDATE ${config.table}
        SET ${config.startedAtColumn} = COALESCE(${config.startedAtColumn}, NOW())
        WHERE ${config.idColumn} = $1
        RETURNING ${config.startedAtColumn} AS task_started_at
    `, [row[config.idColumn]]);
    return result.rows[0]?.task_started_at || null;
};

const markTaskAvailable = async (client, row, role) => {
    const config = ROLE_CONFIG[role];
    if (!config) return null;
    const result = await client.query(`
        UPDATE ${config.table}
        SET ${config.availableAtColumn} = NOW(),
            ${config.startedAtColumn} = NULL,
            ${config.versionColumn} = ${config.versionColumn} + 1
        WHERE ${config.idColumn} = $1
        RETURNING ${config.availableAtColumn} AS task_available_at,
                  ${config.versionColumn} AS assignment_version
    `, [row[config.idColumn]]);
    return result.rows[0] || null;
};

const completeTask = async (client, row, role, performedBy) => {
    const current = assignmentFromRow(row, role);
    if (!current.assignedUserId) return null;

    await writeAssignmentEvent(client, {
        row,
        role,
        action: 'Complete',
        previousUserId: current.assignedUserId,
        newUserId: null,
        performedBy,
        version: current.version
    });
    return {
        exam_id: row.exam_id,
        appointment_id: row.appointment_id,
        task_role: role,
        previous_user_id: current.assignedUserId,
        assignment_version: current.version,
        assignment_status: 'Completed'
    };
};

const assignTask = async (client, { examId, targetUserId, actor, reason }) => {
    const targetResult = await client.query(`
        SELECT user_id, role
        FROM users
        WHERE user_id = $1 AND is_active = TRUE
    `, [targetUserId]);
    const target = targetResult.rows[0];
    if (!target || !CLINICAL_TASK_ROLES.includes(target.role)) {
        throw new AppError('Target user is not an active eligible clinical user', 422, true, 'ROLE_NOT_ELIGIBLE');
    }

    const row = await selectTaskForUpdate(client, examId);
    if (!row) throw new AppError('Clinical task not found', 404, true, 'TASK_NOT_FOUND');
    assertTaskMatchesRole(row, target.role);

    const current = assignmentFromRow(row, target.role);
    if (String(current.assignedUserId || '') === String(target.user_id)) {
        return {
            exam_id: row.exam_id,
            appointment_id: row.appointment_id,
            task_role: target.role,
            assigned_user_id: current.assignedUserId,
            assigned_at: current.assignedAt,
            assignment_version: current.version,
            assignment_status: 'Assigned'
        };
    }

    if (current.assignedUserId && !reason) {
        throw new AppError('A transfer reason is required', 422, true, 'REASON_REQUIRED');
    }

    const assignment = await updateAssignment(client, row, target.role, target.user_id);
    await writeAssignmentEvent(client, {
        row,
        role: target.role,
        action: current.assignedUserId ? 'Transfer' : 'Assign',
        previousUserId: current.assignedUserId,
        newUserId: target.user_id,
        performedBy: actor.user_id,
        reason,
        version: assignment.assignment_version
    });

    return {
        exam_id: row.exam_id,
        appointment_id: row.appointment_id,
        task_role: target.role,
        previous_user_id: current.assignedUserId,
        ...assignment,
        assignment_status: 'Assigned'
    };
};

const releaseTask = async (client, { examId, actor, reason }) => {
    const row = await selectTaskForUpdate(client, examId);
    if (!row) throw new AppError('Clinical task not found', 404, true, 'TASK_NOT_FOUND');

    const role = roleForStation(row.current_station);
    if (!role) throw new AppError('Clinical task not found', 404, true, 'TASK_NOT_FOUND');
    assertTaskMatchesRole(row, role);

    const current = assignmentFromRow(row, role);
    if (!current.assignedUserId) {
        throw new AppError('This task is already unassigned', 409, true, 'TASK_ALREADY_UNASSIGNED');
    }
    if (actor.role !== 'Admin' && (actor.role !== role || String(current.assignedUserId) !== String(actor.user_id))) {
        throw new AppError('Clinical task not found', 404, true, 'TASK_NOT_FOUND');
    }

    const assignment = await clearAssignment(client, row, role);
    const eventRow = {
        ...row,
        [ROLE_CONFIG[role].availableAtColumn]: assignment.task_available_at
    };
    await writeAssignmentEvent(client, {
        row: eventRow,
        role,
        action: 'Release',
        previousUserId: current.assignedUserId,
        newUserId: null,
        performedBy: actor.user_id,
        reason,
        version: assignment.assignment_version
    });

    return {
        exam_id: row.exam_id,
        appointment_id: row.appointment_id,
        task_role: role,
        previous_user_id: current.assignedUserId,
        assigned_user_id: null,
        assigned_at: null,
        task_available_at: assignment.task_available_at,
        assignment_version: assignment.assignment_version,
        assignment_status: 'Unassigned'
    };
};

module.exports = {
    CLINICAL_TASK_ROLES,
    ROLE_CONFIG,
    roleForStation,
    assignmentFromRow,
    markTaskStarted,
    markTaskAvailable,
    completeTask,
    claimTask,
    assignTask,
    releaseTask
};
