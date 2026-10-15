/* eslint-disable no-undef */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { clearEmergencyAccess, decodeUserFromToken, logOut, rehydrateUser, setAccessToken, setCredentials, setActiveBranch, permissionsUpdated, selectCurrentUser } from '../authSlice';
import { getActiveBranchId } from '../../utils/branchContext';

const makeStore = () => configureStore({ reducer: { auth: authReducer } });

const createMockJwt = (payload) => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const body = btoa(JSON.stringify(payload)).replace(/=/g, '');
    return `${header}.${body}.mock-signature`;
};

describe('staff access token storage', () => {
    it('keeps the tab branch authoritative when another tab changes shared storage, including a cleared selection', () => {
        const store = makeStore();
        store.dispatch(setActiveBranch('A'));
        localStorage.setItem('viara_active_branch_id', 'B');
        expect(getActiveBranchId()).toBe('A');
        store.dispatch(setActiveBranch(null));
        localStorage.setItem('viara_active_branch_id', 'B');
        expect(getActiveBranchId()).toBeNull();
    });
    it('revalidates revoked branch membership and clears old permissions on restoration', () => {
        const store = makeStore();
        store.dispatch(setCredentials({ user: { id: 'staff', role: 'Admin', branches: [{ id: 'A' }, { id: 'B' }] }, token: 'token' }));
        store.dispatch(setActiveBranch('B'));
        store.dispatch(permissionsUpdated({ branchId: 'B', permissions: ['VIEW_REPORTS'] }));
        store.dispatch(rehydrateUser({ token: 'new-token', user: { id: 'staff', role: 'Admin', branches: [{ id: 'A', branch_role: 'Receptionist' }] } }));
        expect(store.getState().auth.activeBranchId).toBe('A');
        expect(store.getState().auth.user.permissions).toEqual([]);
        expect(selectCurrentUser(store.getState()).role).toBe('Receptionist');
        expect(getActiveBranchId()).toBe('A');
    });
    it('requires a new choice when the previous branch is revoked and multiple memberships have no default', () => {
        const store = makeStore();
        store.dispatch(setActiveBranch('revoked'));
        store.dispatch(rehydrateUser({ token: 'token', user: { id: 'staff', role: 'Admin', branches: [{ id: 'A' }, { id: 'B' }] } }));
        expect(store.getState().auth.activeBranchId).toBeNull();
        expect(getActiveBranchId()).toBeNull();
        expect(selectCurrentUser(store.getState()).role).toBe('Unassigned');
    });
    it('drops a selection when all memberships have been revoked', () => {
        const store = makeStore();
        store.dispatch(setActiveBranch('revoked'));
        store.dispatch(rehydrateUser({ token: 'token', user: { id: 'staff', role: 'Admin', branches: [] } }));
        expect(store.getState().auth.activeBranchId).toBeNull();
        expect(localStorage.getItem('viara_active_branch_id')).toBeNull();
    });
    it('uses the selected branch role and discards permission responses for a previous branch', () => {
        const store = makeStore();
        store.dispatch(setCredentials({ user: { user_id: 'staff', role: 'Admin', defaultBranchId: 'A', permissions: ['GLOBAL'], branches: [{ id: 'A', branch_role: 'Radiologist' }, { id: 'B', branch_role: 'Receptionist' }] }, token: 'token' }));
        expect(selectCurrentUser(store.getState()).role).toBe('Radiologist');
        store.dispatch(setActiveBranch('B'));
        expect(selectCurrentUser(store.getState()).role).toBe('Receptionist');
        expect(selectCurrentUser(store.getState()).permissions).toEqual([]);
        store.dispatch(permissionsUpdated({ branchId: 'A', role: 'Admin', permissions: ['STALE'] }));
        expect(selectCurrentUser(store.getState()).permissions).toEqual([]);
        store.dispatch(permissionsUpdated({ branchId: 'B', role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] }));
        expect(selectCurrentUser(store.getState()).permissions).toEqual(['VIEW_APPOINTMENTS']);
    });
    it('does not promote an ordinary user through a Developer branch role', () => {
        const store = makeStore();
        store.dispatch(setCredentials({ user: { role: 'Admin', branches: [{ id: 'A', branch_role: 'Developer' }] }, token: 'token' }));
        expect(selectCurrentUser(store.getState()).role).toBe('Unassigned');
    });
    it('drops a previous user branch and requires a choice for multiple branches without a default', () => {
        const store = makeStore();
        store.dispatch(setActiveBranch('old-branch'));
        store.dispatch(setCredentials({ user: { id: 'new-user', role: 'Admin', branches: [{ id: 'A' }, { id: 'B' }] }, token: 'token' }));
        expect(store.getState().auth.activeBranchId).toBeNull();
        expect(localStorage.getItem('viara_active_branch_id')).toBeNull();
        store.dispatch(setActiveBranch('B'));
        store.dispatch(logOut());
        expect(store.getState().auth.activeBranchId).toBeNull();
        expect(localStorage.getItem('viara_active_branch_id')).toBeNull();
    });
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('keeps login and rotated access tokens in Redux memory only while persisting user metadata', () => {
        const store = makeStore();
        store.dispatch(setCredentials({
            user: { id: 'user-1', role: 'Admin' },
            token: 'login-token',
            rememberMe: true,
        }));

        expect(store.getState().auth.token).toBe('login-token');
        expect(JSON.parse(sessionStorage.getItem('user'))).toMatchObject({ id: 'user-1' });
        expect(JSON.parse(localStorage.getItem('user'))).toMatchObject({ id: 'user-1' });
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();

        store.dispatch(setAccessToken('rotated-token'));

        expect(store.getState().auth.token).toBe('rotated-token');
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('cleans legacy token storage and rehydrates with a refreshed token and stored user', () => {
        sessionStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'Admin' }));
        localStorage.setItem('token', 'legacy-local-token');
        sessionStorage.setItem('token', 'legacy-session-token');
        const store = makeStore();

        store.dispatch(rehydrateUser());
        expect(store.getState().auth.isAuthenticated).toBe(false);

        store.dispatch(rehydrateUser('refreshed-token'));

        expect(store.getState().auth).toMatchObject({
            user: { id: 'user-1', role: 'Admin' },
            token: 'refreshed-token',
            isAuthenticated: true,
        });
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('rehydrates user in a fresh tab from JWT when storage is empty', () => {
        const mockJwt = createMockJwt({
            user_id: 'user-rad-1',
            role: 'Radiologist',
            full_name: 'Dr. Sarah Smith',
            email: 'sarah@viara.health',
            must_change_password: false
        });

        const store = makeStore();
        store.dispatch(rehydrateUser(mockJwt));

        expect(store.getState().auth.isAuthenticated).toBe(true);
        expect(store.getState().auth.user).toMatchObject({
            user_id: 'user-rad-1',
            role: 'Radiologist',
            full_name: 'Dr. Sarah Smith',
            email: 'sarah@viara.health'
        });
        expect(store.getState().auth.token).toBe(mockJwt);
        expect(JSON.parse(sessionStorage.getItem('user'))).toMatchObject({
            user_id: 'user-rad-1',
            role: 'Radiologist'
        });
    });

    it('rehydrates with explicit { token, user } payload', () => {
        const store = makeStore();
        store.dispatch(rehydrateUser({
            token: 'new-token',
            user: { id: 'user-2', role: 'Technician', full_name: 'Alex Tech' }
        }));

        expect(store.getState().auth.isAuthenticated).toBe(true);
        expect(store.getState().auth.user).toMatchObject({
            id: 'user-2',
            role: 'Technician',
            full_name: 'Alex Tech'
        });
        expect(store.getState().auth.token).toBe('new-token');
    });

    it('clears in-memory credentials and all user storage on logout', () => {
        const store = makeStore();
        store.dispatch(setCredentials({ user: { id: 'user-1' }, token: 'token' }));
        localStorage.setItem('token', 'legacy-local-token');
        sessionStorage.setItem('token', 'legacy-session-token');

        store.dispatch(logOut());

        expect(store.getState().auth).toEqual({ user: null, token: null, isAuthenticated: false, activeBranchId: null });
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('user')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('accepts only unexpired emergency claims from the current access token', () => {
        const activeToken = createMockJwt({
            user_id: 'user-nurse-1',
            role: 'Nurse',
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['VIEW_EXAMS'],
            breakGlassExpiry: Date.now() + 60_000,
        });
        const regularToken = createMockJwt({ user_id: 'user-nurse-1', role: 'Nurse' });
        const store = makeStore();

        store.dispatch(setCredentials({ user: { id: 'user-nurse-1', role: 'Nurse' }, token: activeToken }));
        expect(store.getState().auth.user.elevatedPermissions).toEqual(['VIEW_EXAMS']);

        store.dispatch(setAccessToken(regularToken));
        expect(store.getState().auth.user).not.toHaveProperty('elevatedPermissions');
        expect(JSON.parse(localStorage.getItem('user'))).not.toHaveProperty('emergencyAccessId');
    });

    it('can clear emergency UI state immediately after expiry or revocation', () => {
        const token = createMockJwt({
            user_id: 'user-rad-1', role: 'Radiologist',
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['VIEW_PATIENTS'],
            breakGlassExpiry: Date.now() + 60_000,
        });
        const store = makeStore();
        store.dispatch(setCredentials({ user: { id: 'user-rad-1', role: 'Radiologist' }, token }));
        store.dispatch(clearEmergencyAccess());

        expect(store.getState().auth.user).not.toHaveProperty('breakGlassExpiry');
        expect(store.getState().auth.token).toBe(token);
    });

    it('rejects external portal roles (Patient, Doctor) from authenticating or rehydrating in staff administration', () => {
        const patientToken = createMockJwt({
            userId: 'pat-123',
            role: 'Patient',
            name: 'Mohamed Patient'
        });
        const store = makeStore();

        // 1. setCredentials with Patient role is rejected
        store.dispatch(setCredentials({
            user: { id: 'pat-123', role: 'Patient' },
            token: patientToken
        }));
        expect(store.getState().auth.isAuthenticated).toBe(false);
        expect(store.getState().auth.user).toBeNull();

        // 2. rehydrateUser with Patient JWT is rejected
        store.dispatch(rehydrateUser(patientToken));
        expect(store.getState().auth.isAuthenticated).toBe(false);
        expect(store.getState().auth.user).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
        expect(sessionStorage.getItem('user')).toBeNull();
    });
});
