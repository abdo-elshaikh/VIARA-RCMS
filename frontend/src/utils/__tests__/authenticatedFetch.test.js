/* eslint-disable no-undef */
import { authenticatedFetch } from '../authenticatedFetch';
import { configureAccessTokenProvider } from '../accessToken';

describe('authenticatedFetch', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
        localStorage.clear();
        sessionStorage.clear();
        configureAccessTokenProvider(() => null);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the bearer token from the configured in-memory provider', async () => {
        configureAccessTokenProvider(() => 'memory-token');

        await authenticatedFetch('/api/protected', { headers: { accept: 'application/json' } });

        const [, options] = fetch.mock.calls[0];
        expect(options.credentials).toBe('include');
        expect(options.headers.get('Authorization')).toBe('Bearer memory-token');
        expect(options.headers.get('accept')).toBe('application/json');
    });

    it('does not fall back to legacy browser token storage', async () => {
        localStorage.setItem('token', 'local-token');
        sessionStorage.setItem('token', 'session-token');

        await authenticatedFetch('/api/protected');

        const [, options] = fetch.mock.calls[0];
        expect(options.headers.has('Authorization')).toBe(false);
    });
});
