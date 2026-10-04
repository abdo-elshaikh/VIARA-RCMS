const { buildReportHtml } = require('../src/services/pdfService');

// Mock the license singleton so we can drive the trial watermark on/off
// without spinning up the full license key infrastructure.
jest.mock('../src/services/licenseService', () => ({
    getLicense: jest.fn(() => ({ edition: 'standard', allowedModules: ['*'], daysRemaining: null })),
    loadLicense: jest.fn(),
    licenseAllows: jest.fn(() => true),
}));

const { getLicense } = require('../src/services/licenseService');

/**
 * Extracts the CSS `display` value of the `.trial-watermark` rule so tests can
 * assert the overlay is toggled by the license edition rather than by the
 * client's own watermark preference.
 */
const trialWatermarkDisplay = (html) => {
    const rule = html.match(/\.trial-watermark\s*\{([^}]*)\}/);
    if (!rule) return null;
    const display = rule[1].match(/display:\s*([a-z]+)/i);
    return display ? display[1].toLowerCase() : null;
};

const report = {
    exam_id: 'exam-1',
    order_number: 'ORD-100',
    patient_name: 'Test Patient',
    mrn: 'MRN-100',
    exam_type_name: 'CT Chest',
    modality_type: 'CT',
    report_status: 'Finalized',
    report_locked: true,
    report_finalized_at: '2026-08-07T16:00:00.000Z',
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
        const html = buildReportHtml(report, { center_name: 'Cairo Scan' });

        expect(html).toContain('Cairo Scan');
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

    test('uses the report originating branch before global center defaults', () => {
        const html = buildReportHtml({
            ...report,
            branch_name: 'Nasr City Branch',
            branch_address: '15 Abbas El Akkad',
            branch_phone: '+20 2 9000 0000'
        }, {
            center_name: 'Cairo Scan',
            address: 'Main HQ',
            phone: '+20 2 1111 1111'
        });

        expect(html).toContain('Cairo Scan - Nasr City Branch');
        expect(html).toContain('15 Abbas El Akkad');
        expect(html).toContain('+20 2 9000 0000');
        expect(html).not.toContain('Main HQ');
    });

    test('preserves finalized report identity snapshots over current settings', () => {
        const html = buildReportHtml({
            ...report,
            organization_snapshot: {
                center_name: 'Historical Scan',
                branch_name: 'Heliopolis Branch',
                address: 'Historical address'
            }
        }, {
            center_name: 'Renamed Scan',
            address: 'New address'
        });

        expect(html).toContain('Historical Scan - Heliopolis Branch');
        expect(html).toContain('Historical address');
        expect(html).not.toContain('Renamed Scan');
    });

    test('resolves configured header and footer placeholders without leaking template tokens', () => {
        const html = buildReportHtml(report, {
            center_name: 'Tiba Scan Center',
            phone: '+20 100 200 3000',
            website: 'tibascan.example',
            address: 'Cairo, Egypt',
            report_header: '{center_name} {phone}',
            report_footer: '{website} {address}'
        });

        expect(html).toContain('+20 100 200 3000');
        expect(html).toContain('tibascan.example Cairo, Egypt');
        expect(html).not.toContain('{center_name}');
        expect(html).not.toContain('{phone}');
        expect(html).not.toContain('{website}');
        expect(html).not.toContain('{address}');
    });

    test('emits a browser-safe checksum expression for offline verification', () => {
        const html = buildReportHtml(report, { center_name: 'Cairo Scan' });

        expect(html).toContain("var body = raw.replace(/\\|C:[A-F0-9]+$/i, '');");
        expect(html).toContain('Offline integrity OK');
    });

    test('does not mark a report verified from the examination status alone', () => {
        const html = buildReportHtml({
            ...report,
            status: 'Finalized',
            report_status: 'Draft',
            report_locked: false,
            report_finalized_at: null,
            digital_signature_hash: null,
        }, { center_name: 'Cairo Scan' });

        expect(html).toContain('Pending Signature');
        expect(html).not.toContain('Digitally Verified');
    });

    test('flags an obvious body-region mismatch without changing clinical text', () => {
        const mismatched = {
            ...report,
            exam_type_name: 'Lumbar Spine X-Ray',
            report_sections: {
                technique: 'Multiview radiographs of the knee were obtained.',
                findings: 'No acute fracture of the knee.',
                impression: 'No acute osseous abnormality of the knee.'
            }
        };

        const html = buildReportHtml(mismatched, { center_name: 'Tiba Scan Center' });

        expect(html).toContain('Clinical consistency review required');
        expect(html).toContain('report narrative repeatedly references the knee');
        expect(html).toContain('No acute osseous abnormality of the knee.');
    });

    test('injects a non-removable TRIAL watermark when the active license is trial', () => {
        getLicense.mockReturnValue({
            edition: 'trial',
            customerId: 'TEST-CLIENT',
            allowedModules: ['appointments'],
            daysRemaining: 10,
        });

        const html = buildReportHtml(report, { center_name: 'Cairo Scan' });

        // The overlay must render regardless of the client's watermark toggle
        expect(html).toContain('<div class="trial-watermark" id="trialWatermark"');
        expect(trialWatermarkDisplay(html)).toBe('block');
    });

    test('hides the TRIAL watermark when the active license is not trial', () => {
        getLicense.mockReturnValue({
            edition: 'standard',
            customerId: 'TEST-CLIENT',
            allowedModules: ['*'],
            daysRemaining: null,
        });

        const html = buildReportHtml(report, { center_name: 'Cairo Scan' });

        expect(html).not.toContain('<div class="trial-watermark"');
        expect(trialWatermarkDisplay(html)).toBe('none');
    });
});
