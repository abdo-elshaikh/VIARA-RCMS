import { describe, expect, it, vi } from 'vitest';
import { getSheetPreviewVariables, openPrintDocument, printWhenReady } from '../printDocument';

describe('print document helpers', () => {
    it('keeps a usable print window handle and detaches its opener', async () => {
        vi.useFakeTimers();
        try {
            const child = { opener: {}, document: { write: vi.fn(), close: vi.fn(), images: [] }, focus: vi.fn(), print: vi.fn() };
            const open = vi.fn().mockReturnValue(child);
            expect(openPrintDocument('<html>synthetic</html>', { open })).toBe(child);
            expect(open).toHaveBeenCalledWith('', '_blank');
            expect(child.opener).toBeNull();
            expect(child.document.write).toHaveBeenCalledWith('<html>synthetic</html>');
            await vi.advanceTimersByTimeAsync(350);
            expect(child.print).toHaveBeenCalledOnce();
        } finally { vi.useRealTimers(); }
    });

    it('reports a blocked popup so the caller can provide a fallback', () => {
        expect(openPrintDocument('synthetic', { open: vi.fn().mockReturnValue(null) })).toBeNull();
    });
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
