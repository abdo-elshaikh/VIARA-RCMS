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
        expect(source).toMatch(/print-workspace/);
        expect(source).toMatch(/print-controls/);
        expect(source).toMatch(/print-preview-stage/);
        expect(source).toMatch(/print-document/);
        expect(source).toMatch(/printWhenReady/);
    });

    it('defines screen adaptation separately from physical print output', () => {
        const css = readFrontend('styles/printDocuments.css');
        expect(css).toMatch(/@media screen/);
        expect(css).toMatch(/@media \(max-width: 1023px\)/);
        expect(css).toMatch(/@media \(max-width: 639px\)/);
        expect(css).toMatch(/@media print/);
        expect(css).toMatch(/table-header-group/);
        expect(css).toMatch(/break-inside: avoid/);
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
