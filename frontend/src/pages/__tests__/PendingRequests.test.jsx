import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PendingRequests from '../PendingRequests';

const mocks = vi.hoisted(() => ({ refunds: [], failed: false, leave: [], mutate: vi.fn(), refetch: vi.fn(), user: { role: 'Admin', user_id: 'reviewer' } }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { user: mocks.user } }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, options) => options?.defaultValue || key, i18n: { language: 'en' } }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../store/api', () => {
    const query = (data = []) => ({ data, isError: mocks.failed, refetch: mocks.refetch });
    const result = {};
    for (const name of ['useGetAttendancePermissionsQuery','useGetClaimsQuery','useGetCashierReconciliationQuery','useGetInsuranceApprovalsQuery','useGetPayrollDeductionsQuery','useGetPayrollPenaltiesQuery','useGetPayrollPeriodsQuery','useGetPayrollRulesQuery','useGetPartialPaymentExceptionsQuery','useGetPortalReviewRequestsQuery','useGetPrivacyRequestsQuery','useGetShiftRequestsQuery']) result[name] = () => query(name === 'useGetCashierReconciliationQuery' || name === 'useGetPortalReviewRequestsQuery' ? {} : []);
    result.useGetLeaveRequestsQuery = () => query(mocks.leave);
    result.useGetRefundsQuery = () => query(mocks.refunds);
    for (const name of ['useReviewCashierClosureMutation','useReviewPartialPaymentExceptionMutation','useReviewPortalAppointmentRequestMutation','useReviewPortalProfileUpdateRequestMutation','useResolvePrivacyRequestMutation','useReviewRefundMutation','useUpdateAttendancePermissionStatusMutation','useUpdateClaimStatusMutation','useUpdateInsuranceApprovalStatusMutation','useUpdateLeaveStatusMutation','useUpdatePayrollDeductionStatusMutation','useUpdatePayrollPenaltyStatusMutation','useUpdatePayrollRuleStatusMutation','useUpdatePayrollRunStatusMutation','useUpdateShiftRequestStatusMutation']) result[name] = () => [mocks.mutate, {}];
    return result;
});
const show = () => render(<MemoryRouter><PendingRequests /></MemoryRouter>);
describe('Approval inbox user recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.failed = false;
        mocks.refunds = [];
        mocks.leave = [];
        mocks.mutate.mockImplementation(() => ({ unwrap: () => Promise.reject({ data: { message: 'Synthetic failure' } }) }));
    });
    it('does not claim the inbox is empty when sources failed', () => {
        mocks.failed = true;
        show();
        expect(screen.queryByText('empty.title')).not.toBeInTheDocument();
        expect(screen.getAllByText('errors.partial').length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByRole('button', { name: 'actions.refresh' })[0]);
        expect(mocks.refetch).toHaveBeenCalled();
    });
    it('warns about potentially truncated sources before local filtering', () => {
        mocks.refunds = Array.from({ length: 100 }, (_, i) => ({ refund_id: `test-${i}`, status: 'Pending', requested_by: 'other', amount: 1 }));
        show();
        expect(screen.getByRole('status')).toHaveTextContent('100-record loading limit');
    });
    it('keeps the rejection dialog and entered reason after a failed decision', async () => {
        mocks.leave = [{ request_id: 'test-request', user_id: 'other', employee_name: 'Synthetic Employee', status: 'Pending', start_date: '2026-10-06', end_date: '2026-10-07' }];
        show();
        fireEvent.click(screen.getByRole('button', { name: 'actions.reject' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Synthetic reason for rejection' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'actions.reject' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
        expect(within(dialog).getByRole('textbox')).toHaveValue('Synthetic reason for rejection');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
