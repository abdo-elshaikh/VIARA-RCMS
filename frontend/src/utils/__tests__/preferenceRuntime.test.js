import { beforeEach, describe, expect, it } from 'vitest';
import { getEffectiveSessionTimeout, getSessionTimeoutSchedule } from '../sessionTimeout';
import { resolvePreferredStartPage } from '../startPage';
import { formatDateTime, formatLocalizedDate } from '../localizedDate';

describe('runtime preference consumers', () => {
    beforeEach(() => localStorage.clear());

    it('builds session warning and expiry timers from the selected timeout', () => {
        expect(getSessionTimeoutSchedule(0)).toBeNull();
        expect(getSessionTimeoutSchedule(5)).toEqual({
            timeoutMinutes: 5,
            warningMs: 4 * 60 * 1000,
            expiryMs: 5 * 60 * 1000,
        });
        expect(getSessionTimeoutSchedule('invalid', 15)?.expiryMs).toBe(15 * 60 * 1000);
        expect(getEffectiveSessionTimeout(0, 30)).toBe(30);
        expect(getEffectiveSessionTimeout(15, 30)).toBe(15);
        expect(getEffectiveSessionTimeout(30, 15)).toBe(15);
    });

    it('uses the saved start page only when the role and permissions allow it', () => {
        expect(resolvePreferredStartPage({
            user: { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] },
            preferences: { startPage: '/appointments' },
            fallback: '/reception',
        })).toBe('/appointments');

        expect(resolvePreferredStartPage({
            user: { role: 'Receptionist', permissions: [] },
            preferences: { startPage: '/appointments' },
            fallback: '/reception',
        })).toBe('/reception');
    });

    it('applies preferred numeric date and 24-hour time formatting', () => {
        localStorage.setItem('VIARA_preferences', JSON.stringify({
            timezone: 'UTC',
            dateFormat: 'YYYY-MM-DD',
            timeFormat: '24h',
        }));
        expect(formatLocalizedDate('2026-07-07T15:05:00Z', 'en-US')).toBe('2026-07-07');
        expect(formatDateTime('2026-07-07T15:05:00Z', 'en-US')).toContain('15:05');
    });
});
