import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, rehydrateSession } from '../api';
import authReducer, { logOut } from '../authSlice';
import { clearApiCacheOnSessionBoundary } from '../store';

const createStore = () => configureStore({
    reducer: {
        [api.reducerPath]: api.reducer,
        auth: authReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

const createSessionAwareStore = () => configureStore({
    reducer: {
        [api.reducerPath]: api.reducer,
        auth: authReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware()
        .concat(clearApiCacheOnSessionBoundary, api.middleware),
});

describe('session rehydration', () => {
    const NativeRequest = globalThis.Request;

    beforeEach(() => {
        document.cookie = 'csrf_token=; Max-Age=0; path=/';
        vi.stubGlobal('Request', class extends NativeRequest {
            constructor(input, init) {
                const resolvedInput = typeof input === 'string'
                    ? new URL(input, 'http://localhost').toString()
                    : input;
                super(resolvedInput, init);
            }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.cookie = 'csrf_token=; Max-Age=0; path=/';
    });

    it('bootstraps the CSRF cookie before posting the refresh request', async () => {
        const requests = [];
        vi.stubGlobal('fetch', vi.fn(async (request) => {
            requests.push(request);

            if (request.method === 'GET') {
                document.cookie = 'csrf_token=test-csrf-token; path=/';
                return new Response(JSON.stringify({}), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify({ token: 'access-token' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }));

        const token = await createStore().dispatch(rehydrateSession());

        expect(token).toBe('access-token');
        expect(requests).toHaveLength(2);
        expect(new URL(requests[0].url).pathname).toBe('/api/settings/public/home');
        expect(requests[0].method).toBe('GET');
        expect(new URL(requests[1].url).pathname).toBe('/api/auth/refresh');
        expect(requests[1].method).toBe('POST');
        expect(requests[1].headers.get('x-csrf-token')).toBe('test-csrf-token');
    });
});

describe('session-bound API cache isolation', () => {
    it('clears cached clinical data when the user logs out', async () => {
        const store = createSessionAwareStore();

        await store.dispatch(api.util.upsertQueryData('getQueue', { station: 'Modality', limit: 100 }, {
            data: [{ exam_id: 'exam-owned-by-another-technician' }],
        }));
        expect(Object.keys(store.getState()[api.reducerPath].queries)).not.toHaveLength(0);

        store.dispatch(logOut());
        expect(Object.keys(store.getState()[api.reducerPath].queries)).toHaveLength(0);
    });
});
