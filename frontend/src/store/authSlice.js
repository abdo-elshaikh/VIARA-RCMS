import { createSlice } from '@reduxjs/toolkit';

const clearLegacyTokenStorage = () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('token');
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('token');
};

const readStoredUser = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
        return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
        localStorage.removeItem('user');
        return null;
    }
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
            state.user = {
                ...user,
                permissions: user.permissions || []
            };
            state.token = token;
            state.isAuthenticated = true;

            localStorage.setItem('user', JSON.stringify(state.user));
            clearLegacyTokenStorage();
        },
        logOut: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;

            if (typeof localStorage !== 'undefined') localStorage.removeItem('user');
            clearLegacyTokenStorage();
        },
        rehydrateUser: (state, action) => {
            const storedUser = readStoredUser();
            const token = action.payload;
            clearLegacyTokenStorage();

            if (storedUser && token) {
                state.user = storedUser;
                state.token = token;
                state.isAuthenticated = true;
            }
        },
        updateCurrentUser: (state, action) => {
            state.user = {
                ...state.user,
                ...action.payload
            };
            if (typeof localStorage !== 'undefined') localStorage.setItem('user', JSON.stringify(state.user));
        },
        setAccessToken: (state, action) => {
            state.token = action.payload;
            clearLegacyTokenStorage();
        },
    },
});

export const { setCredentials, logOut, rehydrateUser, updateCurrentUser, setAccessToken } = authSlice.actions;

export default authSlice.reducer;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
