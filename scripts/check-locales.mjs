import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const APPS = ['frontend', 'portal'];
const MOJIBAKE = /[\u00D8\u00D9]|\u00E2\u20AC|\uFFFD/;
const PLURAL_WITH_OPTIONAL_COUNT = /_(zero|one|two|few|many|other)$/;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const flatten = (value, prefix = '', result = {}) => {
    Object.entries(value).forEach(([key, child]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, result);
        else result[fullKey] = child;
    });
    return result;
};

const placeholders = (value) => [...String(value).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');

const failures = [];

for (const app of APPS) {
    const localeRoot = path.join(ROOT, app, 'src', 'i18n', 'locales');
    const englishFiles = fs.readdirSync(path.join(localeRoot, 'en')).filter((file) => file.endsWith('.json'));

    for (const file of englishFiles) {
        const englishPath = path.join(localeRoot, 'en', file);
        const arabicPath = path.join(localeRoot, 'ar', file);
        if (!fs.existsSync(arabicPath)) {
            failures.push(`${app}/${file}: missing Arabic namespace`);
            continue;
        }

        const english = flatten(readJson(englishPath));
        const arabic = flatten(readJson(arabicPath));
        const missingArabic = Object.keys(english).filter((key) => !(key in arabic));
        const missingEnglish = Object.keys(arabic).filter((key) => !(key in english));
        if (missingArabic.length) failures.push(`${app}/${file}: missing Arabic keys: ${missingArabic.join(', ')}`);
        if (missingEnglish.length) failures.push(`${app}/${file}: missing English keys: ${missingEnglish.join(', ')}`);

        Object.keys(english).filter((key) => key in arabic).forEach((key) => {
            if (!PLURAL_WITH_OPTIONAL_COUNT.test(key) && placeholders(english[key]) !== placeholders(arabic[key])) {
                failures.push(`${app}/${file}:${key}: interpolation placeholders differ`);
            }
        });

        Object.entries({ ...english, ...arabic }).forEach(([key, value]) => {
            if (typeof value === 'string' && MOJIBAKE.test(value)) {
                failures.push(`${app}/${file}:${key}: suspected encoding corruption`);
            }
        });
    }
}

if (failures.length) {
    console.error(`Locale contract failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log('Locale contract passed: English/Arabic keys, placeholders, and encoding are aligned.');
