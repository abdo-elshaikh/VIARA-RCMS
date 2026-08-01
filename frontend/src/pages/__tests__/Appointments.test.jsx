/* eslint-disable no-undef */
import { getRange, shiftAnchorDate } from '../../utils/appointmentDates';

describe('Appointments schedule navigation', () => {
    it('builds a Monday-to-Sunday week around the selected date', () => {
        expect(getRange('2026-06-27', 'week')).toEqual({
            startDate: '2026-06-22',
            endDate: '2026-06-28',
        });
    });

    it('moves week views by seven days', () => {
        expect(shiftAnchorDate('2026-06-27', 'week', 1)).toBe('2026-07-04');
        expect(shiftAnchorDate('2026-06-27', 'week', -1)).toBe('2026-06-20');
    });

    it('clamps month navigation to the final valid day', () => {
        expect(shiftAnchorDate('2026-01-31', 'month', 1)).toBe('2026-02-28');
        expect(shiftAnchorDate('2024-01-31', 'month', 1)).toBe('2024-02-29');
    });
});
