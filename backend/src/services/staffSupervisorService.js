const { AppError } = require('../utils/errors');

const SUPERVISOR_CAPABILITIES = Object.freeze({
    leave: 'can_approve_leave',
    attendance: 'can_approve_attendance',
    shifts: 'can_approve_shifts',
    adjustments: 'can_recommend_adjustments',
});

const OPERATIONAL_ROLES = new Set([
    'Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier',
    'Accountant', 'Insurance_Staff', 'Marketing',
]);

const ALLOWED_SUPERVISION_MAP = Object.freeze({
    Radiologist: ['Radiologist', 'Technician'],
    Technician: ['Technician'],
    Nurse: ['Nurse'],
    Receptionist: ['Receptionist', 'Cashier'],
    Cashier: ['Cashier'],
    Accountant: ['Accountant', 'Cashier'],
    Insurance_Staff: ['Insurance_Staff'],
    Marketing: ['Marketing'],
    HR: ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'],
    Admin: ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'],
    Developer: ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'],
});

const isSupervisionRoleCompatible = (supervisorRole, employeeRole) => {
    const allowed = ALLOWED_SUPERVISION_MAP[supervisorRole];
    return Array.isArray(allowed) && allowed.includes(employeeRole);
};

const isGlobalReviewer = (user) => ['Admin', 'Developer', 'HR'].includes(user?.role);

const hasStaffSupervision = async (db, user, employeeId, capability, { lock = false } = {}) => {
    if (!user?.user_id || !employeeId || user.user_id === employeeId) return false;
    const column = SUPERVISOR_CAPABILITIES[capability];
    if (!column) throw new Error(`Unknown staff supervision capability: ${capability}`);
    const result = await db.query(`
        SELECT assignment.assignment_id
        FROM staff_supervisor_assignments assignment
        JOIN users supervisor ON supervisor.user_id = assignment.supervisor_id
            AND supervisor.is_active = TRUE
        JOIN users employee ON employee.user_id = assignment.employee_id
            AND employee.is_active = TRUE
        WHERE assignment.supervisor_id = $1 AND assignment.employee_id = $2
          AND assignment.${column} = TRUE AND assignment.revoked_at IS NULL
          AND assignment.starts_at <= CURRENT_TIMESTAMP
          AND (assignment.ends_at IS NULL OR assignment.ends_at > CURRENT_TIMESTAMP)
        LIMIT 1 ${lock ? 'FOR SHARE OF assignment' : ''}
    `, [user.user_id, employeeId]);
    return result.rows.length > 0;
};

const assertStaffSupervision = async (db, user, employeeId, capability, options) => {
    if (!await hasStaffSupervision(db, user, employeeId, capability, options)) {
        throw new AppError('Employee is outside your active supervision scope', 403);
    }
};

module.exports = {
    SUPERVISOR_CAPABILITIES,
    OPERATIONAL_ROLES,
    ALLOWED_SUPERVISION_MAP,
    isSupervisionRoleCompatible,
    isGlobalReviewer,
    hasStaffSupervision,
    assertStaffSupervision
};
