import { getEffectivePermissions, isEmergencyAccessActive } from '../utils/effectivePermissions';

export const SETTINGS_SECTION_ACCESS = Object.freeze({
    appearance: { roles: ['*'] },
    preferences: { roles: ['*'] },
    notifications: { roles: ['*'] },
    audit: { roles: ['*'] },
    team: { roles: ['Developer', 'Admin', 'HR'] },
    facility: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_SETTINGS'] },
    clinical: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_EQUIPMENT', 'MANAGE_EXAM_CATALOG'] },
    integrations: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_INTEGRATIONS'] },
    pacs: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_PACS'] },
    admin: { roles: ['Developer', 'Admin'] },
    roles: {
        roles: ['Developer', 'Admin'],
        permissions: ['MANAGE_ROLES', 'MANAGE_SETTINGS', 'VIEW_STAFF', 'VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS'],
    },
    privacy: { roles: ['Developer', 'Admin'], permissions: ['VIEW_PRIVACY_REQUESTS'] },
    backups: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_BACKUPS'] },
    auditLogs: {
        roles: ['Developer', 'Admin'],
        permissions: ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS'],
        allowPermissionOverride: true,
    },
    ai: { roles: ['Developer'], permissions: ['MANAGE_SECRET_SETTINGS'] },
    developer: { roles: ['Developer'], permissions: ['MANAGE_DATABASE_CONFIG'] },
});

export const canAccessSettingsSection = (sectionId, user = {}) => {
    const policy = SETTINGS_SECTION_ACCESS[sectionId];
    if (!policy) return false;

    const role = user?.role;
    if (!role) return false;
    if (role === 'Developer') return policy.roles.includes('Developer') || policy.roles.includes('*');

    const roleAllowed = policy.roles.includes('*') || policy.roles.includes(role);
    const hasExplicitClaims = Array.isArray(user.permissions) || isEmergencyAccessActive(user);
    const requiredPermissions = policy.permissions || [];

    if (!requiredPermissions.length) return roleAllowed;
    if (!hasExplicitClaims) return roleAllowed;

    const granted = getEffectivePermissions(user);
    const permissionAllowed = requiredPermissions.some((permission) => granted.has(permission));
    return policy.allowPermissionOverride ? roleAllowed || permissionAllowed : roleAllowed && permissionAllowed;
};
