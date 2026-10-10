import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(srcRoot, '../..');
const readFrontend = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');

const dedicatedPrintPages = [
    'components/print/PrintBookingSlip.jsx',
    'components/print/PrintInvoice.jsx',
    'components/print/PrintReceipt.jsx',
    'components/print/PrintSticker.jsx',
];

describe('print layout consistency', () => {
    it.each(dedicatedPrintPages)('%s uses the responsive shared print workspace', (file) => {
        const source = readFrontend(file);
        expect(source).toContain("../../styles/printDocuments.css");
        expect(source).toContain("./printTheme");
        expect(source).toContain("./PrintControls");
        expect(source).toMatch(/print-workspace/);
        expect(source).toMatch(/PrintSidebar/);
        expect(source).toMatch(/PrintStage/);
        expect(source).toMatch(/print-document|PrintDocument/);
        expect(source).toMatch(/printWhenReady/);
        expect(source).toMatch(/buildPrintStyles/);
    });

    it('keeps all pages on the shared @page and paper-size rules', () => {
        dedicatedPrintPages.forEach((file) => {
            const source = readFrontend(file);
            expect(source).toMatch(/resolvePageRule/);
        });
        const theme = readFrontend('components/print/printTheme.js');
        expect(theme).toMatch(/@page\s*\{/);
        expect(theme).toMatch(/A4/);
        expect(theme).toMatch(/A5/);
        expect(theme).toMatch(/Letter/);
        expect(theme).toMatch(/80mm/);
        expect(theme).toMatch(/58mm/);
        expect(theme).toMatch(/landscape/);
    });

    it('defines screen adaptation separately from physical print output', () => {
        const css = readFrontend('styles/printDocuments.css');
        expect(css).toMatch(/@media screen/);
        expect(css).toMatch(/@media \(max-width: 1023px\)/);
        expect(css).toMatch(/@media \(max-width: 639px\)/);
        expect(css).toMatch(/@media print/);
        expect(css).toMatch(/table-header-group/);
        expect(css).toMatch(/break-inside: avoid/);
        expect(css).toMatch(/\.print-segmented/);
        expect(css).toMatch(/\.print-option\[aria-pressed="true"\]/);
        expect(css).toMatch(/\.print-toggle/);
        expect(css).toMatch(/var\(--print-accent\)/);
    });

    it('links sticker QR codes to the case details page by default', () => {
        const source = readFrontend('components/print/PrintSticker.jsx');
        expect(source).toMatch(/useState\('case'\)/);
        expect(source).toMatch(/\/cases\/\$\{caseExamId\}/);
        expect(source).toMatch(/value: 'case'/);
    });

    it('unifies every print template on the shared tokenized document anatomy', () => {
        const css = readFrontend('styles/printDocuments.css');
        const theme = readFrontend('components/print/printTheme.js');
        const primitives = readFrontend('components/print/PrintDocument.jsx');
        expect(theme).toMatch(/getDocScaleClasses/);
        expect(css).toMatch(/\.print-doc\s*\{/);
        expect(css).toMatch(/--pd-title:/);
        expect(css).toMatch(/--pd-hero:/);
        expect(css).toMatch(/font-variant-numeric: tabular-nums/);
        expect(css).toMatch(/\.pd-ledger tbody tr:nth-child\(even\)/);
        expect(css).toMatch(/\.pd-watermark/);
        expect(css).toMatch(/\.pd-tear/);
        expect(css).toMatch(/\.pd-accent-edge/);
        expect(primitives).toMatch(/DocIdentityHeader/);
        expect(primitives).toMatch(/DocSectionHead/);
        expect(primitives).toMatch(/DocMetaCell/);
        expect(primitives).toMatch(/DocFooter/);
        dedicatedPrintPages.forEach((file) => {
            const source = readFrontend(file);
            expect(source).toMatch(/getDocScaleClasses|from '\.\/PrintDocument'/);
        });
    });

    it('keeps generated invoice HTML responsive and print-safe', () => {
        const controller = fs.readFileSync(path.join(workspaceRoot, 'backend/src/controllers/invoiceController.js'), 'utf8');
        expect(controller).toMatch(/name="viewport"/);
        expect(controller).toMatch(/@page\{size:A4/);
        expect(controller).toMatch(/thead\{display:table-header-group\}/);
        expect(controller).toMatch(/@media\(max-width:640px\)/);
    });

    it('preserves report styles when printing a selected batch', () => {
        const source = readFrontend('pages/CaseReports.jsx');
        expect(source).toMatch(/querySelectorAll\('style'\)/);
        expect(source).toMatch(/customize-panel, script, \.no-print/);
        expect(source).toMatch(/printWhenReady\(popup\)/);
    });
});
