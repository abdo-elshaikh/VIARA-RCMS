import React from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { hasEffectivePermission } from '../../utils/effectivePermissions';

/**
 * RequirePermission Component
 * Wraps elements and only renders them if the current user has the required permission.
 * If fallback is provided, it will render the fallback component when access is denied.
 */
const RequirePermission = ({ permission, children, fallback = null }) => {
    const user = useSelector(selectCurrentUser);

    if (!user) return fallback;

    if (hasEffectivePermission(user, permission)) {
        return children;
    }

    return fallback;
};

export default RequirePermission;
