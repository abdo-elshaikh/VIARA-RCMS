/* eslint-disable no-undef */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '../../i18n';
import Landing from '../Landing';

vi.mock('../../store/api', () => ({
    useGetPublicCenterSettingsQuery: () => ({ data: {}, isLoading: false }),
    useGetPublicLandingOverviewQuery: () => ({
        data: {
            generatedAt: new Date().toISOString(),
            metrics: {
                studiesToday: 148,
                pendingReports: 27,
                activeModalities: 8,
                completionRate: 96,
            },
            services: {
                waitingToday: 5,
                pendingReports: 27,
                activeModalities: 8,
                openClaims: 12,
                studiesThisWeek: 421,
                deliveredToday: 34,
            },
            workflow: {
                registrationMinutes: 2,
                imagingMinutes: 12,
                reportingMinutes: 5,
                deliveryMinutes: 1,
            },
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
    }),
}));

const renderLanding = () => render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Landing />
    </BrowserRouter>,
);

describe('Prototype-aligned landing page', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
        await act(() => i18n.changeLanguage('en'));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.documentElement.classList.remove('dark');
    });

    it('renders the command-center hierarchy and all operational metrics', () => {
        renderLanding();

        expect(screen.getByRole('link', { name: 'TIBA SCAN CENTER' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Operate the entire radiology center from one command system/i })).toBeInTheDocument();
        expect(screen.getByText('148')).toBeInTheDocument();
        expect(screen.getByText('27')).toBeInTheDocument();
        expect(screen.getByText('8')).toBeInTheDocument();
        expect(screen.getByText('96%')).toBeInTheDocument();
        expect(screen.getByText('Results delivery and patient portals')).toBeInTheDocument();
        expect(screen.getByText('Backend data connected')).toBeInTheDocument();
        expect(screen.getByText('5 waiting today')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reception and scheduling/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Management analytics/ })).toBeInTheDocument();
    });

    it('filters modules by category and search without changing service data', () => {
        renderLanding();

        fireEvent.click(screen.getByRole('button', { name: 'PACS and clinical' }));
        expect(screen.getByRole('button', { name: /PACS worklists/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reporting workspace/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Billing and revenue/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Live activity' }));
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search services' }), { target: { value: 'configuration' } });
        expect(screen.getByRole('button', { name: /Center configuration/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Reception and scheduling/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(screen.getByRole('searchbox', { name: 'Search services' })).toHaveValue('');
        expect(screen.getByRole('button', { name: /Reception and scheduling/ })).toBeInTheDocument();
    });

    it('opens service details and closes the dialog with Escape', () => {
        renderLanding();

        const trigger = screen.getByRole('button', { name: /Reception and scheduling/ });
        trigger.focus();
        fireEvent.click(trigger);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).getByText('5 waiting today')).toBeInTheDocument();
        expect(within(screen.getByRole('dialog')).queryByText(/simulation/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close modal' })).toHaveFocus();
        expect(document.body.style.overflow).toBe('hidden');
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(document.body.style.overflow).toBe('');
    });

    it('supports dark mode and preserves the preference', () => {
        renderLanding();

        fireEvent.click(screen.getByRole('button', { name: /dark mode/i }));
        expect(document.documentElement).toHaveClass('dark');
        expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('mirrors document and command layout direction when language changes', async () => {
        renderLanding();

        expect(document.documentElement).toHaveAttribute('dir', 'ltr');
        expect(document.querySelector('.command-layout')).toHaveAttribute('dir', 'ltr');
        expect(screen.getByText('Radiology command system')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Switch to Arabic' }));
        });

        expect(document.documentElement).toHaveAttribute('dir', 'rtl');
        expect(document.querySelector('.command-layout')).toHaveAttribute('dir', 'rtl');
        expect(screen.getByText('نظام قيادة مراكز الأشعة')).toBeInTheDocument();
    });

    it('exposes accessible mobile tabs and switches the active panel', () => {
        renderLanding();

        const overviewTab = screen.getByRole('tab', { name: 'Overview' });
        const modulesTab = screen.getByRole('tab', { name: 'Command center' });
        expect(overviewTab).toHaveAttribute('aria-selected', 'true');
        expect(modulesTab).toHaveAttribute('aria-selected', 'false');

        fireEvent.click(modulesTab);
        expect(modulesTab).toHaveAttribute('aria-selected', 'true');
        expect(overviewTab).toHaveAttribute('aria-selected', 'false');
        expect(document.querySelector('.command-operations')).toHaveAttribute('data-mobile-zone', 'modules');
        expect(document.querySelector('.command-hero-column')).toHaveAttribute('data-mobile-active', 'false');

        fireEvent.keyDown(modulesTab, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Workflows' })).toHaveAttribute('aria-selected', 'true');
    });

    it('traps mobile navigation focus and closes with Escape', () => {
        renderLanding();

        const trigger = screen.getByRole('button', { name: /open navigation/i });
        fireEvent.click(trigger);
        const menu = document.getElementById('command-mobile-menu');
        expect(menu).toBeInTheDocument();
        expect(within(menu).getAllByRole('button')[0]).toHaveFocus();
        expect(document.body.style.overflow).toBe('hidden');

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(menu).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(document.body.style.overflow).toBe('');
    });
});
