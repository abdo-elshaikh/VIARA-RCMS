import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';
import authReducer from './authSlice';
import preferencesReducer from './preferencesSlice';
import { configureAccessTokenProvider } from '../utils/accessToken';

export const store = configureStore({
    reducer: {
        [api.reducerPath]: api.reducer,
        auth: authReducer,
        preferences: preferencesReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(api.middleware),
});

configureAccessTokenProvider(() => store.getState().auth.token);

setupListeners(store.dispatch);
