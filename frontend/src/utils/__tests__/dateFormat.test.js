import { describe, expect, it } from 'vitest';
import { formatDuration } from '../dateFormat';

describe('queue duration formatting', () => {
    it('keeps minute precision around operational SLA thresholds', () => {
        expect(formatDuration(61, 'en')).toBe('1 hour 1 minute');
        expect(formatDuration(89, 'en')).toBe('1 hour 29 minutes');
        expect(formatDuration(90, 'en')).toBe('1 hour 30 minutes');
    });

    it('clamps invalid or negative durations to zero', () => {
        expect(formatDuration(-15, 'en')).toBe('0 minutes');
        expect(formatDuration(Number.NaN, 'en')).toBe('0 minutes');
    });
});
