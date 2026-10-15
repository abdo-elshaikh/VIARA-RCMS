import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';
import authReducer, { logOut, rehydrateUser } from './authSlice';
import preferencesReducer from './preferencesSlice';
import { configureAccessTokenProvider } from '../utils/accessToken';

export const clearApiCacheOnSessionBoundary = (storeApi) => (next) => (action) => {
    const previous = storeApi.getState().auth;
    const result = next(action);
    const current = storeApi.getState().auth;
    if (logOut.match(action) || rehydrateUser.match(action)
        || previous.activeBranchId !== current.activeBranchId
        || previous.user?.user_id !== current.user?.user_id
        || previous.user?.id !== current.user?.id
        || previous.user?.organization_id !== current.user?.organization_id
        || previous.user?.permissions !== current.user?.permissions) {
        // Abort old requests before clearing their cache so a late response cannot
        // repopulate the workspace after a branch switch.
        for (const request of storeApi.dispatch(api.util.getRunningQueriesThunk())) request.abort();
        for (const request of storeApi.dispatch(api.util.getRunningMutationsThunk())) request.abort();
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
