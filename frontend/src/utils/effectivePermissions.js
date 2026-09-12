export const isEmergencyAccessActive = (user, now = Date.now()) => Boolean(
    user?.emergencyAccessId
    && Array.isArray(user?.elevatedPermissions)
    && user.elevatedPermissions.length > 0
    && Number(user?.breakGlassExpiry) > now
);

export const getEffectivePermissions = (user = {}, now = Date.now(), explicitPermissions = []) => {
    const permissions = new Set([
        ...(Array.isArray(explicitPermissions) ? explicitPermissions : []),
        ...(Array.isArray(user?.permissions) ? user.permissions : []),
    ]);

    if (isEmergencyAccessActive(user, now)) {
        user.elevatedPermissions.forEach((permission) => permissions.add(permission));
    }

    return permissions;
};

export const hasEffectivePermission = (user, permission, now = Date.now()) => (
    user?.role === 'Developer' || getEffectivePermissions(user, now).has(permission)
);
