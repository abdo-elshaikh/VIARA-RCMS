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

    it('resolves every finance hub, preset, and category label in both languages', () => {
        const HUB_KEYS = [
            'eyebrow', 'title', 'description', 'liveLedger', 'accrualBasis', 'dataUpToDate',
            'dataNeedsAttention', 'openReportBuilder', 'refresh', 'keyIndicators', 'actionQueue',
            'sectionsAria', 'categoriesAria', 'grossRevenue', 'netProfit', 'margin',
            'operatingExpenses', 'ratio', 'pendingCommissions', 'doctors', 'pending',
            'overdue', 'balanced', 'difference', 'blockers', 'discountExceptionsNeedReview',
            'overdueReceivablesNeedFollowUp', 'cashVarianceNeedsReconciliation',
            'commissionsReadyForPayment', 'periodClosureBlockers'
        ];
        const PRESET_KEYS = ['today', 'thisWeek', 'thisMonth', 'mtd', 'lastMonth', 'thisYear', 'ytd', 'custom'];
        const CATEGORY_KEYS = ['all', 'analytics', 'performance', 'expenseControl', 'liability', 'governance', 'collections', 'cashDesk', 'accountingLedger', 'periodEnd'];

        HUB_KEYS.forEach((key) => {
            expect(en.finance.common.hub[key], `English hub.${key}`).toBeTruthy();
            expect(ar.finance.common.hub[key], `Arabic hub.${key}`).toBeTruthy();
            expect(hasArabic(ar.finance.common.hub[key]), `Arabic hub.${key} must be Arabic`).toBe(true);
        });
        PRESET_KEYS.forEach((key) => {
            expect(en.finance.common.presets[key], `English preset.${key}`).toBeTruthy();
            expect(ar.finance.common.presets[key], `Arabic preset.${key}`).toBeTruthy();
        });
        CATEGORY_KEYS.forEach((key) => {
            expect(en.finance.common.categories[key], `English category.${key}`).toBeTruthy();
            expect(ar.finance.common.categories[key], `Arabic category.${key}`).toBeTruthy();
        });
    });

    it('provides closure status and profit/loss ratio labels for the report tables', () => {
        expect(en.finance.closures.status.Draft).toBeTruthy();
        expect(en.finance.closures.status.Finalized).toBeTruthy();
        expect(ar.finance.closures.status.Draft).toBeTruthy();
        expect(hasArabic(ar.finance.closures.status.Finalized)).toBe(true);

        ['efficiencyTitle', 'netMarginLabel', 'expenseRatioLabel', 'commissionRatioLabel', 'operatingReturnLabel', 'retryHint'].forEach((key) => {
            expect(en.finance.pl[key], `English pl.${key}`).toBeTruthy();
            expect(ar.finance.pl[key], `Arabic pl.${key}`).toBeTruthy();
        });
    });

    it('provides localized metadata labels for exported reports', () => {
        ['generatedAt', 'summary', 'metric', 'value'].forEach((key) => {
            expect(en.finance.reports.exportLabels[key]).toBeTruthy();
            expect(ar.finance.reports.exportLabels[key]).toBeTruthy();
            expect(hasArabic(ar.finance.reports.exportLabels[key])).toBe(true);
        });
    });

    it('provides native Arabic and English expense modal workflow labels', () => {
        [
            'addExpense', 'editExpense', 'newTitle', 'editTitle', 'immutableFieldsNote',
            'cashOut', 'bankAndCards', 'allCategories', 'searchPlaceholder', 'noSearchResults',
            'saving', 'save', 'updating', 'update', 'updateSuccess', 'updateError'
        ].forEach((key) => {
            expect(en.finance.expenses[key], `English expenses.${key}`).toBeTruthy();
            expect(ar.finance.expenses[key], `Arabic expenses.${key}`).toBeTruthy();
            expect(hasArabic(ar.finance.expenses[key]), `Arabic expenses.${key}`).toBe(true);
        });
    });
});
