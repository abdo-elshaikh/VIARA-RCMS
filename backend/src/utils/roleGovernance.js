const { AppError } = require('../middleware/errorHandler');

const PROTECTED_ROLES = new Set(['Developer', 'Admin']);
// Portal identities whose grants back patient/doctor/referring-portal routes.
// Editing these silently breaks portal access, so they are system-governed.
const PORTAL_ROLES = new Set(['Patient', 'Doctor', 'Referring_Doctor']);

const isDeveloper = (user) => user?.role === 'Developer';
const isProtectedRole = (role) => PROTECTED_ROLES.has(role);
const isPortalRole = (role) => PORTAL_ROLES.has(role);

// User-management scope (assign/change a user's role). HR keeps staff scope.
const canManageRole = (actor, targetRole) => {
    if (isDeveloper(actor)) return true;
    if (isProtectedRole(targetRole)) return false;
    return ['Admin', 'HR'].includes(actor?.role);
};

// RBAC policy scope (edit a role's permission grants). Matches the route
// guards (Admin/Developer only) — HR manages people, not security policy.
const canManageRolePermissions = (actor, targetRole) => {
    if (isDeveloper(actor)) return true;
    if (isProtectedRole(targetRole)) return false;
    if (isPortalRole(targetRole)) return false;
    return actor?.role === 'Admin';
};

const canAssignRole = (actor, nextRole) => {
    if (isDeveloper(actor)) return true;
    return !isProtectedRole(nextRole);
};

const assertCanManageRole = (actor, targetRole) => {
    if (!canManageRole(actor, targetRole)) {
        throw new AppError('Only a Developer may manage protected roles', 403);
    }
};

const assertCanManageRolePermissions = (actor, targetRole) => {
    if (!canManageRolePermissions(actor, targetRole)) {
        throw new AppError(
            isPortalRole(targetRole)
                ? 'Portal role permissions are system-governed; only a Developer may change them'
                : 'Only a Developer may manage protected role permissions',
            403
        );
    }
};

const assertCanAssignRole = (actor, nextRole) => {
    if (!canAssignRole(actor, nextRole)) {
        throw new AppError('Only a Developer may assign protected roles', 403);
    }
};

const assertProtectedUserMutation = async (client, actor, target, nextRole, nextActive) => {
    if (actor?.user_id === target.user_id
        && (nextActive === false || (nextRole && nextRole !== target.role))) {
        throw new AppError('You cannot deactivate or change your own role', 409);
    }

    assertCanManageRole(actor, target.role);
    if (nextRole) assertCanAssignRole(actor, nextRole);

    for (const role of PROTECTED_ROLES) {
        const removesActiveProtected = target.role === role
            && target.is_active
            && (nextActive === false || (nextRole && nextRole !== role));

        if (!removesActiveProtected) continue;

        const result = await client.query(
            'SELECT COUNT(*)::int AS count FROM users WHERE role = $1 AND is_active = TRUE',
            [role]
        );
        if (result.rows[0].count <= 1) {
            throw new AppError(`The final active ${role} account cannot be removed`, 409);
        }
    }
};

module.exports = {
    PROTECTED_ROLES,
    PORTAL_ROLES,
    isDeveloper,
    isProtectedRole,
    isPortalRole,
    canManageRole,
    canManageRolePermissions,
    canAssignRole,
    assertCanAssignRole,
    assertCanManageRole,
    assertCanManageRolePermissions,
    assertProtectedUserMutation
};
