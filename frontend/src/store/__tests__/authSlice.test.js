/* eslint-disable no-undef */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { clearEmergencyAccess, decodeUserFromToken, logOut, rehydrateUser, setAccessToken, setCredentials } from '../authSlice';

const makeStore = () => configureStore({ reducer: { auth: authReducer } });

const createMockJwt = (payload) => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const body = btoa(JSON.stringify(payload)).replace(/=/g, '');
    return `${header}.${body}.mock-signature`;
};

describe('staff access token storage', () => {
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

        expect(store.getState().auth).toEqual({ user: null, token: null, isAuthenticated: false });
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
