import { describe, expect, test } from 'vitest';
import { getNextReportStatus, getReportStatusForSave } from '../constants';

describe('report editor workflow', () => {
    test('exposes only the next available review stage', () => {
        expect(getNextReportStatus('Draft')).toBe('Typed');
        expect(getNextReportStatus('Typed')).toBe('Reviewed');
        expect(getNextReportStatus('Reviewed')).toBe('Approved');
        expect(getNextReportStatus('Approved')).toBeNull();
    });

    test('preserves reviewed and approved status while saving edits', () => {
        expect(getReportStatusForSave('Draft')).toBe('Typed');
        expect(getReportStatusForSave('Reviewed')).toBe('Reviewed');
        expect(getReportStatusForSave('Approved')).toBe('Approved');
    });
});
