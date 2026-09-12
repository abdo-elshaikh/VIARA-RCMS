import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../Settings';
import i18n from '../../i18n';

let currentUser;

vi.mock('react-redux', () => ({
    useSelector: () => currentUser
}));

vi.mock('../../components/settings/ProfileSettings', () => ({ default: () => <div>Profile panel</div> }));
vi.mock('../../components/settings/AppearanceSettings', () => ({ default: () => <div>Appearance panel</div> }));
vi.mock('../../components/settings/PreferencesSettings', () => ({ default: () => <div>Preferences panel</div> }));
vi.mock('../../components/settings/AdminSettings', () => ({ default: () => <div>System panel</div> }));
vi.mock('../../components/settings/DeveloperSettings', () => ({ default: () => <div>Developer panel</div> }));
vi.mock('../../components/settings/AuditSettings', () => ({ default: () => <div>Audit panel</div> }));
vi.mock('../../components/settings/IntegrationsSettings', () => ({ default: () => <div>Integrations panel</div> }));
vi.mock('../../components/settings/TeamSettings', () => ({ default: () => <div>Team panel</div> }));
vi.mock('../../components/settings/ClinicalOperationsSettings', () => ({ default: () => <div>Clinical operations panel</div> }));
vi.mock('../../components/settings/AiProviderSettings', () => ({ default: () => <div>AI providers panel</div> }));
vi.mock('../CenterSettings', () => ({ default: () => <div>Facility panel</div> }));

const renderSettings = () => render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Settings />
    </MemoryRouter>
);

describe('Settings workspace', () => {
    beforeEach(async () => {
        currentUser = { fullName: 'Alice Morgan', email: 'alice@VIARA.com', role: 'Developer', mustChangePassword: false };
        await i18n.changeLanguage('en');
    });

    it('shows governed developer sections and opens a searched result', () => {
        renderSettings();

        expect(screen.getByText('Settings & preferences')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /Clinical operations Machines and examination catalog/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button', { name: /Team Members and access roles/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('button', { name: /Integrations Connected clinical services/i }).length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'API credentials' } });
        expect(screen.queryByRole('button', { name: /Profile Identity and contact details/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: /Developer API credentials and webhooks/i })[0]);
        expect(screen.getByText('Developer panel')).toBeInTheDocument();
    });

    it('keeps account-owned sections outside the settings workspace', () => {
        currentUser = { fullName: 'Temporary User', role: 'Nurse', mustChangePassword: false };
        renderSettings();

        expect(screen.queryByRole('button', { name: /Profile Identity and contact details/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Security Password, 2FA, and sessions/i })).not.toBeInTheDocument();
    });

    it('supports responsive card navigation without a dropdown', () => {
        renderSettings();

        expect(screen.queryByRole('combobox', { name: 'Settings sections' })).not.toBeInTheDocument();
        const developerCards = screen.getAllByRole('button', { name: /Developer API credentials and webhooks/i });
        fireEvent.click(developerCards[developerCards.length - 1]);

        expect(screen.getAllByText('API credentials and webhooks').length).toBeGreaterThan(0);
        expect(screen.getByText('Developer panel')).toBeInTheDocument();
    });

    it('hides administrative sections that are not granted by explicit RBAC claims', () => {
        currentUser = {
            fullName: 'Scoped Administrator',
            role: 'Admin',
            permissions: ['MANAGE_SETTINGS'],
            mustChangePassword: false,
        };
        renderSettings();

        expect(screen.getAllByRole('button', { name: /Branch & printing Branch details, logos, report identity, and printing settings/i }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /Imaging \(PACS\) Modality connections, DICOMweb, and imaging archive controls/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Backups Database backups, restore readiness, and retention/i })).not.toBeInTheDocument();
    });
});
