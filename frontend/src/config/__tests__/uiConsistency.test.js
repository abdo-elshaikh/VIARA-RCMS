import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readSource = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');

const routedOperationalPages = [
    'pages/DashboardHome.jsx',
    'pages/Help.jsx',
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
    'pages/ReportEditorPage.jsx',
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

    it('keeps the full-screen PACS header specialized while integrating study indicators', () => {
        const source = readSource('pages/PacsViewer.jsx');
        expect(source).toMatch(/<WorkstationHeader\b/);
        expect(source).toMatch(/seriesCount=\{seriesGroups\.length\}/);
        expect(source).toMatch(/instanceCount=/);
        expect(source).toMatch(/keyImageCount=\{keyImages\.size\}/);
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
