const express = require('express');
const { invoiceLimiter } = require('../middleware/rateLimiters');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const auditRead = require('../middleware/auditRead');
const { hasPermission, hasAnyPermission } = require('../middleware/rbacMiddleware');
const { validateRequest, validateQuery } = require('../middleware/validateRequest');
const checkFeature = require('../middleware/checkFeature');

/** Every path prefix owned by this router; see the gate note below. */
const FINANCE_PATHS = [
    '/reports', '/invoices', '/invoice-summary', '/cashier', '/refunds',
    '/partial-payment-exceptions', '/finance',
];

const {
    createExpenseCategorySchema,
    updateExpenseCategorySchema,
    createExpenseSchema,
    updateExpenseSchema,
    getExpensesQuerySchema,
    reverseExpenseSchema,
    payCommissionSchema,
    createClosureSchema,
    finalizeClosureSchema,
    getFinancialClosuresQuerySchema,
    financialReportQuerySchema,
    journalLedgerQuerySchema
} = require('../schemas/financeSchema');

const {
    createInvoiceSchema,
    updateInvoiceSchema,
    collectPaymentSchema,
    refundSchema,
    reviewRefundSchema,
    getInvoicesQuerySchema,
    getRefundsQuerySchema
} = require('../schemas/invoiceSchema');

const {
    openShiftSchema,
    closeShiftSchema,
    reconciliationQuerySchema,
    reviewClosureSchema
} = require('../schemas/cashierSchema');

const {
    getPartialPaymentExceptionsQuerySchema,
    requestPartialPaymentExceptionSchema,
    reviewPartialPaymentExceptionSchema
} = require('../schemas/partialPaymentExceptionSchema');

const {
    getRevenueReport,
    getOutstandingClaims,
    getDoctorCommissions,
    getReceivablesAging,
    getTaxSummary,
    getProfitAndLoss,
    getProfitAndLossSeries,
    getCashFlowSeries,
    getDiscountReport,
    getTrialBalance,
    getJournalLedger
} = require('../controllers/reportController');

const {
    getExpenseCategories,
    createExpenseCategory,
    updateExpenseCategory,
    getExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    getCommissionPayables,
    payCommission,
    getFinancialClosures,
    createFinancialClosure,
    finalizeFinancialClosure
} = require('../controllers/financeController');

const {
    createInvoice,
    getInvoices,
    getInvoiceSummary,
    getInvoiceById,
    getVisitsStatement,
    updateInvoice,
    collectPayment,
    refundInvoice,
    getRefunds,
    reviewRefund,
    getInvoicePdf
} = require('../controllers/invoiceController');

const {
    openShift,
    closeShift,
    getReconciliation,
    reviewCashierClosure,
    getCurrentCashierShift
} = require('../controllers/cashierController');

const {
    getPartialPaymentExceptions,
    requestPartialPaymentException,
    reviewPartialPaymentException
} = require('../controllers/partialPaymentExceptionController');

module.exports = function financeRoutes(pool, auditService) {
    const router = express.Router();

    // The gate covers exactly the path prefixes this router owns. It used to be
    // `app.use('/api', checkFeature('finance'), financeRoutes(...))` in
    // server.js, which ran for every route registered after it; and simply
    // moving it to a bare `router.use(...)` did not help either, because the
    // router is itself mounted at '/api' and so sees all of /api/*.
    //
    // Every route declared below must start with one of these. That invariant is
    // enforced by tests/feature-gate-mounting.test.js, so a route added under a
    // new prefix fails the build rather than silently escaping the gate.
    router.use(FINANCE_PATHS, checkFeature('finance'));

    // ─── Financial Reports ──────────────────────────────────────────────────
    router.get('/reports/revenue', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getRevenueReport(pool));
    router.get('/reports/claims', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']), validateQuery(financialReportQuerySchema), getOutstandingClaims(pool));
    router.get('/reports/commissions', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getDoctorCommissions(pool));
    router.get('/reports/receivables-aging', authenticateToken, authorizeRole(['Admin', 'Accountant', 'Insurance_Staff']), validateQuery(financialReportQuerySchema), getReceivablesAging(pool));
    router.get('/reports/tax-summary', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getTaxSummary(pool));
    router.get('/reports/profit-and-loss', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getProfitAndLoss(pool));
    router.get('/reports/profit-and-loss-series', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getProfitAndLossSeries(pool));
    router.get('/reports/cash-flow-series', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getCashFlowSeries(pool));
    router.get('/reports/discounts', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getDiscountReport(pool));
    router.get('/reports/trial-balance', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(financialReportQuerySchema), getTrialBalance(pool));
    router.get('/reports/journal-ledger', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(journalLedgerQuerySchema), getJournalLedger(pool));

    // ─── Expenses & Payables ────────────────────────────────────────────────
    router.get('/finance/categories', authenticateToken, authorizeRole(['Admin', 'Accountant']), getExpenseCategories(pool));
    router.post('/finance/categories', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'MANAGE_EXPENSES'), validateRequest(createExpenseCategorySchema), createExpenseCategory(pool));
    router.put('/finance/categories/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'MANAGE_EXPENSES'), validateRequest(updateExpenseCategorySchema), updateExpenseCategory(pool));

    router.get('/finance/expenses', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(getExpensesQuerySchema), getExpenses(pool));
    router.post('/finance/expenses', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'MANAGE_EXPENSES'), validateRequest(createExpenseSchema), createExpense(pool));
    router.put('/finance/expenses/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'MANAGE_EXPENSES'), validateRequest(updateExpenseSchema), updateExpense(pool));
    router.delete('/finance/expenses/:id', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'MANAGE_EXPENSES'), validateRequest(reverseExpenseSchema), deleteExpense(pool));

    router.get('/finance/payables', authenticateToken, authorizeRole(['Admin', 'Accountant']), getCommissionPayables(pool));
    router.post('/finance/payables/pay', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'MANAGE_COMMISSIONS'), validateRequest(payCommissionSchema), payCommission(pool));

    // ─── Financial Closures ─────────────────────────────────────────────────
    router.get('/finance/closures', authenticateToken, authorizeRole(['Admin', 'Accountant']), validateQuery(getFinancialClosuresQuerySchema), getFinancialClosures(pool));
    router.post('/finance/closures', authenticateToken, authorizeRole(['Admin', 'Accountant']), hasPermission(pool, 'CLOSE_FINANCIAL_PERIODS'), validateRequest(createClosureSchema), createFinancialClosure(pool));
    router.put('/finance/closures/:id', authenticateToken, authorizeRole(['Admin']), hasPermission(pool, 'CLOSE_FINANCIAL_PERIODS'), validateRequest(finalizeClosureSchema), finalizeFinancialClosure(pool));

    // ─── Billing & Invoicing ────────────────────────────────────────────────
    router.post('/invoices',
        authenticateToken,
        invoiceLimiter,
        authorizeRole(['Admin', 'Accountant', 'Receptionist']),
        hasPermission(pool, 'CREATE_INVOICES'),
        validateRequest(createInvoiceSchema),
        createInvoice(pool)
    );

    router.get('/invoices',
        authenticateToken,
        invoiceLimiter,
        auditRead(auditService, { resourceTable: 'invoices' }),
        hasPermission(pool, 'VIEW_INVOICES'),
        validateQuery(getInvoicesQuerySchema),
        getInvoices(pool)
    );

    router.get('/invoice-summary',
        authenticateToken,
        invoiceLimiter,
        hasPermission(pool, 'VIEW_INVOICES'),
        getInvoiceSummary(pool)
    );

    router.get('/invoices/statement',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'invoices' }),
        hasPermission(pool, 'VIEW_INVOICES'),
        getVisitsStatement(pool)
    );

    router.get('/invoices/:id',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'invoices' }),
        hasPermission(pool, 'VIEW_INVOICES'),
        getInvoiceById(pool)
    );

    router.put('/invoices/:id',
        authenticateToken,
        authorizeRole(['Admin', 'Accountant']),
        hasPermission(pool, 'EDIT_INVOICES'),
        validateRequest(updateInvoiceSchema),
        updateInvoice(pool)
    );

    router.post('/invoices/:id/payment',
        authenticateToken,
        hasPermission(pool, 'PROCESS_PAYMENTS'),
        validateRequest(collectPaymentSchema),
        collectPayment(pool)
    );

    router.post('/invoices/:id/refund',
        authenticateToken,
        hasPermission(pool, 'REQUEST_REFUNDS'),
        validateRequest(refundSchema),
        refundInvoice(pool)
    );

    router.get('/refunds',
        authenticateToken,
        hasAnyPermission(pool, ['REQUEST_REFUNDS', 'APPROVE_REFUNDS', 'PROCESS_REFUNDS', 'ISSUE_REFUNDS']),
        validateQuery(getRefundsQuerySchema),
        getRefunds(pool)
    );

    router.patch('/refunds/:id/status',
        authenticateToken,
        hasAnyPermission(pool, ['APPROVE_REFUNDS', 'PROCESS_REFUNDS', 'ISSUE_REFUNDS']),
        validateRequest(reviewRefundSchema),
        reviewRefund(pool)
    );

    router.get('/partial-payment-exceptions',
        authenticateToken,
        hasAnyPermission(pool, ['REQUEST_PARTIAL_PAYMENT_EXCEPTION', 'APPROVE_PARTIAL_PAYMENT_EXCEPTION']),
        validateQuery(getPartialPaymentExceptionsQuerySchema),
        getPartialPaymentExceptions(pool)
    );

    router.post('/invoices/:id/partial-payment-exceptions',
        authenticateToken,
        hasPermission(pool, 'REQUEST_PARTIAL_PAYMENT_EXCEPTION'),
        validateRequest(requestPartialPaymentExceptionSchema),
        requestPartialPaymentException(pool)
    );

    router.patch('/partial-payment-exceptions/:id/status',
        authenticateToken,
        hasPermission(pool, 'APPROVE_PARTIAL_PAYMENT_EXCEPTION'),
        validateRequest(reviewPartialPaymentExceptionSchema),
        reviewPartialPaymentException(pool)
    );

    router.get('/invoices/:id/pdf',
        authenticateToken,
        auditRead(auditService, { resourceTable: 'invoices' }),
        hasPermission(pool, 'VIEW_INVOICES'),
        getInvoicePdf(pool)
    );

    // ─── Cashier Workspace & Shift Reconciliation ───────────────────────────
    router.get('/cashier/shifts/current',
        authenticateToken,
        hasAnyPermission(pool, [
            'PROCESS_PAYMENTS',
            'RECONCILE_SHIFTS',
            'APPROVE_SHIFT_VARIANCE',
            'OPEN_CASHIER_SHIFT',
            'CLOSE_CASHIER_SHIFT',
            'VIEW_FINANCIAL_REPORTS',
            'MANAGE_RECEPTION_WORKSPACE',
            'VIEW_RECEPTION_WORKSPACE'
        ]),
        getCurrentCashierShift(pool)
    );

    router.post('/cashier/shifts/open',
        authenticateToken,
        hasPermission(pool, 'OPEN_CASHIER_SHIFT'),
        validateRequest(openShiftSchema),
        openShift(pool)
    );

    router.post('/cashier/shifts/:id/close',
        authenticateToken,
        hasPermission(pool, 'CLOSE_CASHIER_SHIFT'),
        validateRequest(closeShiftSchema),
        closeShift(pool)
    );

    router.get('/cashier/reconciliation',
        authenticateToken,
        hasAnyPermission(pool, ['PROCESS_PAYMENTS', 'RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE']),
        validateQuery(reconciliationQuerySchema),
        getReconciliation(pool)
    );

    router.patch('/cashier/closures/:id/review',
        authenticateToken,
        hasPermission(pool, 'APPROVE_SHIFT_VARIANCE'),
        validateRequest(reviewClosureSchema),
        reviewCashierClosure(pool)
    );

    return router;
};
