const { buildReportPdf, plainText, cleanFilenamePart } = require('../src/services/reportPdfRenderer');

describe('native diagnostic report PDF renderer', () => {
    test('builds a valid PDF with finalized report content and center identity', async () => {
        const pdf = await buildReportPdf({
            exam_id: 'exam-1',
            order_number: 'ORD-20260807-TEST',
            mrn: 'PAT-TEST',
            patient_name: 'Test Patient',
            exam_type_name: 'Lumbar Spine X-Ray',
            created_at: '2026-08-07T15:18:00.000Z',
            report_sections: {
                technique: 'Multiview radiographs of the knee were obtained.',
                findings: 'No acute fracture of the knee. Knee alignment is maintained.',
                impression: 'No acute osseous abnormality of the knee.'
            },
            digital_signature_hash: 'ABCDEF1234567890',
            digital_signature_name: 'Dr. Test Radiologist'
        }, {
            center_name: 'Tiba Scan Center',
            phone: '+201020908997',
            report_footer: '{{center_name}} | {{phone}}'
        });

        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(pdf.length).toBeGreaterThan(5000);
    });

    test('normalizes rich text and unsafe filename characters', () => {
        expect(plainText('<p>Finding &amp; result</p><br>Next')).toBe('Finding & result\n\nNext');
        expect(cleanFilenamePart('ORD / 2026:42')).toBe('ORD-2026-42');
    });
});
