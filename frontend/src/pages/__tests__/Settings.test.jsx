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
    <MemoryRouter>
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
        expect(screen.getByRole('button', { name: /Clinical operations Machines and examination catalog/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Team Members and access roles/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Integrations Connected clinical services/i })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'API credentials' } });
        expect(screen.queryByRole('button', { name: /Profile Identity and contact details/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Developer API credentials and webhooks/i }));
        expect(screen.getByText('Developer panel')).toBeInTheDocument();
    });

    it('keeps account-owned sections outside the settings workspace', () => {
        currentUser = { fullName: 'Temporary User', role: 'Nurse', mustChangePassword: false };
        renderSettings();

        expect(screen.queryByRole('button', { name: /Profile Identity and contact details/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Security Password, 2FA, and sessions/i })).not.toBeInTheDocument();
    });
});
