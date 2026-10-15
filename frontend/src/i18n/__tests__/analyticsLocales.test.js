import { describe, expect, it } from 'vitest';
import enAdmin from '../locales/en/admin.json';
import arAdmin from '../locales/ar/admin.json';

const flattenKeys = (value, prefix = '', result = []) => {
    Object.entries(value || {}).forEach(([key, item]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            flattenKeys(item, path, result);
        } else {
            result.push(path);
        }
    });
    return result.sort();
};

describe('analytics locale coverage', () => {
    it('keeps Arabic analytics coverage aligned with English', () => {
        expect(flattenKeys(arAdmin.analytics)).toEqual(flattenKeys(enAdmin.analytics));
        expect(arAdmin.analytics.tabs.overview).toBe('النظرة التنفيذية');
        expect(arAdmin.analytics.exportPdf.button).toBe('تصدير التقرير التنفيذي PDF');
        expect(arAdmin.analytics.projection.method).toBe('تقدير محسوب');
    });
});
