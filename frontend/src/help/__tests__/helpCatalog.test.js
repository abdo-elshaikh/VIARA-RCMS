import { beforeEach, describe, expect, it } from 'vitest';
import {
    HELP_SHORTCUTS,
    HELP_TASKS,
    HELP_TROUBLESHOOTING,
    getHelpCatalog,
    getLocalizedHelpItem,
    itemCanBeRead,
    itemCanOpen,
    searchHelpCatalog,
} from '../helpCatalog';

describe('Help catalog', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('searches English and Arabic aliases across tasks and errors', () => {
        const technician = { role: 'Technician' };
        expect(searchHelpCatalog('unassigned work', technician).some((item) => item.id === 'task.claim-clinical')).toBe(true);
        expect(searchHelpCatalog('حالات اليوم', technician).some((item) => item.id === 'error.queue-empty')).toBe(true);
        expect(searchHelpCatalog('PACS', technician).some((item) => item.id === 'error.pacs-missing')).toBe(true);
    });

    it('deduplicates supplemental legacy items by stable id', () => {
        const catalog = getHelpCatalog([{ id: HELP_TASKS[0].id, type: 'guide', roles: ['Technician'] }]);
        expect(catalog.filter((item) => item.id === HELP_TASKS[0].id)).toHaveLength(1);
    });

    it('keeps guidance readable while protecting a gated action link', () => {
        const item = HELP_TASKS.find((candidate) => candidate.id === 'task.collect-payment');
        const cashierWithoutClaims = { role: 'Cashier', permissions: [] };
        expect(itemCanBeRead(item, cashierWithoutClaims)).toBe(true);
        expect(itemCanOpen(item, cashierWithoutClaims)).toBe(false);
        expect(itemCanOpen(item, { role: 'Cashier', permissions: ['PROCESS_PAYMENTS', 'VIEW_INVOICES'] })).toBe(true);
    });

    it('exposes only role-appropriate shortcut records', () => {
        const nurseResults = searchHelpCatalog('Ctrl', { role: 'Nurse' });
        expect(nurseResults.some((item) => item.id === 'report-save')).toBe(false);
        expect(HELP_SHORTCUTS.some((item) => item.id === 'pacs-cine')).toBe(true);
    });

    it('returns localized fallback content', () => {
        const item = HELP_TROUBLESHOOTING[1];
        expect(getLocalizedHelpItem(item, 'ar').title).toContain('DICOM');
        expect(getLocalizedHelpItem(item, 'en').steps.length).toBeGreaterThan(0);
    });
});
