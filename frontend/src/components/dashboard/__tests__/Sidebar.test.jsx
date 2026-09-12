import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import Sidebar from '../Sidebar';
import { registerNavigationGuard } from '../../../utils/navigationGuard';

const state = vi.hoisted(() => ({
    user: { role: 'Receptionist', name: 'Sara', permissions: ['VIEW_PATIENTS', 'VIEW_APPOINTMENTS'] },
}));

vi.mock('react-redux', () => ({
    useDispatch: () => vi.fn(),
    useSelector: () => state.user,
}));

vi.mock('../../../store/api', () => ({
    api: { endpoints: { logout: { initiate: vi.fn() } } },
    useGetCenterSettingsQuery: () => ({
        data: { center_name: 'VIARA Center', branch_name: 'Main Branch' },
    }),
}));

const renderSidebar = (props = {}, initialPath = '/dashboard') => render(
    <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar
            role="Receptionist"
            isCollapsed={false}
            toggleCollapse={vi.fn()}
            onCloseMobile={vi.fn()}
            {...props}
        />
    </MemoryRouter>
);

describe('Sidebar permission-aware navigation', () => {
    beforeEach(() => {
        localStorage.clear();
        state.user = { role: 'Receptionist', name: 'Sara', permissions: ['VIEW_PATIENTS', 'VIEW_APPOINTMENTS'] };
    });

    it('renders only destinations allowed by both role and permission claims', () => {
        renderSidebar();

        expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Patients' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Appointments' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Inbox & Chat' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Financials' })).not.toBeInTheDocument();
        expect(screen.getByText('Your workspace')).toBeInTheDocument();
    });

    it('includes destinations unlocked by elevated permissions', () => {
        state.user = {
            ...state.user,
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['MANAGE_CHAT'],
            breakGlassExpiry: Date.now() + 60_000,
        };
        renderSidebar();

        expect(screen.getByRole('link', { name: 'Inbox & Chat' })).toBeInTheDocument();
    });

    it('keeps sign out available in collapsed mode', () => {
        renderSidebar({ isCollapsed: true });

        expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('title', 'Dashboard');
    });

    it('opens the active group, allows collapsing it, and marks only the exact section current', () => {
        renderSidebar({}, '/reception?tab=patients');
        const disclosure = screen.getByRole('button', { name: 'Expand or collapse Reception sections' });
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        const submenu = screen.getByRole('list', { name: 'Reception' });
        expect(within(submenu).getByRole('link', { name: 'Patient directory' })).toHaveAttribute('aria-current', 'page');
        expect(within(submenu).getByRole('link', { name: 'Schedule & operations' })).not.toHaveAttribute('aria-current');
        expect(within(submenu).queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument();
        fireEvent.click(disclosure);
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('list', { name: 'Reception' })).not.toBeInTheDocument();
        fireEvent.click(disclosure);
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    });

    it('consults the unsaved-work guard before switching sections', () => {
        const onCloseMobile = vi.fn();
        renderSidebar({ onCloseMobile }, '/reception?tab=schedule');
        const guard = vi.fn(() => false);
        const unregister = registerNavigationGuard(guard);
        try {
            fireEvent.click(screen.getByRole('link', { name: 'Patient directory' }));
            expect(guard).toHaveBeenCalledOnce();
            expect(onCloseMobile).not.toHaveBeenCalled();
            expect(screen.getByRole('link', { name: 'Schedule & operations' })).toHaveAttribute('aria-current', 'page');
        } finally { unregister(); }
    });

    it('expands a collapsed sidebar when entering a workspace', () => {
        const toggleCollapse = vi.fn();
        renderSidebar({ isCollapsed: true, toggleCollapse });
        fireEvent.click(screen.getByRole('link', { name: 'Reception' }));
        expect(toggleCollapse).toHaveBeenCalledOnce();
    });

    it('tolerates malformed saved disclosure state', () => {
        localStorage.setItem('sidebar-expanded-groups', 'null');
        renderSidebar({}, '/reception?tab=schedule');
        expect(screen.getByRole('button', { name: 'Expand or collapse Reception sections' })).toHaveAttribute('aria-expanded', 'true');
    });
});
