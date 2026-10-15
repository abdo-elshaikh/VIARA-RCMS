import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import enAdmin from '../locales/en/admin.json';
import arAdmin from '../locales/ar/admin.json';
import enApprovals from '../locales/en/approvals.json';
import arApprovals from '../locales/ar/approvals.json';
import enReception from '../locales/en/reception.json';
import arReception from '../locales/ar/reception.json';

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

const hasKey = (locale, key) => key.split('.').every((part) => {
    locale = locale?.[part];
    return locale !== undefined;
});

const readTranslationKeys = (files, prefix) => files.flatMap(file => {
    const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
    return [...source.matchAll(new RegExp(`\\bt\\(\\s*['"](${prefix}\\.[^'"]+)['"]`, 'g'))].map(match => match[1]);
});

describe('UX-07 locale contract', () => {
    it.each([
        ['approvals', enApprovals, arApprovals],
        ['reception', enReception, arReception],
    ])('keeps %s English and Arabic keys aligned', (_name, en, ar) => {
        expect(flattenKeys(ar).sort()).toEqual(flattenKeys(en).sort());
    });

    it('keeps credential handoff keys aligned and referenced strings translated', () => {
        expect(flattenKeys(arAdmin.credentialHandoff).sort()).toEqual(flattenKeys(enAdmin.credentialHandoff).sort());

        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CredentialHandoffDialog.jsx'), 'utf8');
        const keys = readTranslationKeys(['src/components/CredentialHandoffDialog.jsx'], 'credentialHandoff');
        expect(keys.filter(key => !hasKey(enAdmin, key))).toEqual([]);
        expect(keys.filter(key => !hasKey(arAdmin, key))).toEqual([]);
        expect(source).toContain('<html lang="${escapeHtml(language)}" dir="${direction}">');
    });

    it('defines every Reception state translation used by the scoped components', () => {
        const keys = readTranslationKeys([
            'src/pages/Reception.jsx',
            'src/components/reception/ReceptionErrorState.jsx',
            'src/components/reception/ReceptionLoadingState.jsx',
        ], 'states');

        expect(keys.filter(key => !hasKey(enReception, key))).toEqual([]);
        expect(keys.filter(key => !hasKey(arReception, key))).toEqual([]);
    });

    it('defines the Arabic partial-payment approval workflow without fallback text', () => {
        const keys = [
            'sources.partialPayment',
            'item.partialPaymentSubtitle',
            'facts.transaction',
            'facts.netPaid',
            'facts.balance',
            'partialPaymentTransactions.ClinicalQueueTransition',
            'partialPaymentTransactions.ResultDelivery',
            'errors.partial_other',
        ];

        keys.forEach(key => expect(hasKey(arApprovals, key), `${key} is missing`).toBe(true));
        expect(JSON.stringify(arApprovals)).not.toContain('???');
    });
});
