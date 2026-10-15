import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import CommissionManager from '../CommissionManager';
const mocks = vi.hoisted(() => ({ pay: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key, i18n: { language: 'en', dir: () => 'ltr' } }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../store/api', () => ({
    useGetDoctorCommissionsQuery: () => ({ data: [{ doctor_id: 'doctor-1', doctor_name: 'Synthetic Doctor', commission_pending: 100 }], isLoading: false, isError: false }),
    usePayCommissionMutation: () => [mocks.pay, { isLoading: false }]
}));
it('retains the payout dialog on failure and reuses the same operation when retrying', async () => {
    mocks.pay.mockReturnValueOnce({ unwrap: () => Promise.reject({ data: { message: 'Synthetic outage' } }) }).mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    render(<CommissionManager />);
    fireEvent.click(screen.getAllByRole('button', { name: 'finance.commissions.payAction' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'finance.commissions.confirm' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'finance.commissions.confirm' })).not.toBeDisabled());
    fireEvent.click(within(dialog).getByRole('button', { name: 'finance.commissions.confirm' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledTimes(2));
    expect(mocks.pay.mock.calls[1][0]).toEqual(mocks.pay.mock.calls[0][0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
