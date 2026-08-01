import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoleManagement from '../RoleManagement';

vi.mock('react-redux', () => ({ useSelector: () => ({ role: 'Admin' }) }));

const updatePermissions = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const resetPermissions = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const clonePermissions = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const permissions = [
    { permission_id: 'p1', name: 'VIEW_PATIENTS', module: 'Patients', description: 'View patients' },
    { permission_id: 'p2', name: 'EDIT_PATIENTS', module: 'Patients', description: 'Edit patients' }
];
const rolePermissions = { Admin: ['p1', 'p2'], Radiologist: ['p1'], Receptionist: ['p1', 'p2'] };

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
    useGetRbacAuditLogsQuery: () => ({ data: [], refetch: vi.fn() })
}));

describe('RoleManagement', () => {
    beforeEach(() => {
        updatePermissions.mockClear();
        resetPermissions.mockClear();
        clonePermissions.mockClear();
    });

    it('keeps Administrator grants immutable', () => {
        render(<RoleManagement />);

        fireEvent.click(screen.getByRole('tab', { name: /Administrator/i }));
        const adminSwitches = screen.getAllByRole('switch', { name: /Administrator/i });
        expect(adminSwitches.length).toBeGreaterThan(0);
        adminSwitches.forEach(control => expect(control).toBeDisabled());
    });

    it('clears dirty state when a permission is returned to its saved value', () => {
        render(<RoleManagement />);
        const switches = screen.getAllByRole('switch', { name: /View Patients.*Radiologist/i });

        fireEvent.click(switches[0]);
        expect(screen.getByText('Unsaved permission changes')).toBeInTheDocument();

        fireEvent.click(switches[0]);
        expect(screen.queryByText('Unsaved permission changes')).not.toBeInTheDocument();
    });

    it('supports filtered bulk grants while preserving review-before-save', () => {
        render(<RoleManagement />);

        fireEvent.change(screen.getByLabelText('Search permissions'), { target: { value: 'Edit Patients' } });
        fireEvent.click(screen.getByRole('button', { name: 'Grant visible (1)' }));

        expect(screen.getByText('Unsaved permission changes')).toBeInTheDocument();
        expect(screen.getByText('+1')).toBeInTheDocument();
        expect(updatePermissions).not.toHaveBeenCalled();
    });
});
