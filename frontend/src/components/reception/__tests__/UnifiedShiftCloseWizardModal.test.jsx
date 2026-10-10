import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UnifiedShiftCloseWizardModal from '../UnifiedShiftCloseWizardModal';

const mocks = vi.hoisted(() => ({
    closeCashier: vi.fn(),
    closeReception: vi.fn(),
    createHandover: vi.fn(),
    clockOut: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    labels: {
        'shiftClose.next': 'Next',
        'shiftClose.back': 'Back',
        'shiftClose.cancel': 'Cancel',
        'shiftClose.confirmClose': 'Confirm & Close Shift',
        'shiftClose.variancePlaceholder': 'Variance reason'
    }
}));

vi.mock('../../../store/api', () => ({
    useCloseCashierShiftMutation: () => [mocks.closeCashier, { isLoading: false }],
    useCloseReceptionShiftMutation: () => [mocks.closeReception, { isLoading: false }],
    useCreateShiftHandoverMutation: () => [mocks.createHandover, { isLoading: false }],
    useClockOutMutation: () => [mocks.clockOut, { isLoading: false }]
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, fallback) => fallback || mocks.labels[key] || key })
}));

vi.mock('react-hot-toast', () => ({
    default: { error: mocks.toastError, success: mocks.toastSuccess }
}));

const renderWizard = () => render(
    <UnifiedShiftCloseWizardModal
        isOpen
        onClose={vi.fn()}
        currentReceptionShift={{ session_id: 'reception-1' }}
        currentCashierShift={{ shift_id: 'cashier-1', status: 'Open', opening_balance: 100, payment_totals: { Cash: 25 } }}
        isRtl={false}
    />
);

describe('UnifiedShiftCloseWizardModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.closeCashier.mockReturnValue({ unwrap: () => Promise.resolve({}) });
        mocks.closeReception.mockReturnValue({ unwrap: () => Promise.resolve({ session_id: 'reception-1' }) });
        mocks.createHandover.mockReturnValue({ unwrap: () => Promise.resolve({}) });
        mocks.clockOut.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    });

    it('sends the counted cash using the cashier API contract before closing reception', async () => {
        renderWizard();
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '125' } });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm & Close Shift' }));

        await waitFor(() => expect(mocks.closeCashier).toHaveBeenCalledWith(expect.objectContaining({
            id: 'cashier-1', countedCash: 125
        })));
        expect(mocks.closeCashier.mock.calls[0][0]).not.toHaveProperty('actualCash');
        await waitFor(() => expect(mocks.closeReception).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 'reception-1'
        })));
    });

    it('does not advance with an invalid cash amount', () => {
        renderWizard();
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        expect(mocks.toastError).toHaveBeenCalled();
        expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
        expect(mocks.closeCashier).not.toHaveBeenCalled();
    });

    it('clears cash count and handover notes when a new reception session starts', () => {
        const { rerender } = renderWizard();
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '125' } });
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByPlaceholderText('shiftClose.handoverPlaceholder'), { target: { value: 'Old shift note' } });

        rerender(
            <UnifiedShiftCloseWizardModal
                isOpen
                onClose={vi.fn()}
                currentReceptionShift={{ session_id: 'reception-2' }}
                currentCashierShift={{ shift_id: 'cashier-2', status: 'Open', opening_balance: 50, payment_totals: { Cash: 10 } }}
                isRtl={false}
            />
        );

        expect(screen.getByPlaceholderText('0.00')).toHaveValue(null);
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '60' } });
        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByPlaceholderText('shiftClose.handoverPlaceholder')).toHaveValue('');
    });
});
