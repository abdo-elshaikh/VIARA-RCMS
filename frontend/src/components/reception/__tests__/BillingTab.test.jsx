import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import BillingTab from '../BillingTab';

const mockUseGetInvoiceSummaryQuery = vi.fn();
const mockUseGetInvoicesQuery = vi.fn();

vi.mock('../../../store/api', () => ({
    useGetCashierReconciliationQuery: () => ({ data: null }),
    useGetInvoiceQuery: () => ({ data: null }),
    useGetInvoiceSummaryQuery: (params, opts) => mockUseGetInvoiceSummaryQuery(params, opts),
    useGetInvoicesQuery: (params, opts) => mockUseGetInvoicesQuery(params, opts),
    useGetRefundsQuery: () => ({ data: [] }),
    useLazyGetInvoicePdfQuery: () => [vi.fn(), { isFetching: false }],
    useLazyGetInvoicesQuery: () => [vi.fn(), { isFetching: false }],
    useRefundInvoiceMutation: () => [vi.fn(), { isLoading: false }],
    useReviewRefundMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock('react-redux', () => ({
    useSelector: (selector) => selector({
        auth: { user: { id: 'u1', role: 'Admin', permissions: ['PROCESS_PAYMENTS'] } }
    }),
}));

vi.mock('react-router-dom', () => ({
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, opts) => opts?.defaultValue || key,
        i18n: { language: 'ar', dir: () => 'rtl' }
    }),
}));

describe('BillingTab Date-Scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseGetInvoiceSummaryQuery.mockReturnValue({
            data: {
                gross_billed: 5000,
                collected: 3500,
                outstanding: 1500,
                discounts: 200,
                open_count: 2,
                paid_count: 5,
                partial_count: 1,
                pending_count: 1,
                total_count: 7
            },
            isError: false,
            refetch: vi.fn(),
        });

        mockUseGetInvoicesQuery.mockReturnValue({
            data: {
                items: [
                    {
                        invoice_id: 'inv-1',
                        invoice_number: 'INV-2026-001',
                        patient_name: 'Zainab Ahmed',
                        patient_payable_amount: 1500,
                        paid_amount: 1500,
                        balance_amount: 0,
                        invoice_status: 'Paid',
                        generated_at: '2026-09-02T10:00:00Z',
                    }
                ],
                meta: { total: 1 }
            },
            isLoading: false,
            isFetching: false,
            isError: false,
            refetch: vi.fn(),
        });
    });

    it('passes selectedDate to useGetInvoiceSummaryQuery and useGetInvoicesQuery', () => {
        render(<BillingTab selectedDate="2026-09-02" />);

        expect(mockUseGetInvoiceSummaryQuery).toHaveBeenCalledWith(
            expect.objectContaining({ date: '2026-09-02' }),
            expect.any(Object)
        );

        expect(mockUseGetInvoicesQuery).toHaveBeenCalledWith(
            expect.objectContaining({ date: '2026-09-02' }),
            expect.any(Object)
        );

        expect(screen.getByText('2026-09-02')).toBeInTheDocument();
        expect(screen.getByText('بيانات يوم:')).toBeInTheDocument();
        expect(screen.getAllByText('INV-2026-001').length).toBeGreaterThan(0);
    });

    it('navigates days when next/prev buttons are clicked', () => {
        render(<BillingTab selectedDate="2026-09-02" />);

        const prevDayButton = screen.getByTitle('اليوم السابق');
        fireEvent.click(prevDayButton);

        expect(mockUseGetInvoiceSummaryQuery).toHaveBeenCalledWith(
            expect.objectContaining({ date: '2026-09-01' }),
            expect.any(Object)
        );
        expect(mockUseGetInvoicesQuery).toHaveBeenCalledWith(
            expect.objectContaining({ date: '2026-09-01' }),
            expect.any(Object)
        );
    });

    it('switches between sub-tabs: refunds, insurance, and statement', () => {
        render(<BillingTab selectedDate="2026-09-02" />);

        // Switch to Refunds Hub
        const refundsTab = screen.getByRole('button', { name: /طلبات واستردادات المدفوعات/i });
        fireEvent.click(refundsTab);
        expect(screen.getByText('قائمة اعتماد الاستردادات')).toBeInTheDocument();

        // Switch to Corporate & Insurance Tab
        const insuranceTab = screen.getByRole('button', { name: /فواتير ومطالبات التأمين/i });
        fireEvent.click(insuranceTab);
        expect(screen.getByText('إجمالي مطالبات التأمين')).toBeInTheDocument();

        // Switch to Financial Statement Tab
        const statementTab = screen.getByRole('button', { name: /كشف الإغلاق والتقرير المالي/i });
        fireEvent.click(statementTab);
        expect(screen.getByText('كشف الإقفال والتسوية المالية اليومية')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /طباعة كشف الإقفال اليومي/i })).toBeInTheDocument();
    });

    it('toggles view mode between table and cards in invoices tab', () => {
        render(<BillingTab selectedDate="2026-09-02" />);

        // Default is table view
        expect(screen.getByRole('table')).toBeInTheDocument();

        // Toggle to cards view
        const cardsButton = screen.getByRole('button', { name: 'بطاقات' });
        fireEvent.click(cardsButton);
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getAllByText('INV-2026-001').length).toBeGreaterThan(0);

        // Toggle back to table
        const tableButton = screen.getByRole('button', { name: 'جدول' });
        fireEvent.click(tableButton);
        expect(screen.getByRole('table')).toBeInTheDocument();
    });
});

