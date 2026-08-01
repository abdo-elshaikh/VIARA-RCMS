import { createSlice } from '@reduxjs/toolkit';

// Initialize state — token may be in localStorage (remember me) or sessionStorage
const storedUser = localStorage.getItem('user');
const storedToken = localStorage.getItem('token') || sessionStorage.getItem('token');

const initialState = {
    user: storedUser ? JSON.parse(storedUser) : null,
    token: storedToken || null,
    isAuthenticated: !!(storedUser && storedToken),
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setCredentials: (state, action) => {
            const { user, token, rememberMe = false } = action.payload;
            state.user = {
                ...user,
                permissions: user.permissions || []
            };
            state.token = token;
            state.isAuthenticated = true;

            // Always persist the user profile so UI preferences survive.
            localStorage.setItem('user', JSON.stringify(state.user));

            // Token storage depends on "Remember Me":
            // - checked  → localStorage  (survives browser close)
            // - unchecked → sessionStorage (cleared when tab/browser closes)
            if (rememberMe) {
                localStorage.setItem('token', token);
                sessionStorage.removeItem('token');
            } else {
                sessionStorage.setItem('token', token);
                localStorage.removeItem('token');
            }
        },
        logOut: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;

            localStorage.removeItem('user');
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
        },
        // Action to rehydrate user from storage (called on app init)
        rehydrateUser: (state) => {
            const storedUser = localStorage.getItem('user');
            const storedToken = localStorage.getItem('token') || sessionStorage.getItem('token');

            if (storedUser && storedToken) {
                state.user = JSON.parse(storedUser);
                state.token = storedToken;
                state.isAuthenticated = true;
            }
        },
        updateCurrentUser: (state, action) => {
            state.user = {
                ...state.user,
                ...action.payload
            };
            localStorage.setItem('user', JSON.stringify(state.user));
        },
        setAccessToken: (state, action) => {
            state.token = action.payload;
            // Preserve whichever storage the token was originally written to
            if (localStorage.getItem('token')) {
                localStorage.setItem('token', action.payload);
            } else {
                sessionStorage.setItem('token', action.payload);
            }
        },
    },
});

export const { setCredentials, logOut, rehydrateUser, updateCurrentUser, setAccessToken } = authSlice.actions;

export default authSlice.reducer;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
