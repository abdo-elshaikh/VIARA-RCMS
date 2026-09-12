import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';
import authReducer, { logOut } from './authSlice';
import preferencesReducer from './preferencesSlice';
import { configureAccessTokenProvider } from '../utils/accessToken';

export const clearApiCacheOnSessionBoundary = (storeApi) => (next) => (action) => {
    const result = next(action);
    if (logOut.match(action)) {
        storeApi.dispatch(api.util.resetApiState());
    }
    return result;
};

export const store = configureStore({
    reducer: {
        [api.reducerPath]: api.reducer,
        auth: authReducer,
        preferences: preferencesReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(clearApiCacheOnSessionBoundary, api.middleware),
});

configureAccessTokenProvider(() => store.getState().auth.token);

setupListeners(store.dispatch);
