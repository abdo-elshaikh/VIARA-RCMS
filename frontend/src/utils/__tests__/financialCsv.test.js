import { expect, it } from 'vitest';
import { escapeFinancialCsvValue } from '../financialCsv';
it('protects spreadsheet formulas without changing numeric financial amounts', () => {
    expect(escapeFinancialCsvValue('=HYPERLINK("synthetic")')).toBe('"\'=HYPERLINK(""synthetic"")"');
    expect(escapeFinancialCsvValue('  @SUM(1,2)')).toBe('"\'  @SUM(1,2)"');
    expect(escapeFinancialCsvValue('-150.00')).toBe('-150.00');
    expect(escapeFinancialCsvValue(-150)).toBe('-150');
    expect(escapeFinancialCsvValue('مصروف, اصطناعي')).toBe('"مصروف, اصطناعي"');
});
