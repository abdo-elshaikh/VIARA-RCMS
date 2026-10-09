const { buildReportPdf, plainText, cleanFilenamePart } = require('../src/services/reportPdfRenderer');
const QRCode = require('qrcode');

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
    }, 15000);

    test('normalizes rich text and unsafe filename characters', () => {
        expect(plainText('<p>Finding &amp; result</p><br>Next')).toBe('Finding & result\n\nNext');
        expect(cleanFilenamePart('ORD / 2026:42')).toBe('ORD-2026-42');
    });

    test('encodes the finalized-report QR to the public portal verification link', async () => {
        const spy = jest.spyOn(QRCode, 'toBuffer');
        const previous = { portal: process.env.PORTAL_CLIENT_URL, legacy: process.env.PORTAL_URL };
        process.env.PORTAL_CLIENT_URL = 'https://portal.example.org';
        delete process.env.PORTAL_URL;
        try {
            await buildReportPdf({
                exam_id: 'exam-2',
                order_number: 'ORD-2',
                patient_name: 'Test Patient',
                exam_type_name: 'CT Chest',
                report_status: 'Finalized',
                report_locked: true,
                report_finalized_at: '2026-08-07T15:18:00.000Z',
                report_sections: { findings: 'Stable.', impression: 'Stable.' },
                digital_signature_hash: 'ABCDEF1234567890',
                digital_signature_name: 'Dr. Test Radiologist'
            }, { center_name: 'Tiba Scan Center', report_footer: '{{center_name}}' });

            expect(spy).toHaveBeenCalled();
            const [payload] = spy.mock.calls.at(-1);
            expect(payload.startsWith('https://portal.example.org/verify?code=')).toBe(true);
        } finally {
            spy.mockRestore();
            if (previous.portal === undefined) delete process.env.PORTAL_CLIENT_URL;
            else process.env.PORTAL_CLIENT_URL = previous.portal;
            if (previous.legacy === undefined) delete process.env.PORTAL_URL;
            else process.env.PORTAL_URL = previous.legacy;
        }
    }, 15000);
});
