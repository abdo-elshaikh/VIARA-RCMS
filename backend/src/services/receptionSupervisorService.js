const { AppError } = require('../utils/errors');

const CAPABILITY_COLUMNS = {
    view_shifts: 'can_view_shifts',
    manage_handovers: 'can_manage_handovers',
    transfer_tasks: 'can_transfer_tasks',
};

const hasReceptionSupervision = async (db, user, employeeId, capability) => {
    if (['Admin', 'Developer'].includes(user?.role)) return true;
    if (user?.role !== 'Receptionist' || !user?.user_id || !employeeId) return false;
    const column = CAPABILITY_COLUMNS[capability];
    if (!column) throw new Error(`Unknown reception supervision capability: ${capability}`);
    const result = await db.query(`
        SELECT 1 FROM reception_supervisor_assignments a
        JOIN users supervisor ON supervisor.user_id = a.supervisor_id AND supervisor.is_active = TRUE
        JOIN users employee ON employee.user_id = a.employee_id AND employee.is_active = TRUE
        WHERE a.supervisor_id = $1 AND a.employee_id = $2
          AND supervisor.role = 'Receptionist' AND employee.role = 'Receptionist'
          AND a.${column} = TRUE AND a.revoked_at IS NULL
          AND a.starts_at <= CURRENT_TIMESTAMP
          AND (a.ends_at IS NULL OR a.ends_at > CURRENT_TIMESTAMP)
        LIMIT 1
    `, [user.user_id, employeeId]);
    return result.rows.length > 0;
};

const assertReceptionSupervision = async (db, user, employeeId, capability) => {
    if (!await hasReceptionSupervision(db, user, employeeId, capability)) {
        throw new AppError('This employee is outside your active supervision scope', 403);
    }
};

module.exports = { hasReceptionSupervision, assertReceptionSupervision };
