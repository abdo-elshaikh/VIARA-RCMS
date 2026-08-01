import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../locales/en/settings.json';
import ar from '../locales/ar/settings.json';

const SETTINGS_PAGE = path.resolve(process.cwd(), 'src/pages/Settings.jsx');
const SETTINGS_COMPONENTS = path.resolve(process.cwd(), 'src/components/settings');

const flattenKeys = (value, prefix = '', keys = []) => {
    Object.entries(value).forEach(([key, child]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === 'object' && !Array.isArray(child)) {
            flattenKeys(child, fullKey, keys);
        } else {
            keys.push(fullKey);
        }
    });
    return keys;
};

const collectSourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
});

const readLiteralTranslationKeys = () => {
    const keys = new Set();
    [SETTINGS_PAGE, ...collectSourceFiles(SETTINGS_COMPONENTS)].forEach(file => {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
            if (!match[1].includes(':')) keys.add(match[1]);
        }
    });
    return [...keys];
};

const hasKey = (locale, key) => key.split('.').every((part) => {
    locale = locale?.[part];
    return locale !== undefined;
});

describe('settings locale contract', () => {
    it('keeps English and Arabic settings structurally aligned', () => {
        expect(flattenKeys(ar).sort()).toEqual(flattenKeys(en).sort());
    });

    it('defines every literal translation used by the settings page and subpages', () => {
        const usedKeys = readLiteralTranslationKeys();
        expect(usedKeys.filter(key => !hasKey(en, key))).toEqual([]);
        expect(usedKeys.filter(key => !hasKey(ar, key))).toEqual([]);
    });

    it('defines dynamic language and AI provider labels in both locales', () => {
        const dynamicKeys = [
            'settings.preferences.languages.en.name',
            'settings.preferences.languages.en.direction',
            'settings.preferences.languages.ar.name',
            'settings.preferences.languages.ar.direction',
            ...Object.keys(en.settings.aiProfiles.providers).map(provider => `settings.aiProfiles.providers.${provider}`)
        ];

        dynamicKeys.forEach(key => {
            expect(hasKey(en, key), `${key} is missing in English`).toBe(true);
            expect(hasKey(ar, key), `${key} is missing in Arabic`).toBe(true);
        });
        expect(ar.settings.tabs.ai).toBe('مزودو الذكاء الاصطناعي');
        expect(ar.settings.tabDescriptions.ai).not.toBe(en.settings.tabDescriptions.ai);
    });
});
