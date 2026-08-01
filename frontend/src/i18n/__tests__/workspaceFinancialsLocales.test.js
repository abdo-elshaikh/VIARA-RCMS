import { describe, expect, it } from 'vitest';
import en from '../locales/en/workspace.json';
import ar from '../locales/ar/workspace.json';

const FINANCIAL_TAB_IDS = [
    'reports',
    'pl',
    'expenses',
    'commissions',
    'discounts',
    'receivables',
    'cashier',
    'ledger',
    'closures'
];

const FINANCIAL_SHELL_KEYS = [
    'discountExceptions',
    'discountImpact',
    'ledgerStatus'
];

const hasArabic = (value) => /[\u0600-\u06FF]/.test(String(value || ''));

describe('financial workspace locale contract', () => {
    it('defines labels, descriptions, and outcomes for every finance tab', () => {
        FINANCIAL_TAB_IDS.forEach((id) => {
            expect(en.finance.tabs[id], `English finance.tabs.${id}`).toBeTruthy();
            expect(en.finance.tabDescriptions[id], `English finance.tabDescriptions.${id}`).toBeTruthy();
            expect(en.finance.workspaceShell.outcomes[id], `English finance.workspaceShell.outcomes.${id}`).toBeTruthy();

            expect(ar.finance.tabs[id], `Arabic finance.tabs.${id}`).toBeTruthy();
            expect(ar.finance.tabDescriptions[id], `Arabic finance.tabDescriptions.${id}`).toBeTruthy();
            expect(ar.finance.workspaceShell.outcomes[id], `Arabic finance.workspaceShell.outcomes.${id}`).toBeTruthy();
        });
    });

    it('keeps Arabic finance tab copy native and distinct from English', () => {
        FINANCIAL_TAB_IDS.forEach((id) => {
            [
                ar.finance.tabs[id],
                ar.finance.tabDescriptions[id],
                ar.finance.workspaceShell.outcomes[id]
            ].forEach((value) => expect(hasArabic(value), `${id}: ${value}`).toBe(true));

            expect(ar.finance.tabs[id]).not.toBe(en.finance.tabs[id]);
        });
    });

    it('defines native Arabic copy for finance shell KPI labels', () => {
        FINANCIAL_SHELL_KEYS.forEach((key) => {
            expect(en.finance.workspaceShell[key], `English finance.workspaceShell.${key}`).toBeTruthy();
            expect(ar.finance.workspaceShell[key], `Arabic finance.workspaceShell.${key}`).toBeTruthy();
            expect(hasArabic(ar.finance.workspaceShell[key]), `${key}: ${ar.finance.workspaceShell[key]}`).toBe(true);
        });
    });
});
