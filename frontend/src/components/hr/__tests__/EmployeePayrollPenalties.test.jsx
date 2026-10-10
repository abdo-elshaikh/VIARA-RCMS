import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeePayrollPenalties from '../EmployeePayrollPenalties';

const penalty = {
    penalty_id: 'penalty-1',
    penalty_type: 'Policy',
    amount: '125.00',
    currency_code: 'EGP',
    reason: 'Repeated late arrival',
    source: 'Policy',
    status: 'Approved',
    incident_date: '2026-09-28',
    acknowledgement_status: 'Pending',
};

const mocks = vi.hoisted(() => ({
    acknowledge: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    penalties: [],
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => options?.defaultValue || key,
        i18n: { language: 'en', dir: () => 'ltr' },
    }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../../store/api', () => ({
    useGetMyPayrollPenaltiesQuery: () => ({ data: mocks.penalties, isLoading: false, isError: false }),
    useAcknowledgePayrollPenaltyMutation: () => [mocks.acknowledge, { isLoading: false }],
}));

describe('EmployeePayrollPenalties', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.penalties = [{ ...penalty }];
    });

    it('lets the employee acknowledge their approved penalty', async () => {
        render(<EmployeePayrollPenalties />);

        fireEvent.click(screen.getByRole('button', { name: 'employee.acknowledge' }));

        await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith({
            id: 'penalty-1',
            status: 'Acknowledged',
        }));
    });

    it('submits a dispute only with the employee-provided reason', async () => {
        render(<EmployeePayrollPenalties />);

        fireEvent.click(screen.getByRole('button', { name: 'employee.dispute' }));
        fireEvent.change(await screen.findByRole('textbox', { name: /employee\.disputeReason/ }), {
            target: { value: 'I was on approved leave that day' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'employee.submitDispute' }));

        await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledWith({
            id: 'penalty-1',
            status: 'Disputed',
            reason: 'I was on approved leave that day',
        }));
    });
});