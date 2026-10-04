import { api } from '../baseApi';
import { generateUUID } from '../../utils/uuid';

export const financeApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getRevenueReport: builder.query({
            query: (params) => ({
                url: '/reports/revenue',
                params,
            }),
            providesTags: ['FinancialReports'],
        }),
        getOutstandingClaims: builder.query({
            query: (params) => ({ url: '/reports/claims', params }),
            providesTags: ['FinancialReports'],
        }),
        getDoctorCommissions: builder.query({
            query: (params) => ({ url: '/reports/commissions', params }),
            providesTags: ['Commissions'],
        }),
        getReceivablesAging: builder.query({
            query: (params) => ({ url: '/reports/receivables-aging', params }),
            providesTags: ['FinancialReports'],
        }),
        getTaxSummary: builder.query({
            query: (params) => ({ url: '/reports/tax-summary', params }),
            providesTags: ['FinancialReports'],
        }),
        getProfitAndLoss: builder.query({
            query: (params) => ({ url: '/reports/profit-and-loss', params }),
            providesTags: ['FinancialReports'],
        }),
        getProfitAndLossSeries: builder.query({
            query: (params) => ({ url: '/reports/profit-and-loss-series', params }),
            providesTags: ['FinancialReports'],
        }),
        getCashFlowSeries: builder.query({
            query: (params) => ({ url: '/reports/cash-flow-series', params }),
            providesTags: ['FinancialReports'],
        }),
        getDiscountReport: builder.query({
            query: (params) => ({ url: '/reports/discounts', params }),
            providesTags: ['FinancialReports'],
        }),
        getTrialBalance: builder.query({
            query: (params) => ({ url: '/reports/trial-balance', params }),
            providesTags: ['FinancialReports'],
        }),
        getJournalLedger: builder.query({
            query: (params) => ({ url: '/reports/journal-ledger', params }),
            providesTags: ['FinancialReports'],
        }),
        getExpenseCategories: builder.query({
            query: () => '/finance/categories',
            providesTags: ['ExpenseCategories'],
        }),
        createExpenseCategory: builder.mutation({
            query: (data) => ({ url: '/finance/categories', method: 'POST', body: data }),
            invalidatesTags: ['ExpenseCategories'],
        }),
        updateExpenseCategory: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/finance/categories/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['ExpenseCategories'],
        }),
        getExpenses: builder.query({
            query: (params) => ({ url: '/finance/expenses', params }),
            providesTags: ['Expenses'],
        }),
        createExpense: builder.mutation({
            query: (data) => ({ url: '/finance/expenses', method: 'POST', body: data }),
            invalidatesTags: ['Expenses', 'FinancialReports'],
        }),
        updateExpense: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/finance/expenses/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Expenses', 'FinancialReports'],
        }),
        deleteExpense: builder.mutation({
            query: ({ id, reason }) => ({ url: `/finance/expenses/${id}`, method: 'DELETE', body: { reason } }),
            invalidatesTags: ['Expenses', 'FinancialReports'],
        }),
        getCommissionPayables: builder.query({
            query: () => '/finance/payables',
            providesTags: ['Commissions'],
        }),
        payCommission: builder.mutation({
            query: (data) => ({ url: '/finance/payables/pay', method: 'POST', body: data }),
            invalidatesTags: ['Commissions', 'FinancialReports'],
        }),
        getFinancialClosures: builder.query({
            query: (params) => ({ url: '/finance/closures', params }),
            providesTags: ['Closures'],
        }),
        createFinancialClosure: builder.mutation({
            query: (data) => ({ url: '/finance/closures', method: 'POST', body: data }),
            invalidatesTags: ['Closures', 'FinancialReports'],
        }),
        finalizeFinancialClosure: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/finance/closures/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Closures', 'FinancialReports'],
        }),
        getInvoices: builder.query({
            query: (params) => ({
                url: '/invoices',
                params,
            }),
            providesTags: ['Invoices'],
        }),
        getInvoiceSummary: builder.query({
            query: (params) => ({ url: '/invoice-summary', params }),
            providesTags: ['Invoices'],
        }),
        getInvoice: builder.query({
            query: (id) => `/invoices/${id}`,
            providesTags: (result, error, id) => [{ type: 'Invoices', id }],
        }),
        getVisitsStatement: builder.query({
            query: ({ patientId, appointmentIds }) => ({
                url: '/invoices/statement',
                params: {
                    patientId,
                    appointmentIds: Array.isArray(appointmentIds) ? appointmentIds.join(',') : appointmentIds
                }
            }),
            providesTags: ['Invoices'],
        }),
        createInvoice: builder.mutation({
            query: ({ idempotencyKey = generateUUID(), ...data }) => ({
                url: '/invoices',
                method: 'POST',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Invoices', 'Dashboard', 'FinancialReports'],
        }),
        updateInvoice: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/invoices/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Invoices', 'Dashboard', 'FinancialReports'],
        }),
        collectInvoicePayment: builder.mutation({
            query: ({ id, idempotencyKey, ...data }) => ({
                url: `/invoices/${id}/payment`,
                method: 'POST',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Invoices', 'Cashier', 'Dashboard', 'FinancialReports'],
        }),
        refundInvoice: builder.mutation({
            query: ({ id, idempotencyKey, ...data }) => ({
                url: `/invoices/${id}/refund`,
                method: 'POST',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Invoices', 'Refunds', 'Cashier', 'Dashboard', 'FinancialReports'],
        }),
        getRefunds: builder.query({
            query: (params) => ({ url: '/refunds', params }),
            providesTags: ['Refunds'],
        }),
        reviewRefund: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/refunds/${id}/status`,
                method: 'PATCH',
                body: data,
            }),
            invalidatesTags: ['Refunds', 'Invoices', 'Cashier', 'Dashboard', 'FinancialReports'],
        }),
        getPartialPaymentExceptions: builder.query({
            query: (params) => ({ url: '/partial-payment-exceptions', params }),
            providesTags: ['PartialPaymentExceptions'],
        }),
        requestPartialPaymentException: builder.mutation({
            query: ({ invoiceId, ...data }) => ({
                url: `/invoices/${invoiceId}/partial-payment-exceptions`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['PartialPaymentExceptions', 'Invoices', 'Queue'],
        }),
        reviewPartialPaymentException: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/partial-payment-exceptions/${id}/status`,
                method: 'PATCH',
                body: data,
            }),
            invalidatesTags: ['PartialPaymentExceptions', 'Invoices', 'Queue'],
        }),
        getInvoicePdf: builder.query({
            query: ({ id, lang }) => ({
                url: `/invoices/${id}/pdf${lang ? `?lang=${lang}` : ''}`,
                responseHandler: (response) => response.text(),
            }),
        }),
        openCashierShift: builder.mutation({
            query: (data) => ({
                url: '/cashier/shifts/open',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Cashier'],
        }),
        closeCashierShift: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/cashier/shifts/${id}/close`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Cashier'],
        }),
        getCashierReconciliation: builder.query({
            query: (params) => ({
                url: '/cashier/reconciliation',
                params,
            }),
            providesTags: ['Cashier'],
        }),
        reviewCashierClosure: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/cashier/closures/${id}/review`, method: 'PATCH', body: data }),
            invalidatesTags: ['Cashier'],
        }),
        getCurrentCashierShift: builder.query({
            query: () => '/cashier/shifts/current',
            providesTags: ['Cashier'],
        }),
    }),
    overrideExisting: false,
});
