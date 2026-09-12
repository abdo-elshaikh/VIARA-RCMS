import { describe, expect, it, vi } from 'vitest';
import { getSheetPreviewVariables, printWhenReady } from '../printDocument';

describe('print document helpers', () => {
    it('derives responsive preview variables without changing physical units', () => {
        expect(getSheetPreviewVariables({ width: '210mm', height: '297mm' })).toEqual({
            '--print-page-width': '210mm',
            '--print-page-aspect': '210 / 297',
        });
        expect(getSheetPreviewVariables({ width: '8.5in', height: '11in' })['--print-page-aspect']).toBe('8.5 / 11');
    });

    it('waits for document assets before opening the browser print dialog', async () => {
        const focus = vi.fn();
        const print = vi.fn();
        const windowRef = {
            document: { fonts: { ready: Promise.resolve() }, images: [] },
            focus,
            print,
        };

        await printWhenReady(windowRef);

        expect(focus).toHaveBeenCalledOnce();
        expect(print).toHaveBeenCalledOnce();
    });
});
