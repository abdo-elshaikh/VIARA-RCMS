import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api';
import authReducer, { logOut } from './authSlice';
import preferencesReducer from './preferencesSlice';
import { configureAccessTokenProvider } from '../utils/accessToken';

export const clearApiCacheOnSessionBoundary = (storeApi) => (next) => (action) => {
    const previousBranch = storeApi.getState().auth.activeBranchId;
    const result = next(action);
    if (logOut.match(action) || previousBranch !== storeApi.getState().auth.activeBranchId) {
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
