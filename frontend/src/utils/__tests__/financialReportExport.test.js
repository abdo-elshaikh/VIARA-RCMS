import { describe, expect, it } from 'vitest';
import { sanitizeSpreadsheetCell } from '../financialReportExport';

describe('financialReportExport', () => {
    it('neutralizes spreadsheet formula injection prefixes', () => {
        expect(sanitizeSpreadsheetCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
        expect(sanitizeSpreadsheetCell('+123')).toBe("'+123");
        expect(sanitizeSpreadsheetCell('-123')).toBe("'-123");
        expect(sanitizeSpreadsheetCell('@cmd')).toBe("'@cmd");
    });

    it('preserves ordinary financial report values', () => {
        expect(sanitizeSpreadsheetCell('Gross revenue')).toBe('Gross revenue');
        expect(sanitizeSpreadsheetCell('EGP 100.00')).toBe('EGP 100.00');
    });
});
