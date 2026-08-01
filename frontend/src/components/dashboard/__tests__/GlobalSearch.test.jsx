import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import GlobalSearch from '../GlobalSearch';

vi.mock('react-redux', () => ({
    useSelector: () => ({ role: 'Receptionist' }),
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
    beforeEach(() => window.history.replaceState({}, '', '/dashboard'));

    it('opens from the keyboard and deep-links to the selected patient', async () => {
        render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GlobalSearch /></BrowserRouter>);
        const input = screen.getByRole('combobox');

        fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
        await waitFor(() => expect(input).toHaveFocus());

        fireEvent.change(input, { target: { value: 'PAT-0001' } });
        fireEvent.click(await screen.findByRole('option', { name: /Alice Hassan/i }));

        expect(window.location.pathname).toBe('/patients/patient-1');
    });
});
