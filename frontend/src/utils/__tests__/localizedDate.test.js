import { afterEach, describe, expect, it } from 'vitest';
import { formatLocalizedDate, getPreferredTimeZone, withPreferredTimeZone } from '../localizedDate';

describe('localized date preferences', () => {
    afterEach(() => localStorage.removeItem('VIARA_preferences'));

    it('applies the authenticated workspace timezone to operational timestamps', () => {
        localStorage.setItem('VIARA_preferences', JSON.stringify({ timezone: 'Africa/Cairo' }));

        expect(getPreferredTimeZone()).toBe('Africa/Cairo');
        expect(withPreferredTimeZone({ hour: '2-digit' })).toMatchObject({ timeZone: 'Africa/Cairo' });
        expect(formatLocalizedDate('2026-07-07T12:00:00Z', 'en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })).toBe('15:00');
    });
});
