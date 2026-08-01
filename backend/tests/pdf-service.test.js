const { buildReportHtml } = require('../src/services/pdfService');

const report = {
    exam_id: 'exam-1',
    order_number: 'ORD-100',
    patient_name: 'Test Patient',
    mrn: 'MRN-100',
    exam_type_name: 'CT Chest',
    modality_type: 'CT',
    report_status: 'Finalized',
    report_locked: true,
    report_sections: {
        clinicalHistory: 'Cough',
        technique: 'CT without contrast.',
        findings: 'No focal opacity.',
        impression: 'No acute chest abnormality.'
    },
    digital_signature_name: 'Dr Test',
    digital_signature_hash: 'verified-hash'
};

describe('report PDF HTML', () => {
    test('renders comprehensive report metadata and sections', () => {
        const html = buildReportHtml(report, { center_name: 'RCMS Center' });

        expect(html).toContain('RCMS Center');
        expect(html).toContain('Order / Accession');
        expect(html).toContain('ORD-100');
        expect(html).toContain('No acute chest abnormality.');
        expect(html).toContain('<div class="signature-block">');
    });

    test('honors header, footer, and signature export options', () => {
        const html = buildReportHtml(report, {
            includeHeader: false,
            includeFooter: false,
            includeSignature: false
        });

        expect(html).not.toContain('<header>');
        expect(html).not.toContain('<footer>');
        expect(html).not.toContain('<div class="signature-block">');
    });
});
