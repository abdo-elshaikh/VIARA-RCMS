import { createSlice, createSelector } from '@reduxjs/toolkit';
import { configureActiveBranchProvider } from '../utils/branchContext.js';

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
};

const readStoredUser = () => {
    try {
        let stored = null;
        if (typeof sessionStorage !== 'undefined') {
            const sessionUser = sessionStorage.getItem('user');
            if (sessionUser) stored = JSON.parse(sessionUser);
        }
        if (stored?.role && !isStaffRole(stored.role)) {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
            return null;
        }
        return stored;
    } catch {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
    }
    return null;
};

clearLegacyTokenStorage();

const readStoredBranchId = () => {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('viara_active_branch_id') || null;
        }
    } catch {
        // Browser storage is optional; the workspace keeps its own selection.
    }
    return null;
};

let currentActiveBranchId = readStoredBranchId();
configureActiveBranchProvider(() => currentActiveBranchId);

const resolveSessionBranch = (user, previousBranchId) => {
    const branches = Array.isArray(user?.branches) ? user.branches : [];
    return branches.find(branch => branch.id === previousBranchId)?.id
        || branches.find(branch => branch.id === user?.defaultBranchId)?.id
        || branches.find(branch => branch.is_default)?.id
        || (branches.length === 1 ? branches[0].id : null);
};

const persistBranchSelection = (branchId) => {
    currentActiveBranchId = branchId || null;
    try {
        if (branchId) localStorage.setItem('viara_active_branch_id', String(branchId));
        else localStorage.removeItem('viara_active_branch_id');
    } catch {
        // Shared storage is a startup hint, not the active workspace state.
    }
};

const applySessionUser = (state, user, token, decodedUser = null) => {
    const previousId = state.user?.user_id || state.user?.id;
    const nextId = user.user_id || user.id;
    const previousOrganization = state.user?.organization_id || state.user?.organizationId || null;
    const organizationId = user.organization_id || user.organizationId || null;
    const sameIdentity = (!previousId || previousId === nextId) && previousOrganization === organizationId;
    const resolvedBranch = resolveSessionBranch(user, sameIdentity ? state.activeBranchId : null);
    state.user = syncEmergencyClaims({
        ...user,
        organization_id: organizationId,
        is_org_admin: Boolean(user.is_org_admin ?? user.isOrgAdmin),
        // Re-fetch branch permissions from the server after restoring identity.
        permissions: [],
        permissionsBranchId: null,
    }, decodedUser);
    state.token = token;
    state.isAuthenticated = true;
    state.activeBranchId = resolvedBranch;
    persistBranchSelection(resolvedBranch);
    persistUser(state.user);
};

const clearSession = (state) => {
    state.user = null;
    state.token = null;
    state.isAuthenticated = false;
    state.activeBranchId = null;
    persistBranchSelection(null);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('user');
    clearLegacyTokenStorage();
};

const initialState = {
    user: null,
    token: null,
    isAuthenticated: false,
    activeBranchId: currentActiveBranchId,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setCredentials: (state, action) => {
            const { user, token } = action.payload;
            if (user?.role && !isStaffRole(user.role)) {
                clearSession(state);
                return;
            }
            applySessionUser(state, user, token, decodeUserFromToken(token));
            clearLegacyTokenStorage();
        },
        // Live-sync effective permissions (e.g. after an RBAC policy change)
        // without waiting for the next login.
        permissionsUpdated: (state, action) => {
            const legacy = Array.isArray(action.payload);
            if (!legacy && (action.payload?.branchId || null) !== (state.activeBranchId || null)) return;
            const permissions = legacy ? action.payload : action.payload?.permissions;
            if (!Array.isArray(permissions)) return;
            if (state.user) {
                state.user = { ...state.user, permissions, permissionsBranchId: state.activeBranchId || null };
                if (!legacy && action.payload.role && Array.isArray(state.user.branches)) {
                    const branch = state.user.branches.find(item => item.id === state.activeBranchId);
                    if (branch) branch.branch_role = action.payload.role;
                }
                persistUser(state.user);
            }
        },
        logOut: (state) => {
            clearSession(state);
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
                clearSession(state);
                return;
            }

            if (resolvedUser && token) {
                applySessionUser(state, {
                    ...resolvedUser,
                    ...(decodedUser ? {
                        user_id: decodedUser.user_id,
                        id: decodedUser.id,
                        role: decodedUser.role,
                        email: decodedUser.email || resolvedUser.email,
                        full_name: decodedUser.full_name || resolvedUser.full_name,
                    } : {}),
                }, token, decodedUser);
            }
        },
        updateCurrentUser: (state, action) => {
            const updatedUser = { ...state.user, ...action.payload };
            if (['branches', 'defaultBranchId', 'organization_id', 'organizationId', 'role', 'is_org_admin', 'isOrgAdmin']
                .some(key => Object.prototype.hasOwnProperty.call(action.payload, key))) {
                applySessionUser(state, updatedUser, state.token, decodeUserFromToken(state.token));
            } else {
                state.user = updatedUser;
                persistUser(state.user);
            }
        },
        setAccessToken: (state, action) => {
            state.token = action.payload;
            const decodedUser = decodeUserFromToken(state.token);
            if (state.token && !state.user) {
                const storedUser = readStoredUser();
                const resolvedUser = storedUser || decodedUser;
                if (resolvedUser) {
                    applySessionUser(state, resolvedUser, state.token, decodedUser);
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
        setActiveBranch: (state, action) => {
            if (state.activeBranchId !== (action.payload || null) && state.user) {
                state.user.permissions = [];
                state.user.permissionsBranchId = null;
                persistUser(state.user);
            }
            state.activeBranchId = action.payload || null;
            persistBranchSelection(state.activeBranchId);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('viara:branch-changed', { detail: { branchId: action.payload } }));
            }
        },
    },
});

export const { setCredentials, logOut, rehydrateUser, updateCurrentUser, setAccessToken, clearEmergencyAccess, permissionsUpdated, setActiveBranch } = authSlice.actions;

export default authSlice.reducer;

const selectEffectiveUser = createSelector(
    [(user) => user, (_user, branchId) => branchId],
    (user, branchId) => {
        if (!user || user.is_org_admin || user.isOrgAdmin || user.role === 'Developer' || !Array.isArray(user.branches)) return user;
        const role = user.branches.find(branch => branch.id === branchId)?.branch_role;
        return { ...user, identity_role: user.role, role: role && role !== 'Developer' ? role : 'Unassigned' };
    }
);
export const selectCurrentUser = (state) => selectEffectiveUser(state.auth.user, state.auth.activeBranchId);
export const selectCurrentToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectActiveBranchId = (state) => state.auth.activeBranchId;
export const selectUserBranches = (state) => state.auth.user?.branches || [];
