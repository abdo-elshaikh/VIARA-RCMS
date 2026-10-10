import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readSource = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');

const routedOperationalPages = [
    'pages/DashboardHome.jsx',
    'pages/Admin.jsx',
    'pages/Users.jsx',
    'pages/UserDetailPage.jsx',
    'pages/ReferringDoctors.jsx',
    'pages/DoctorDetailPage.jsx',
    'pages/PacsReconciliation.jsx',
    'pages/Settings.jsx',
    'pages/Profile.jsx',
    'pages/Notifications.jsx',
    'pages/PendingRequests.jsx',
    'pages/AnalyticsDashboard.jsx',
    'pages/Worklist.jsx',
    'pages/CaseReports.jsx',
    'pages/CaseDetailsPage.jsx',
    'pages/Appointments.jsx',
    'pages/BookAppointment.jsx',
    'pages/Patients.jsx',
    'pages/PatientDetailPage.jsx',
    'pages/Financials.jsx',
    'pages/Payroll.jsx',
    'pages/Insurance.jsx',
    'pages/Equipment.jsx',
    'pages/HR.jsx',
    'pages/Marketing.jsx',
    'pages/Modality.jsx',
    'pages/Nurse.jsx',
    'pages/Inventory.jsx',
    'components/reception/ReceptionOperations.jsx',
];

const paginatedRecordSurfaces = [
    'pages/Appointments.jsx',
    'pages/AuditLogs.jsx',
    'pages/CaseReports.jsx',
    'pages/NotificationSettings.jsx',
    'pages/Notifications.jsx',
    'pages/PacsReconciliation.jsx',
    'pages/Patients.jsx',
    'pages/Technician.jsx',
    'pages/Users.jsx',
    'pages/Worklist.jsx',
    'components/finance/GeneralLedger.jsx',
    'components/reception/BillingTab.jsx',
    'components/reception/CashierQueueTab.jsx',
    'components/reception/DailyOperationsTable.jsx',
    'components/reception/ModernWaitlistPanel.jsx',
    'components/reception/PatientDirectory.jsx',
    'components/settings/AuditSettings.jsx',
];

describe('operational UI consistency', () => {
    it('defines one global contract for radius, density, workspace, type, motion, and semantic status colors', () => {
        const styles = readSource('index.css');
        [
            '--VIARA-radius-control',
            '--VIARA-radius-surface',
            '--VIARA-radius-overlay',
            '--VIARA-density-card-padding',
            '--VIARA-workspace-gutter',
            '--VIARA-font-family',
            '--VIARA-type-scale',
            '--VIARA-motion-base',
            '--VIARA-success-soft',
            '--VIARA-warning-soft',
            '--VIARA-danger-soft',
            '--VIARA-info-soft',
        ].forEach((token) => expect(styles).toContain(token));
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
        expect(styles).toMatch(/@media \(forced-colors: active\)/);
    });

    it('keeps the workspace navigable and density-aware', () => {
        const layout = readSource('components/dashboard/AppLayout.jsx');
        expect(layout).toMatch(/href="#main-content"/);
        expect(layout).toMatch(/id="main-content"/);
        expect(layout).toMatch(/workspace-canvas/);
        expect(layout).toMatch(/role="separator"/);
        expect(layout).toMatch(/aria-valuenow=\{sidebarWidth\}/);
    });

    it.each(['Button.jsx', 'Input.jsx', 'Select.jsx', 'Card.jsx', 'Modal.jsx', 'PagePanel.jsx', 'Badge.jsx'])(
        'components/ui/%s consumes shared design-system classes',
        (file) => expect(readSource(`components/ui/${file}`)).toMatch(/\bds-/)
    );

    it.each(routedOperationalPages)('%s uses the shared page header', (file) => {
        const source = readSource(file);
        expect(source).toMatch(/<PageHeader\b/);
    });

    it('gates case details actions through the shared route access resolver', () => {
        const source = readSource('pages/CaseDetailsPage.jsx');
        expect(source).toMatch(/canAccessRoute\('\/case-reports', user\)/);
        expect(source).toMatch(/canAccessRoute\('\/reports\/editor\/:examId', user\)/);
        expect(source).toMatch(/canAccessRoute\('\/pacs\/viewer', user\)/);
        expect(source).toMatch(/canAccessRoute\('\/patients\/:patientId', user\)/);
        expect(source).toMatch(/!canViewReport/);
        expect(source).toMatch(/\{canResumeReport &&/);
        expect(source).toMatch(/\{canViewPacs && /);
        expect(source).toMatch(/\{canOpenPatientRecord && /);
    });

    it('drives the case workflow stepper from queue_stage rather than legacy status', () => {
        const source = readSource('pages/CaseDetailsPage.jsx');
        expect(source).toMatch(/exam\?\.queue_stage \|\| exam\?\.status/);
        expect(source).toMatch(/queue_stage/);
        expect(source).toMatch(/Cancelled/);
    });

    it.each(routedOperationalPages.filter((file) => file !== 'pages/AnalyticsDashboard.jsx'))(
        '%s integrates its record indicators in the shared header',
        (file) => {
            const source = readSource(file);
            expect(source).toMatch(/\bmetrics=/);
            expect(source).toMatch(/\bmetricsLabel=/);
        }
    );

    it('keeps analytics compact and avoids duplicating its overview KPIs in the header', () => {
        const source = readSource('pages/AnalyticsDashboard.jsx');
        expect(source).toMatch(/<PageHeader\b/);
        expect(source).toMatch(/\bcompact\b/);
        expect(source).not.toMatch(/\bmetrics=/);
        expect(source).not.toMatch(/\bmetricsLabel=/);
    });

    it('keeps the PACS header concise and makes series navigation explicit', () => {
        const source = readSource('pages/PacsViewer.jsx');
        expect(source).toMatch(/<WorkstationHeader\b/);
        expect(source).toMatch(/seriesSummary/);
        expect(source).toMatch(/seriesResults/);
        expect(source).toMatch(/<SeriesThumbnail\b/);
        expect(source).toMatch(/rootMargin: '120px'/);
        expect(source).toMatch(/aria-pressed=\{isSelected\}/);
        expect(source).toMatch(/viewTransformStatus/);
    });

    it('does not place PACS credentials in Weasis launch links', () => {
        const source = readSource('pages/PacsViewer.jsx');
        expect(source).toContain('/api/pacs/dicom-web');
        expect(source).toMatch(/handleCopy\(dicomWebBaseUrl, 'weasis-url'\)/);
        expect(source).toMatch(/handleCopy\(studyUid, 'weasis-study'\)/);
        expect(source).not.toContain('weasis://$dicom:get');
        expect(source).not.toContain('weasisProtocolUrl');
        expect(source).not.toContain('weasis-auth');
        expect(source).not.toContain('Copy Authorization Header');
    });

    it('offers ViewerHub direct launch through the configured external viewer URL', () => {
        const viewer = readSource('pages/PacsViewer.jsx');
        const settings = readSource('pages/PacsSettings.jsx');
        expect(viewer).toMatch(/handleOpenWindow\(customViewerUrl\)/);
        expect(settings).toContain('/display/auth?viewer=WEASIS&studyUID={studyUid}');
        expect(settings).toMatch(/never put access tokens in this URL/i);
    });

    it('keeps the full-height Communication Center specialized with integrated hub controls', () => {
        const source = readSource('components/communications/CommunicationCenter.jsx');
        expect(source).toMatch(/export default function CommunicationCenter/);
        expect(source).toMatch(/totalUnreadSum/);
    });

    it.each(paginatedRecordSurfaces)('%s uses the shared numbered pagination component', (file) => {
        expect(readSource(file)).toMatch(/<Pagination\b/);
    });
});
