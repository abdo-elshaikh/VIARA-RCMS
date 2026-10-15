import { describe, expect, it } from 'vitest';
import {
    addDaysToDateInput,
    centerDayBounds,
    dateInputInTimezone,
    dateTimeInTimezone,
    nextTimeInTimezone,
} from '../centerTimezone';

describe('center timezone utilities', () => {
    it('converts a center-local appointment time to its correct UTC instant', () => {
        expect(dateTimeInTimezone('2025-01-15', '09:30', 'America/New_York')?.toISOString())
            .toBe('2025-01-15T14:30:00.000Z');
    });

    it('uses center-local calendar days across daylight-saving transitions', () => {
        const bounds = centerDayBounds('2025-03-09', 'America/New_York');
        expect(bounds).toEqual({
            start: '2025-03-09T05:00:00.000Z',
            end: '2025-03-10T04:00:00.000Z',
        });
        expect(dateTimeInTimezone('2025-03-09', '02:30', 'America/New_York')).toBeNull();
    });

    it('calculates current date, next time, and date shortcuts in the center timezone', () => {
        const instant = new Date('2025-01-01T02:00:00.000Z');
        expect(dateInputInTimezone(instant, 'America/Los_Angeles')).toBe('2024-12-31');
        expect(nextTimeInTimezone(instant, 'America/Los_Angeles')).toBe('18:30');
        expect(addDaysToDateInput('2024-12-31', 1)).toBe('2025-01-01');
    });
});
