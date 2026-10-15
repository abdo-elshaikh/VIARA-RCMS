import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrialWatermark } from '../useTrialWatermark';

const mocks = vi.hoisted(() => ({ license: { isTrial: false, loading: false } }));

vi.mock('../useLicense', () => ({
    useLicense: () => mocks.license,
}));

const CACHE_KEY = 'viara_license_edition';

describe('useTrialWatermark', () => {
    beforeEach(() => {
        sessionStorage.clear();
        mocks.license = { isTrial: false, loading: false };
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    // The watermark is the anti-piracy marker on printed output, so a silent
    // null here means unmarked trial paperwork leaves the building.
    it('marks trial output when the cached edition says trial', () => {
        sessionStorage.setItem(CACHE_KEY, 'trial');
        const { result } = renderHook(() => useTrialWatermark());
        expect(result.current).toBe('نسخة تجريبية • TRIAL');
    });

    it('falls back to the licence lookup when nothing is cached', () => {
        mocks.license = { isTrial: true, loading: false };
        const { result } = renderHook(() => useTrialWatermark());
        expect(result.current).toBe('نسخة تجريبية • TRIAL');
    });

    it('leaves non-trial output unmarked', () => {
        mocks.license = { isTrial: false, loading: false };
        const { result } = renderHook(() => useTrialWatermark());
        expect(result.current).toBeNull();
    });

    it('prefers the cached edition over the licence lookup', () => {
        // TrialBanner populates the cache, so it must win over a stale lookup.
        sessionStorage.setItem(CACHE_KEY, 'enterprise');
        mocks.license = { isTrial: true, loading: false };
        const { result } = renderHook(() => useTrialWatermark());
        expect(result.current).toBeNull();
    });

    it('stays unmarked while the licence is still loading and uncached', () => {
        mocks.license = { isTrial: false, loading: true };
        const { result } = renderHook(() => useTrialWatermark());
        expect(result.current).toBeNull();
    });

    it('does not throw when sessionStorage is unavailable', () => {
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        mocks.license = { isTrial: true, loading: false };

        const { result } = renderHook(() => useTrialWatermark());

        expect(result.current).toBe('نسخة تجريبية • TRIAL');
        getItem.mockRestore();
    });
});
