import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CashierWorkspace from '../CashierWorkspace';

const mocks = vi.hoisted(() => ({
    user: { role: 'Cashier', name: 'Cashier Desk', permissions: ['PROCESS_PAYMENTS', 'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT'] },
    openShift: vi.fn(() => ({ unwrap: () => Promise.resolve({ shift_id: 'shift-1', status: 'Open' }) })),
    closeShift: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    reconciliation: vi.fn(() => ({ data: { data: [] }, isFetching: false }))
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => options?.defaultValue || key,
        i18n: { language: 'en', dir: () => 'ltr' }
    })
}));
vi.mock('react-redux', () => ({ useSelector: () => mocks.user }));
vi.mock('../../components/reception/BillingTab', () => ({ default: () => null }));
vi.mock('../../store/api', () => ({
    useGetCashierReconciliationQuery: (...args) => mocks.reconciliation(...args),
    useGetCurrentCashierShiftQuery: () => ({ data: null, isFetching: false }),
    useOpenCashierShiftMutation: () => [mocks.openShift, { isLoading: false }],
    useCloseCashierShiftMutation: () => [mocks.closeShift, { isLoading: false }],
    useReviewCashierClosureMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }]
}));

describe('CashierWorkspace shift controls', () => {
    beforeEach(() => {
        mocks.user = { role: 'Cashier', name: 'Cashier Desk', permissions: ['PROCESS_PAYMENTS', 'OPEN_CASHIER_SHIFT', 'CLOSE_CASHIER_SHIFT'] };
        mocks.openShift.mockClear();
        mocks.reconciliation.mockClear();
    });

    it('opens a personal cashier shift with the entered cash float', async () => {
        render(<MemoryRouter><CashierWorkspace /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'فتح وردية جديدة' }));
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '125.50' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }));

        await waitFor(() => expect(mocks.openShift).toHaveBeenCalledWith({ openingBalance: 125.5, notes: undefined }));
    });

    it('does not query or expose shift actions without payment permissions', () => {
        mocks.user = { role: 'Cashier', name: 'Restricted User', permissions: [] };
        render(<MemoryRouter><CashierWorkspace /></MemoryRouter>);

        expect(mocks.reconciliation).toHaveBeenCalledWith({ cashierId: null }, { skip: true });
        expect(screen.getByRole('button', { name: 'فتح وردية جديدة' })).toBeDisabled();
    });
});
