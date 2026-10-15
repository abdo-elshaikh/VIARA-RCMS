import { describe, expect, it } from 'vitest';
import en from '../locales/en/integrations.json';
import ar from '../locales/ar/integrations.json';

const flattenKeys = (value, prefix = '', result = []) => {
    Object.entries(value || {}).forEach(([key, item]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (item && typeof item === 'object' && !Array.isArray(item)) flattenKeys(item, path, result);
        else result.push(path);
    });
    return result.sort();
};

describe('integration settings locale coverage', () => {
    it('keeps Arabic and English integration keys aligned', () => {
        expect(flattenKeys(ar)).toEqual(flattenKeys(en));
        expect(ar.title).toBe('التكاملات');
        expect(ar.health.Healthy).toBe('سليم');
        expect(en.guides.stripe.steps).toHaveLength(3);
        expect(ar.guides.stripe.steps).toHaveLength(3);
    });
});
