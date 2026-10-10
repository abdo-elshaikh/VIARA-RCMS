import { createSlice } from '@reduxjs/toolkit';

export const STAFF_ROLES = new Set([
    'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant',
    'HR', 'Marketing', 'Technician', 'Nurse', 'Insurance_Staff', 'Developer'
]);

export const isStaffRole = (role) => STAFF_ROLES.has(role);

const clearLegacyTokenStorage = () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('token');
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('token');
};

export const decodeUserFromToken = (token) => {
    if (!token || typeof token !== 'string') return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonString = typeof Buffer !== 'undefined'
            ? Buffer.from(base64, 'base64').toString('utf8')
            : decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
        const decoded = JSON.parse(jsonString);
        if (!decoded || typeof decoded !== 'object') return null;

        const userId = decoded.user_id || decoded.userId || decoded.id || decoded.doctorId;
        if (!userId && !decoded.role) return null;

        const emergencyActive = Boolean(
            decoded.emergencyAccessId
            && Array.isArray(decoded.elevatedPermissions)
            && decoded.elevatedPermissions.length > 0
            && Number(decoded.breakGlassExpiry) > Date.now()
        );
        return {
            user_id: userId,
            id: userId,
            email: decoded.email || '',
            full_name: decoded.full_name || decoded.name || '',
            role: decoded.role || '',
            must_change_password: Boolean(decoded.must_change_password),
            permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
            ...(emergencyActive ? {
                emergencyAccessId: decoded.emergencyAccessId,
                elevatedPermissions: decoded.elevatedPermissions,
                breakGlassExpiry: Number(decoded.breakGlassExpiry),
            } : {})
        };
    } catch {
        return null;
    }
};

const syncEmergencyClaims = (user = {}, decodedUser = null) => {
    const nextUser = { ...user };
    delete nextUser.emergencyAccessId;
    delete nextUser.elevatedPermissions;
    delete nextUser.breakGlassExpiry;
    if (decodedUser?.emergencyAccessId) {
        nextUser.emergencyAccessId = decodedUser.emergencyAccessId;
        nextUser.elevatedPermissions = decodedUser.elevatedPermissions;
        nextUser.breakGlassExpiry = decodedUser.breakGlassExpiry;
    }
    return nextUser;
};

const persistUser = (user) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('user', JSON.stringify(user));
    if (typeof localStorage !== 'undefined') localStorage.setItem('user', JSON.stringify(user));
};

const readStoredUser = () => {
    try {
        let stored = null;
        if (typeof sessionStorage !== 'undefined') {
            const sessionUser = sessionStorage.getItem('user');
            if (sessionUser) stored = JSON.parse(sessionUser);
        }
        if (!stored && typeof localStorage !== 'undefined') {
            const localUser = localStorage.getItem('user');
            if (localUser) stored = JSON.parse(localUser);
        }
        if (stored?.role && !isStaffRole(stored.role)) {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
            if (typeof localStorage !== 'undefined') localStorage.removeItem('user');
            return null;
        }
        return stored;
    } catch {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
        if (typeof localStorage !== 'undefined') localStorage.removeItem('user');
    }
    return null;
};

clearLegacyTokenStorage();

const initialState = {
    user: null,
    token: null,
    isAuthenticated: false,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setCredentials: (state, action) => {
            const { user, token } = action.payload;
            if (user?.role && !isStaffRole(user.role)) {
                state.user = null;
                state.token = null;
                state.isAuthenticated = false;
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
                if (typeof localStorage !== 'undefined') localStorage.removeItem('user');
                clearLegacyTokenStorage();
                return;
            }
            state.user = syncEmergencyClaims({
                ...user,
                permissions: user.permissions || []
            }, decodeUserFromToken(token));
            state.token = token;
            state.isAuthenticated = true;

            persistUser(state.user);
            clearLegacyTokenStorage();
        },
        // Live-sync effective permissions (e.g. after an RBAC policy change)
        // without waiting for the next login.
        permissionsUpdated: (state, action) => {
            const permissions = Array.isArray(action.payload) ? action.payload : [];
            if (state.user) {
                state.user = { ...state.user, permissions };
                persistUser(state.user);
            }
        },
        logOut: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;

            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
            if (typeof localStorage !== 'undefined') localStorage.removeItem('user');
            clearLegacyTokenStorage();
        },
        rehydrateUser: (state, action) => {
            const token = typeof action.payload === 'string'
                ? action.payload
                : action.payload?.token;
            const explicitUser = typeof action.payload === 'object' && action.payload?.user
                ? action.payload.user
                : null;
            const storedUser = readStoredUser();
            const decodedUser = decodeUserFromToken(token);

            clearLegacyTokenStorage();

            const resolvedUser = explicitUser || storedUser || decodedUser;

            if (resolvedUser?.role && !isStaffRole(resolvedUser.role)) {
                state.user = null;
                state.token = null;
                state.isAuthenticated = false;
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
                if (typeof localStorage !== 'undefined') localStorage.removeItem('user');
                return;
            }

            if (resolvedUser && token) {
                state.user = syncEmergencyClaims({
                    ...resolvedUser,
                    ...(decodedUser ? {
                        user_id: decodedUser.user_id,
                        id: decodedUser.id,
                        role: decodedUser.role,
                        email: decodedUser.email || resolvedUser.email,
                        full_name: decodedUser.full_name || resolvedUser.full_name,
                    } : {}),
                    permissions: resolvedUser.permissions || []
                }, decodedUser);
                state.token = token;
                state.isAuthenticated = true;

                persistUser(state.user);
            }
        },
        updateCurrentUser: (state, action) => {
            state.user = {
                ...state.user,
                ...action.payload
            };
            persistUser(state.user);
        },
        setAccessToken: (state, action) => {
            state.token = action.payload;
            const decodedUser = decodeUserFromToken(state.token);
            if (state.token && !state.user) {
                const storedUser = readStoredUser();
                const resolvedUser = storedUser || decodedUser;
                if (resolvedUser) {
                    state.user = syncEmergencyClaims({
                        ...resolvedUser,
                        permissions: resolvedUser.permissions || []
                    }, decodedUser);
                    state.isAuthenticated = true;
                }
            } else if (state.user) {
                state.user = syncEmergencyClaims(state.user, decodedUser);
            }
            if (state.user) persistUser(state.user);
            clearLegacyTokenStorage();
        },
        clearEmergencyAccess: (state) => {
            if (!state.user) return;
            state.user = syncEmergencyClaims(state.user, null);
            persistUser(state.user);
        },
    },
});

export const { setCredentials, logOut, rehydrateUser, updateCurrentUser, setAccessToken, clearEmergencyAccess, permissionsUpdated } = authSlice.actions;

export default authSlice.reducer;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
