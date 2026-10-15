import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../locales/en/worklist.json';
import ar from '../locales/ar/worklist.json';

const WORKLIST_PAGE = path.resolve(process.cwd(), 'src/pages/Worklist.jsx');

const flattenKeys = (value, prefix = '', keys = []) => {
    Object.entries(value).forEach(([key, child]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === 'object' && !Array.isArray(child)) flattenKeys(child, fullKey, keys);
        else keys.push(fullKey);
    });
    return keys;
};

const hasKey = (locale, key) => key.split('.').every((part) => {
    locale = locale?.[part];
    return locale !== undefined;
});

const readLiteralTranslationKeys = () => {
    const source = fs.readFileSync(WORKLIST_PAGE, 'utf8');
    return [...new Set([...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]))];
};

describe('worklist locale contract', () => {
    it('keeps English and Arabic worklist translations structurally aligned', () => {
        expect(flattenKeys(ar).sort()).toEqual(flattenKeys(en).sort());
    });

    it('defines every literal translation used by the worklist page', () => {
        const keys = readLiteralTranslationKeys();
        expect(keys.filter(key => !hasKey(en, key))).toEqual([]);
        expect(keys.filter(key => !hasKey(ar, key))).toEqual([]);
    });
});
