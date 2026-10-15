import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import GlobalSearch from '../GlobalSearch';
import { registerNavigationGuard } from '../../../utils/navigationGuard';

const state = vi.hoisted(() => ({ user: { role: 'Receptionist' } }));

vi.mock('react-redux', () => ({
    useSelector: () => state.user,
}));

vi.mock('../../../store/api', () => ({
    useGetPatientsQuery: () => ({
        data: {
            data: [{ patient_id: 'patient-1', first_name: 'Alice', last_name: 'Hassan', mrn: 'PAT-0001' }],
        },
        isFetching: false,
    }),
}));

describe('GlobalSearch', () => {
    beforeEach(() => {
        state.user = { role: 'Receptionist' };
        window.history.replaceState({}, '', '/dashboard');
    });

    it('opens from the keyboard and deep-links to the selected patient', async () => {
        render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GlobalSearch /></BrowserRouter>);
        const input = screen.getByRole('combobox');

        fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
        await waitFor(() => expect(input).toHaveFocus());

        fireEvent.change(input, { target: { value: 'PAT-0001' } });
        fireEvent.click(await screen.findByRole('option', { name: /Alice Hassan/i }));

        expect(window.location.pathname).toBe('/patients/patient-1');
    });

    it('hides destinations the session role allows but permissions do not', async () => {
        state.user = { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] };
        render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GlobalSearch /></BrowserRouter>);
        const input = screen.getByRole('combobox');

        fireEvent.change(input, { target: { value: 'Patients' } });

        await waitFor(() => expect(screen.queryByRole('option', { name: /Patients/i })).not.toBeInTheDocument());
    });

    it('shows destinations when the session holds the required permissions', async () => {
        state.user = { role: 'Receptionist', permissions: ['VIEW_PATIENTS', 'VIEW_APPOINTMENTS'] };
        render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GlobalSearch /></BrowserRouter>);
        const input = screen.getByRole('combobox');

        fireEvent.change(input, { target: { value: 'Patients' } });

        expect(await screen.findByRole('option', { name: /Patients/i })).toBeInTheDocument();
    });

    it('shows destinations for legacy role-only sessions', async () => {
        state.user = { role: 'Receptionist' };
        render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GlobalSearch /></BrowserRouter>);
        const input = screen.getByRole('combobox');

        fireEvent.change(input, { target: { value: 'Patients' } });

        expect(await screen.findByRole('option', { name: /Patients/i })).toBeInTheDocument();
    });

    it('searches permitted workspace sections and opens their exact URL', async () => {
        state.user = { role: 'Cashier', permissions: ['VIEW_INVOICES', 'CLOSE_CASHIER_SHIFT'] };
        render(<BrowserRouter><GlobalSearch /></BrowserRouter>);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Shift reconciliation' } });
        fireEvent.click(await screen.findByRole('option', { name: /Shift reconciliation/i }));
        expect(window.location.pathname + window.location.search).toBe('/reception?tab=reconciliation');
    });

    it('does not expose protected settings sections through search', () => {
        state.user = { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] };
        render(<BrowserRouter><GlobalSearch /></BrowserRouter>);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Roles' } });
        expect(screen.queryByRole('option', { name: /Role/i })).not.toBeInTheDocument();
    });

    it('preserves unsaved work when a section change is declined', async () => {
        state.user = { role: 'Cashier', permissions: ['VIEW_INVOICES', 'CLOSE_CASHIER_SHIFT'] };
        render(<BrowserRouter><GlobalSearch /></BrowserRouter>);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Shift reconciliation' } });
        const unregister = registerNavigationGuard(() => false);
        try {
            fireEvent.click(await screen.findByRole('option', { name: /Shift reconciliation/i }));
            expect(window.location.pathname).toBe('/dashboard');
        } finally { unregister(); }
    });
});
