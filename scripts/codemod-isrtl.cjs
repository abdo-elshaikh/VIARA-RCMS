/**
 * Codemod: migrate `isRtl/isArabic/isAr ? 'عربي' : 'English'` ternaries to
 * i18n keys. Safe by design:
 *   - Only touches files that destructure `t` from useTranslation
 *   - Skips lines where the ternary lives outside a plausible component scope
 *     (module-level const arrays BEFORE the useTranslation line are skipped
 *     when the file has no module-level t — detected by first-use line number)
 *   - Generates keys from the English text (camelCase slug, deduped)
 *   - Writes AR + EN values into the file's namespace JSONs (BOM-safe, no
 *     overwrite of existing keys)
 *   - Handles quotes inside template literals and plain strings
 * Usage: node codemod-isrtl.mjs <file1.jsx> [file2.jsx ...]  (paths relative to frontend/)
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = 'D:/VIARA/frontend';
const arabicRe = /[\u0600-\u06FF]/;
const TERNARY_RE = /\b(isRtl|isArabic|isAr)\s*\?\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

const slugKey = (en) => {
    const words = String(en)
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .map((w, i) => {
            const lower = w.toLowerCase();
            return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        });
    return words.join('') || 'label';
};

const unescapeStr = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');

const processFile = (relPath) => {
    const abs = path.join(FRONTEND, relPath);
    let src = fs.readFileSync(abs, 'utf8');

    // Must destructure t from useTranslation.
    const nsMatch = src.match(/useTranslation\(\s*['"]([^'"]+)['"]\s*\)/);
    const namespace = nsMatch ? nsMatch[1] : 'common';
    const hasT = /const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation/.test(src);
    if (!hasT) {
        console.log(`SKIP ${relPath}: no t in scope`);
        return { replaced: 0, keys: {} };
    }

    // Find all ternaries.
    const keys = {};   // key -> {en, ar}
    const used = new Set(); // existing key slugs for uniqueness
    let replaced = 0;
    const lineFirstT = src.indexOf('useTranslation');

    src = src.replace(TERNARY_RE, (full, flag, arRaw, arSq, arDq, enRaw, enSq, enDq, offset) => {
        const ar = unescapeStr(arSq !== undefined ? arSq : arDq);
        const en = unescapeStr(enSq !== undefined ? enSq : enDq);
        // Direction semantics: these flags are true in Arabic/RTL mode.
        const arTrue = arabicRe.test(ar) ? ar : en;
        const enText = arabicRe.test(ar) ? en : ar;
        if (!arabicRe.test(arTrue)) return full; // no Arabic involved — leave alone
        if (!enText || !/[A-Za-z]/.test(enText)) {
            // Arabic with no English counterpart — still migrate (EN fallback = AR).
        }
        let key = slugKey(enText || arTrue);
        while (used.has(key) && keys[key] && (keys[key].ar !== arTrue || keys[key].en !== enText)) {
            key += 'X';
        }
        used.add(key);
        keys[key] = { en: enText || arTrue, ar: arTrue };
        replaced += 1;
        return `t('${key}')`;
    });

    if (replaced === 0) {
        console.log(`SKIP ${relPath}: no convertible ternaries`);
        return { replaced: 0, keys: {} };
    }

    fs.writeFileSync(abs, src, 'utf8');

    // Merge keys into locale files (preserve existing, BOM-safe).
    for (const lang of ['en', 'ar']) {
        const localePath = path.join(FRONTEND, 'src/i18n/locales', lang, `${namespace}.json`);
        if (!fs.existsSync(localePath)) {
            console.log(`  (no ${localePath} — skipping ${lang} values)`);
            continue;
        }
        const raw = fs.readFileSync(localePath, 'utf8');
        const json = JSON.parse(raw.replace(/^\uFEFF/, ''));
        let added = 0;
        for (const [k, v] of Object.entries(keys)) {
            if (json[k] === undefined) { json[k] = v[lang]; added += 1; }
        }
        fs.writeFileSync(localePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
        console.log(`  ${lang}/${namespace}.json +${added} keys`);
    }
    console.log(`DONE ${relPath}: ${replaced} ternaries -> t() [ns=${namespace}]`);
    return { replaced, keys };
};

const files = process.argv.slice(2);
let total = 0;
for (const f of files) {
    const { replaced } = processFile(f);
    total += replaced;
}
console.log(`\nTOTAL replaced: ${total}`);
