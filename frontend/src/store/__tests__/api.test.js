import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, rehydrateSession, restoreStaffSession } from '../api';
import authReducer, { logOut, setActiveBranch, rehydrateUser, setCredentials } from '../authSlice';
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

    it('loads current memberships without sending a revoked branch during identity restoration', async () => {
        document.cookie = 'csrf_token=test-token; path=/';
        const requests = [];
        vi.stubGlobal('fetch', vi.fn(async request => {
            requests.push(request);
            return new Response(JSON.stringify(request.method === 'POST'
                ? { token: 'restored-token' }
                : { id: 'staff', role: 'Nurse', organizationId: 'org', branches: [{ id: 'valid' }], defaultBranchId: 'valid' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }));
        const store = createStore();
        store.dispatch(setActiveBranch('revoked'));
        const session = await store.dispatch(restoreStaffSession());
        const profileRequest = requests.find(request => new URL(request.url).pathname === '/api/profile');
        expect(profileRequest.headers.has('x-branch-id')).toBe(false);
        expect(profileRequest.headers.get('authorization')).toBe('Bearer restored-token');
        expect(session.user.branches).toEqual([{ id: 'valid' }]);
        store.dispatch(rehydrateUser(session));
        expect(store.getState().auth.activeBranchId).toBe('valid');
    });
});

describe('session-bound API cache isolation', () => {
    it('clears old clinical data when restored identity changes in the same branch', async () => {
        const store = createSessionAwareStore();
        store.dispatch(setCredentials({ user: { id: 'old', role: 'Nurse', branches: [{ id: 'A' }] }, token: 'old-token' }));
        await store.dispatch(api.util.upsertQueryData('getQueue', { station: 'Nurse' }, { data: [{ exam_id: 'old-exam' }] }));
        store.dispatch(rehydrateUser({ user: { id: 'new', role: 'Nurse', branches: [{ id: 'A' }] }, token: 'new-token' }));
        expect(Object.keys(store.getState()[api.reducerPath].queries)).toHaveLength(0);
    });
    it('clears clinical data on branch change but preserves it for the same branch', async () => {
        const store = createSessionAwareStore();
        store.dispatch(setActiveBranch('branch-A'));
        await store.dispatch(api.util.upsertQueryData('getQueue', { station: 'Modality', limit: 100 }, {
            data: [{ exam_id: 'branch-A-exam' }],
        }));
        store.dispatch(setActiveBranch('branch-A'));
        expect(Object.keys(store.getState()[api.reducerPath].queries)).not.toHaveLength(0);
        store.dispatch(setActiveBranch('branch-B'));
        expect(Object.keys(store.getState()[api.reducerPath].queries)).toHaveLength(0);
    });
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
