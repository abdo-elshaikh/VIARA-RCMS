import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Financials from '../Financials';

const mocks = vi.hoisted(() => ({
    pl: { gross_revenue: 1000, net_profit: 200, total_expenses: 800, commission_expense: 100 },
    aging: { total_outstanding: 500, '90_plus': 100, '0_30': 300, '31_60': 100, '61_90': 50 },
    cashier: { summary: { varianceAmount: 50, openShifts: 1 }, data: [] },
    commissions: [{ commission_pending: 150 }],
    closures: [{ open_shifts: 0, unresolved_variances: 1, pending_refunds: 0 }],
    discount: { summary: { flagged_invoices: 2, total_discount: 75 }, items: [] },
    trialBalance: { is_balanced: true, difference: 0 },
    expenses: [],
    expenseCategories: [],
    suppliers: [],
    tax: { tax_collected: 100, tax_paid: 80, net_tax_liability: 20 },
    plSeries: [],
    cashFlowSeries: [],
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => options?.defaultValue || key,
        i18n: { language: 'en', dir: () => 'ltr' }
    })
}));

vi.mock('../../store/api', () => ({
    useGetProfitAndLossQuery: () => ({ data: mocks.pl, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetReceivablesAgingQuery: () => ({ data: mocks.aging, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetCashierReconciliationQuery: () => ({ data: mocks.cashier, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetDoctorCommissionsQuery: () => ({ data: mocks.commissions, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetFinancialClosuresQuery: () => ({ data: mocks.closures, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetDiscountReportQuery: () => ({ data: mocks.discount, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetTrialBalanceQuery: () => ({ data: mocks.trialBalance, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetExpensesQuery: () => ({ data: mocks.expenses, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetExpenseCategoriesQuery: () => ({ data: mocks.expenseCategories, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetSuppliersQuery: () => ({ data: mocks.suppliers, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetTaxSummaryQuery: () => ({ data: mocks.tax, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetProfitAndLossSeriesQuery: () => ({ data: mocks.plSeries, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetCashFlowSeriesQuery: () => ({ data: mocks.cashFlowSeries, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useCreateExpenseMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
    useDeleteExpenseMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
    useCreateFinancialClosureMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
    useFinalizeFinancialClosureMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
    usePayCommissionMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
    useReviewCashierClosureMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
}));

const renderWithRouter = (ui, { route = '/financials' } = {}) => {
    return render(
        <MemoryRouter
            initialEntries={[route]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
            <Routes>
                <Route path="*" element={ui} />
            </Routes>
        </MemoryRouter>
    );
};

describe('Financials grouped navigation and action queue', () => {
    beforeEach(() => {
        mocks.pl = { gross_revenue: 1000, net_profit: 200, total_expenses: 800, commission_expense: 100 };
        mocks.aging = { total_outstanding: 500, '90_plus': 100, '0_30': 300, '31_60': 100, '61_90': 50 };
        mocks.cashier = { summary: { varianceAmount: 50, openShifts: 1 }, data: [] };
        mocks.commissions = [{ commission_pending: 150 }];
        mocks.closures = [{ open_shifts: 0, unresolved_variances: 1, pending_refunds: 0 }];
        mocks.discount = { summary: { flagged_invoices: 2, total_discount: 75 }, items: [] };
        mocks.trialBalance = { is_balanced: true, difference: 0 };
        mocks.expenses = [];
        mocks.expenseCategories = [];
        mocks.suppliers = [];
        mocks.tax = { tax_collected: 100, tax_paid: 80, net_tax_liability: 20 };
        mocks.plSeries = [];
        mocks.cashFlowSeries = [];
    });

    it('renders grouped financial navigation sections', async () => {
        renderWithRouter(<Financials />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Advanced Reports' })).toBeInTheDocument());
        expect(screen.getByText('Operational Performance')).toBeInTheDocument();
        expect(screen.getByText('Expense Control')).toBeInTheDocument();
        expect(screen.getByText('Liabilities')).toBeInTheDocument();
        expect(screen.getByText('Governance')).toBeInTheDocument();
        expect(screen.getByText('Collections')).toBeInTheDocument();
        expect(screen.getByText('Cash Desk')).toBeInTheDocument();
        expect(screen.getByText('Accounting Ledger')).toBeInTheDocument();
        expect(screen.getByText('Period End')).toBeInTheDocument();
    });

    it('switches active tab when a grouped nav button is clicked', async () => {
        renderWithRouter(<Financials />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Advanced Reports' })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Expense Manager/ }));
        await waitFor(() => expect(screen.getByRole('button', { name: /Expense Manager/ })).toHaveAttribute('aria-current', 'page'));
    });

    it('shows action queue items when financial alerts exist', async () => {
        renderWithRouter(<Financials />);
        await waitFor(() => expect(screen.getByText(/Action queue/)).toBeInTheDocument());
        expect(screen.getByText('Discount exceptions need review')).toBeInTheDocument();
        expect(screen.getByText('Cash variance needs reconciliation')).toBeInTheDocument();
        expect(screen.getByText('Commissions ready for payment')).toBeInTheDocument();
        expect(screen.getByText('Period closure blockers')).toBeInTheDocument();
    });

    it('navigates to the correct tab when an action queue item is clicked', async () => {
        renderWithRouter(<Financials />);
        await waitFor(() => expect(screen.getByText(/Action queue/)).toBeInTheDocument());
        fireEvent.click(screen.getByText('Discount exceptions need review'));
        await waitFor(() => expect(screen.getByRole('button', { name: /Discount Reports/ })).toHaveAttribute('aria-current', 'page'));
    });
});
