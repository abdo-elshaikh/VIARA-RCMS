import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { exportReportToWord } from '../exportReportToWord';

describe('exportReportToWord', () => {
    afterEach(() => vi.restoreAllMocks());

    it('generates and downloads a real DOCX report', async () => {
        const createObjectURL = vi.fn(() => 'blob:report');
        const revokeObjectURL = vi.fn();
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        await exportReportToWord({
            exam: {
                exam_id: 'exam-1', order_number: 'ORD-100', mrn: 'MRN-100', patient_name: 'Test Patient',
                exam_type_name: 'CT Chest', modality_type: 'CT', priority: 'Routine', report_status: 'Finalized',
                report_locked: true, report_finalized_at: '2026-08-07T16:00:00.000Z', radiologist_name: 'Dr Test', digital_signature_name: 'Dr Test'
            },
            sections: {
                clinicalHistory: 'Cough', technique: 'CT without contrast', findings: 'No focal opacity.',
                impression: 'No acute chest abnormality.', recommendations: ''
            },
            t: (key, options) => options?.defaultValue || key,
            locale: 'en-US'
        });

        expect(createObjectURL).toHaveBeenCalledOnce();
        const blob = createObjectURL.mock.calls[0][0];
        expect(blob).toBeInstanceOf(Blob);
        expect(click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');

        const bytes = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(blob);
        });
        const archive = await JSZip.loadAsync(bytes);
        const documentXml = await archive.file('word/document.xml').async('string');
        const reportXml = (await Promise.all(
            Object.keys(archive.files)
                .filter((path) => /^word\/(?:document|header\d*|footer\d*)\.xml$/.test(path))
                .map((path) => archive.file(path).async('string'))
        )).join('\n');
        expect(reportXml).toContain('Diagnostic Imaging Report');
        expect(reportXml).toContain('Test Patient');
        expect(reportXml).toContain('CT Chest');
        expect(reportXml).toContain('No acute chest abnormality.');
        expect(reportXml).toContain('Digitally signed and verified');
        expect(documentXml).toMatch(/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
    });
});
