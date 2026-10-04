import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import Topbar from '../Topbar';

const dispatch = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
    auth: { user: { id: 'user-1', role: 'Admin', name: 'Admin User' } },
    preferences: { theme: 'light', showNotificationBadge: true, notificationSound: false },
}));
const attendanceState = vi.hoisted(() => ({ data: [] }));

vi.mock('react-redux', () => ({
    useDispatch: () => dispatch,
    useSelector: (selector) => selector(state),
}));

vi.mock('../../../store/api', () => ({
    useClockInMutation: () => [vi.fn(), { isLoading: false }],
    useClockOutMutation: () => [vi.fn(), { isLoading: false }],
    useBreakStartMutation: () => [vi.fn(), { isLoading: false }],
    useBreakEndMutation: () => [vi.fn(), { isLoading: false }],
    useGetAttendanceQuery: () => ({ data: attendanceState.data, isSuccess: true }),
    useGetMyNotificationsQuery: () => ({ data: { counts: { unread: 4 } } }),
    useGetBreakGlassStatusQuery: () => ({ data: undefined }),
    useCreateAttendancePermissionMutation: () => [vi.fn(), { isLoading: false }],
    useLogoutMutation: () => [vi.fn()],
    useUpdatePreferencesMutation: () => [vi.fn().mockReturnValue({ unwrap: () => Promise.resolve() }), { isLoading: false }],
}));

vi.mock('../../NotificationCenter', () => ({ default: ({ isOpen }) => <div data-testid="notification-center" data-open={isOpen} /> }));
vi.mock('../../auth/BreakGlassModal', () => ({ default: () => null }));
vi.mock('../../ui/LanguageToggle', () => ({ default: () => <button type="button">Language</button> }));
vi.mock('../../ui/KeyboardShortcutsHelp', () => ({
    default: ({ renderTrigger }) => renderTrigger({ open: vi.fn(), label: 'Shortcuts', title: 'Shortcuts' }),
}));
vi.mock('../GlobalSearch', () => ({ default: () => <div>Search</div> }));

describe('Topbar personalized color system', () => {
    beforeEach(() => {
        state.auth.user = { id: 'user-1', role: 'Admin', name: 'Admin User' };
        attendanceState.data = [];
        dispatch.mockClear();
    });

    it('uses semantic topbar classes for actions, active state, and profile surfaces', () => {
        const { container } = render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        expect(container.querySelector('.app-topbar')).toBeInTheDocument();
        expect(screen.getByRole('group', { name: /Display controls|إعدادات العرض/i })).toHaveClass('topbar-display-controls');
        const notifications = screen.getByRole('button', { name: /Notifications/i });
        expect(notifications).toHaveClass('topbar-action-idle');

        fireEvent.click(notifications);
        expect(notifications).toHaveClass('topbar-action-active');
        expect(screen.getByTestId('notification-center')).toHaveAttribute('data-open', 'true');

        const profile = screen.getByRole('button', { name: /Admin User/i });
        fireEvent.click(profile);
        expect(profile).toHaveClass('topbar-profile-trigger-active');
        expect(screen.getByRole('menu')).toHaveClass('topbar-profile-menu');
        expect(container.querySelector('.topbar-user-avatar')).toBeInTheDocument();
    });

    it.each(['Radiologist', 'Cashier', 'Accountant', 'Technician', 'Nurse', 'Insurance_Staff'])('shows the personal notification bell for %s', (role) => {
        state.auth.user.role = role;

        render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.getByRole('button', { name: /Notifications/i })).toBeInTheDocument();
    });

    it.each(['Radiologist', 'Technician', 'Nurse'])('shows emergency access for eligible %s users', (role) => {
        state.auth.user = { id: 'user-1', role, name: `${role} User` };

        render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.getByRole('button', { name: /Emergency access|وصول طارئ/i })).toBeInTheDocument();
    });

    it.each(['Admin', 'Developer', 'Receptionist', 'Cashier'])('hides emergency access from ineligible %s users', (role) => {
        state.auth.user = { id: 'user-1', role, name: `${role} User` };

        render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.queryByRole('button', { name: /Emergency access|وصول طارئ/i })).not.toBeInTheDocument();
    });

    it('marks an active emergency grant clearly in the topbar', () => {
        state.auth.user = {
            id: 'user-1',
            role: 'Technician',
            name: 'Technician User',
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['VIEW_EXAMS'],
            breakGlassExpiry: Date.now() + 60_000,
        };

        render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.getByRole('button', { name: /Emergency access active|الوصول الحرج مفعل/i }))
            .toHaveAttribute('aria-pressed', 'true');
    });

    it('opens quick preferences popover and triggers theme, density, and sound toggles', () => {
        render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        const prefsButton = screen.getByRole('button', { name: /Quick preferences|تفضيلات العرض السريعة/i });
        expect(prefsButton).toBeInTheDocument();
        fireEvent.click(prefsButton);

        const dialog = screen.getByRole('dialog', { name: /Quick preferences|تفضيلات العرض السريعة/i });
        expect(dialog).toBeInTheDocument();

        // Check theme buttons
        const darkThemeBtn = screen.getByRole('button', { name: /Dark|داكن/i });
        fireEvent.click(darkThemeBtn);
        expect(dispatch).toHaveBeenCalled();

        // Check density buttons
        const compactDensityBtn = screen.getByRole('button', { name: /Compact|مضغوط/i });
        fireEvent.click(compactDensityBtn);
        expect(dispatch).toHaveBeenCalled();

        // Close on Escape
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: /Quick preferences|تفضيلات العرض السريعة/i })).not.toBeInTheDocument();
    });

    it('detects a session older than 24 hours as stale instead of hiding it from topbar', () => {
        attendanceState.data = [{
            clock_in: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
            clock_out: null,
        }];

        render(
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Topbar onMobileMenuClick={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.getByRole('button', { name: /معلقة >24س|جلسة حضور معلقة/i })).toBeInTheDocument();
    });
});
