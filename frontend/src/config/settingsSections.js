import { getEffectivePermissions, isEmergencyAccessActive } from '../utils/effectivePermissions';

export const SETTINGS_SECTION_ACCESS = Object.freeze({
    appearance: { roles: ['*'] },
    preferences: { roles: ['*'] },
    notifications: { roles: ['*'] },
    audit: { roles: ['*'] },
    team: { roles: ['Developer', 'Admin', 'HR'] },
    facility: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_SETTINGS'] },
    portalBuilder: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_SETTINGS'] },
    integrations: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_INTEGRATIONS'] },
    pacs: { roles: ['Developer'], permissions: ['MANAGE_PACS'], allowPermissionOverride: true },
    admin: { roles: ['Developer', 'Admin'] },
    roles: {
        roles: ['Developer', 'Admin'],
        permissions: ['MANAGE_ROLES', 'MANAGE_SETTINGS', 'VIEW_STAFF', 'VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS'],
    },
    privacy: { roles: ['Developer', 'Admin'], permissions: ['VIEW_PRIVACY_REQUESTS'] },
    backups: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_BACKUPS'] },
    auditLogs: {
        roles: ['Developer', 'Admin'],
        permissions: ['VIEW_AUDIT_TRAILS'],
        // Migration 087 deliberately grants VIEW_AUDIT_TRAILS to Accountants so
        // they can inspect trails during finance reconciliation. Honour that
        // here too, otherwise the UI hides a section the backend will happily
        // serve. Note this is the *trail* permission: VIEW_AUDIT_LOGS is the
        // narrower "limited staff activity" claim and must not open this page.
        allowPermissionOverride: true,
    },
    ai: { roles: ['Developer'], permissions: ['MANAGE_SECRET_SETTINGS'] },
    developer: { roles: ['Developer'], permissions: ['MANAGE_DATABASE_CONFIG'] },
    updates: { roles: ['Developer', 'Admin'], permissions: ['MANAGE_SETTINGS'] },
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
