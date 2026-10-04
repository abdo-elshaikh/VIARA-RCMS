import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    plQueryArgs: [],
    discountQueryArgs: [],
    trialBalanceQueryArgs: [],
    ledgerQueryArgs: [],
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
    useGetProfitAndLossQuery: (args) => {
        mocks.plQueryArgs.push(args);
        return { data: mocks.pl, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() };
    },
    useGetReceivablesAgingQuery: () => ({ data: mocks.aging, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetCashierReconciliationQuery: () => ({ data: mocks.cashier, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetDoctorCommissionsQuery: () => ({ data: mocks.commissions, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetFinancialClosuresQuery: () => ({ data: mocks.closures, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetDiscountReportQuery: (args) => {
        mocks.discountQueryArgs.push(args);
        return { data: mocks.discount, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() };
    },
    useGetTrialBalanceQuery: (args) => {
        mocks.trialBalanceQueryArgs.push(args);
        return { data: mocks.trialBalance, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() };
    },
    useGetJournalLedgerQuery: (args) => {
        mocks.ledgerQueryArgs.push(args);
        return { data: { rows: [] }, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() };
    },
    useGetExpensesQuery: () => ({ data: mocks.expenses, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetExpenseCategoriesQuery: () => ({ data: mocks.expenseCategories, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetSuppliersQuery: () => ({ data: mocks.suppliers, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetTaxSummaryQuery: () => ({ data: mocks.tax, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetProfitAndLossSeriesQuery: () => ({ data: mocks.plSeries, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useGetCashFlowSeriesQuery: () => ({ data: mocks.cashFlowSeries, isFetching: false, isLoading: false, isError: false, refetch: vi.fn() }),
    useCreateExpenseMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
    useUpdateExpenseMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve({}) })), { isLoading: false }],
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
        mocks.plQueryArgs = [];
        mocks.discountQueryArgs = [];
        mocks.trialBalanceQueryArgs = [];
        mocks.ledgerQueryArgs = [];
        mocks.expenses = [];
        mocks.expenseCategories = [];
        mocks.suppliers = [];
        mocks.tax = { tax_collected: 100, tax_paid: 80, net_tax_liability: 20 };
        mocks.plSeries = [];
        mocks.cashFlowSeries = [];
    });

    // Translation keys are namespaced: nav tabs render as `finance.tabs.<id>`,
    // category filters as `finance.common.categories.<key>`, and the action
    // queue as `finance.common.hub.<key>`. The i18n mock returns the key when
    // no defaultValue is supplied, so the key doubles as the accessible name.
    const CATEGORY_KEYS = [
        'analytics', 'performance', 'expenseControl', 'liability', 'governance',
        'collections', 'cashDesk', 'accountingLedger', 'periodEnd'
    ];

    // Tab buttons carry a badge alongside the label (e.g. a count or an
    // amount), so match the key as a prefix of the accessible name rather than
    // the whole string.
    const tabButton = (id) => screen.getByRole('button', { name: new RegExp(`finance\\.tabs\\.${id}\\b`) });
    const actionQueue = () => screen.getByRole('region', { name: 'Action queue' });

    it('renders grouped financial navigation sections', async () => {
        renderWithRouter(<Financials />);

        await waitFor(() => expect(tabButton('reports')).toBeInTheDocument());

        const categories = screen.getByRole('group', { name: 'Filter financial sections by category' });
        for (const key of CATEGORY_KEYS) {
            expect(within(categories).getByRole('button', { name: `finance.common.categories.${key}` }))
                .toBeInTheDocument();
        }
    });

    it('switches active tab when a grouped nav button is clicked', async () => {
        renderWithRouter(<Financials />);

        await waitFor(() => expect(tabButton('reports')).toBeInTheDocument());
        fireEvent.click(tabButton('expenses'));
        await waitFor(() => expect(tabButton('expenses')).toHaveAttribute('aria-current', 'page'));
        expect(tabButton('reports')).not.toHaveAttribute('aria-current', 'page');
    });

    it('opens the report builder from the header action', async () => {
        renderWithRouter(<Financials />, { route: '/financials?tab=pl' });

        fireEvent.click(await screen.findByRole('button', { name: 'Open report builder' }));

        await waitFor(() => expect(tabButton('reports')).toHaveAttribute('aria-current', 'page'));
    });

    it.each([
        { tab: 'reports', label: 'finance.pl.startDate', queryArgs: 'plQueryArgs' },
        { tab: 'pl', label: 'finance.pl.startDate', queryArgs: 'plQueryArgs' },
        { tab: 'discounts', label: 'Start date', queryArgs: 'discountQueryArgs' },
        { tab: 'ledger', label: 'Start date', queryArgs: 'ledgerQueryArgs' },
    ])('applies the $tab tab date selection to the shared financial query range', async ({ tab, label, queryArgs }) => {
        renderWithRouter(<Financials />, { route: `/financials?tab=${tab}` });

        fireEvent.change(await screen.findByLabelText(label), { target: { value: '2026-09-01' } });

        await waitFor(() => {
            expect(mocks[queryArgs].at(-1).startDate).toBe('2026-09-01');
        });
    });

    it('shows action queue items when financial alerts exist', async () => {
        renderWithRouter(<Financials />);

        const queue = within(await screen.findByRole('region', { name: 'Action queue' }));
        expect(queue.getByText('finance.common.hub.discountExceptionsNeedReview')).toBeInTheDocument();
        expect(queue.getByText('finance.common.hub.cashVarianceNeedsReconciliation')).toBeInTheDocument();
        expect(queue.getByText('finance.common.hub.commissionsReadyForPayment')).toBeInTheDocument();
        expect(queue.getByText('finance.common.hub.periodClosureBlockers')).toBeInTheDocument();
        expect(queue.getByText('finance.common.hub.overdueReceivablesNeedFollowUp')).toBeInTheDocument();
    });

    it('navigates to the correct tab when an action queue item is clicked', async () => {
        renderWithRouter(<Financials />);

        const queue = within(await screen.findByRole('region', { name: 'Action queue' }));
        fireEvent.click(queue.getByText('finance.common.hub.discountExceptionsNeedReview'));
        await waitFor(() => expect(tabButton('discounts')).toHaveAttribute('aria-current', 'page'));
    });
});
