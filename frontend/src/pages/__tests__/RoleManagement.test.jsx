import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RoleManagement from '../RoleManagement';

const renderPage = () => render(
    <MemoryRouter>
        <RoleManagement />
    </MemoryRouter>
);

vi.mock('react-redux', () => ({ useSelector: () => ({ role: 'Admin' }) }));

const updatePermissions = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const resetPermissions = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const clonePermissions = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const permissions = [
    { permission_id: 'p1', name: 'VIEW_PATIENTS', module: 'Patients', description: 'View patients' },
    { permission_id: 'p2', name: 'EDIT_PATIENTS', module: 'Patients', description: 'Edit patients' },
    { permission_id: 'p3', name: 'MANAGE_SECRET_SETTINGS', module: 'Developer', description: 'Manage secret settings' }
];
const rolePermissions = { Admin: ['p1', 'p2', 'p3'], Radiologist: ['p1'], Receptionist: ['p1', 'p2'] };

vi.mock('../../store/api', () => ({
    useGetAllPermissionsQuery: () => ({
        data: permissions,
        isLoading: false,
        isError: false,
        refetch: vi.fn()
    }),
    useGetRolePermissionsQuery: () => ({
        data: rolePermissions,
        isLoading: false,
        isError: false,
        refetch: vi.fn()
    }),
    useUpdateRolePermissionsMutation: () => [updatePermissions, { isLoading: false }],
    useResetRolePermissionsMutation: () => [resetPermissions, { isLoading: false }],
    useCloneRolePermissionsMutation: () => [clonePermissions, { isLoading: false }],
    useLazyGetRbacAuditLogsQuery: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({ logs: [], hasMore: false, nextCursor: null }) }))],
    useGetActiveBreakGlassGrantsQuery: () => ({ data: [], refetch: vi.fn() }),
    useAdminRevokeBreakGlassMutation: () => [vi.fn(), { isLoading: false }]
}));

describe('RoleManagement', () => {
    beforeEach(() => {
        updatePermissions.mockClear();
        resetPermissions.mockClear();
        clonePermissions.mockClear();
    });

    it('keeps Administrator grants immutable', () => {
        renderPage();

        // Modules are collapsed by default — expand the Patients module first.
        fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));

        fireEvent.click(screen.getByRole('tab', { name: /Administrator/i }));
        const adminSwitches = screen.getAllByRole('switch', { name: /Administrator/i });
        expect(adminSwitches.length).toBeGreaterThan(0);
        adminSwitches.forEach(control => expect(control).toBeDisabled());
    });

    it('clears dirty state when a permission is returned to its saved value', () => {
        renderPage();

        // Modules are collapsed by default — expand the Patients module first.
        fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));

        const switches = screen.getAllByRole('switch', { name: /View Patients.*Radiologist/i });

        fireEvent.click(switches[0]);
        expect(screen.getByText(/1 pending changes/i)).toBeInTheDocument();

        fireEvent.click(switches[0]);
        expect(screen.queryByText(/1 pending changes/i)).not.toBeInTheDocument();
    });

    it('supports filtered bulk grants while preserving review-before-save', () => {
        renderPage();

        fireEvent.change(screen.getByLabelText('Search permissions'), { target: { value: 'Edit Patients' } });
        fireEvent.click(screen.getByRole('button', { name: /^Grant Visible \(1\)$/ }));

        expect(screen.getByText(/1 pending changes/i)).toBeInTheDocument();
        expect(screen.getByText('+1')).toBeInTheDocument();
        expect(updatePermissions).not.toHaveBeenCalled();
    });

    it('prevents assigning Developer-only permissions to operational roles', () => {
        renderPage();

        fireEvent.change(screen.getByLabelText('Search permissions'), { target: { value: 'Manage Secret Settings' } });

        const restrictedSwitch = screen.getByRole('switch', { name: /reserved for the Developer role/i });
        expect(restrictedSwitch).toBeDisabled();
        expect(screen.getByText('Developer only')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Grant Visible \(0\)$/ })).toBeDisabled();
    });

    it('supports keyboard navigation between role tabs', () => {
        renderPage();

        const radiologistTab = screen.getByRole('tab', { name: /Radiologist/i });
        const receptionistTab = screen.getByRole('tab', { name: /Receptionist/i });
        expect(radiologistTab).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(radiologistTab, { key: 'ArrowRight' });

        expect(receptionistTab).toHaveAttribute('aria-selected', 'true');
        expect(receptionistTab).toHaveAttribute('tabindex', '0');
    });
});
