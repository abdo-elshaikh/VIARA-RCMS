/* eslint-disable no-undef */
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { logOut, rehydrateUser, setAccessToken, setCredentials } from '../authSlice';

const makeStore = () => configureStore({ reducer: { auth: authReducer } });

describe('staff access token storage', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('keeps login and rotated access tokens in Redux memory only', () => {
        const store = makeStore();
        store.dispatch(setCredentials({
            user: { id: 'user-1', role: 'Admin' },
            token: 'login-token',
            rememberMe: true,
        }));

        expect(store.getState().auth.token).toBe('login-token');
        expect(JSON.parse(sessionStorage.getItem('user'))).toMatchObject({ id: 'user-1' });
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();

        store.dispatch(setAccessToken('rotated-token'));

        expect(store.getState().auth.token).toBe('rotated-token');
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('cleans legacy token storage and rehydrates only with a refreshed token', () => {
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

    it('clears in-memory credentials and legacy storage on logout', () => {
        const store = makeStore();
        store.dispatch(setCredentials({ user: { id: 'user-1' }, token: 'token' }));
        localStorage.setItem('token', 'legacy-local-token');
        sessionStorage.setItem('token', 'legacy-session-token');

        store.dispatch(logOut());

        expect(store.getState().auth).toEqual({ user: null, token: null, isAuthenticated: false });
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();
    });
});
