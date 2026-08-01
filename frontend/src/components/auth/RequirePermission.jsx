import React from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';

/**
 * RequirePermission Component
 * Wraps elements and only renders them if the current user has the required permission.
 * If fallback is provided, it will render the fallback component when access is denied.
 */
const RequirePermission = ({ permission, children, fallback = null }) => {
    const user = useSelector(selectCurrentUser);

    if (!user) return fallback;

    if (user.role === 'Developer') return children;

    // Check elevated permissions first (Break-Glass)
    if (user.elevatedPermissions && user.elevatedPermissions.includes(permission)) {
        return children;
    }

    // Check standard permissions
    if (user.permissions && user.permissions.includes(permission)) {
        return children;
    }

    return fallback;
};

export default RequirePermission;
