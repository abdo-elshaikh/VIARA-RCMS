import { useCallback, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CalendarDays,
    Download,
    FileSpreadsheet,
    FileText,
    FileType2,
    Layers3,
    Printer,
    RefreshCw,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useGetCashFlowSeriesQuery,
    useGetCashierReconciliationQuery,
    useGetDiscountReportQuery,
    useGetDoctorCommissionsQuery,
    useGetExpensesQuery,
    useGetFinancialClosuresQuery,
    useGetProfitAndLossQuery,
    useGetProfitAndLossSeriesQuery,
    useGetReceivablesAgingQuery,
    useGetTaxSummaryQuery,
} from '../../store/api';
import { formatFinancialCurrency, formatFinancialDate, toFinancialDateInput } from '../../utils/financialFormat';
import { exportFinancialReport } from '../../utils/financialReportExport';

const today = () => toFinancialDateInput();
const monthStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const yearStart = () => toFinancialDateInput(new Date(new Date().getFullYear(), 0, 1));

const presetRange = (period) => {
    if (period === 'day') return { startDate: today(), endDate: today() };
    if (period === 'year') return { startDate: yearStart(), endDate: today() };
    return { startDate: monthStart(), endDate: today() };
};

const number = (value) => Number(value || 0);
const localeFor = (language = 'en') => language?.startsWith('ar') ? 'ar-EG' : 'en-US';
const pct = (value, language = 'en') => `${new Intl.NumberFormat(localeFor(language), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value || 0))}%`;
const count = (value, language = 'en') => new Intl.NumberFormat(localeFor(language)).format(Number(value || 0));

const REPORT_OPTIONS = [
    { id: 'executive', key: 'executive', label: 'Executive pack' },
    { id: 'pl', key: 'pl', label: 'Profit and loss' },
    { id: 'trend', key: 'trend', label: 'Performance trend' },
    { id: 'discounts', key: 'discounts', label: 'Discount detection' },
    { id: 'expenses', key: 'expenses', label: 'Expense analysis' },
    { id: 'commissions', key: 'commissions', label: 'Doctor commissions' },
    { id: 'cashier', key: 'cashier', label: 'Cashier reconciliation' },
    { id: 'receivables', key: 'receivables', label: 'Receivables aging' },
    { id: 'closures', key: 'closures', label: 'Financial closures' },
];

const AdvancedFinancialReports = ({ dateRange: externalDateRange, onDateRangeChange }) => {
    const { t, i18n } = useTranslation('workspace');
    const [dateRange, setDateRange] = useState({ startDate: monthStart(), endDate: today() });
    const activeDateRange = externalDateRange || dateRange;
    const [period, setPeriod] = useState('month');
    const [reportType, setReportType] = useState('executive');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const language = i18n.language;
    const money = useCallback((value) => formatFinancialCurrency(value, language), [language]);
    const date = useCallback((value) => formatFinancialDate(value, language), [language]);
    const percent = useCallback((value) => pct(value, language), [language]);
    const numberLabel = useCallback((value) => count(value, language), [language]);
    const reportOptionLabel = useCallback((option) => t(`finance.reports.types.${option.key}`, { defaultValue: option.label }), [t]);
    const updateDateRange = (nextRange, preset = 'custom') => {
        setDateRange(nextRange);
        onDateRangeChange?.(nextRange, preset);
    };

    const rangeParams = useMemo(() => ({
        startDate: activeDateRange.startDate,
        endDate: activeDateRange.endDate,
        groupBy: period
    }), [activeDateRange.endDate, activeDateRange.startDate, period]);
    const expensesQuery = useGetExpensesQuery(rangeParams);
    const plQuery = useGetProfitAndLossQuery(rangeParams);
    const taxQuery = useGetTaxSummaryQuery(rangeParams);
    const commissionsQuery = useGetDoctorCommissionsQuery(rangeParams);
    const receivablesQuery = useGetReceivablesAgingQuery({ asOfDate: activeDateRange.endDate });
    const cashierQuery = useGetCashierReconciliationQuery(rangeParams);
    const closuresQuery = useGetFinancialClosuresQuery(rangeParams);
    const plSeriesQuery = useGetProfitAndLossSeriesQuery(rangeParams);
    const cashFlowSeriesQuery = useGetCashFlowSeriesQuery(rangeParams);
    const discountQuery = useGetDiscountReportQuery(rangeParams);

    const allQueries = [expensesQuery, plQuery, taxQuery, commissionsQuery, receivablesQuery, cashierQuery, closuresQuery, plSeriesQuery, cashFlowSeriesQuery, discountQuery];
    const isLoading = allQueries.some((query) => query.isLoading);
    const isFetching = allQueries.some((query) => query.isFetching);
    const isError = allQueries.some((query) => query.isError);

    const expenses = useMemo(() => expensesQuery.data || [], [expensesQuery.data]);
    const commissions = useMemo(() => commissionsQuery.data || [], [commissionsQuery.data]);
    const aging = useMemo(() => receivablesQuery.data || {}, [receivablesQuery.data]);
    const cashier = useMemo(() => cashierQuery.data || {}, [cashierQuery.data]);
    const closures = useMemo(() => closuresQuery.data || [], [closuresQuery.data]);
    const pl = useMemo(() => plQuery.data || {}, [plQuery.data]);
    const tax = useMemo(() => taxQuery.data || {}, [taxQuery.data]);
    const plSeries = useMemo(() => plSeriesQuery.data || [], [plSeriesQuery.data]);
    const cashFlowSeries = useMemo(() => cashFlowSeriesQuery.data || [], [cashFlowSeriesQuery.data]);
    const discount = useMemo(() => discountQuery.data || {}, [discountQuery.data]);

    // Merge the accrual P&L series with the cash-flow series on the shared period
    // key so a single trend table/row carries both accrual (revenue, expenses,
    // commission, net profit, margin) and cash (net cash flow) columns per period.
    const trend = useMemo(() => {
        const plByDate = new Map(plSeries.map((row) => [row.date, row]));
        const cashByDate = new Map(cashFlowSeries.map((row) => [row.date, row]));
        const dates = new Set([...plByDate.keys(), ...cashByDate.keys()]);
        return [...dates].sort().map((dateKey) => {
            const row = plByDate.get(dateKey) || {};
            return {
                date: dateKey,
                group_by: row.group_by || cashByDate.get(dateKey)?.group_by || period,
                basis: row.basis || 'accrual',
                net_revenue: number(row.net_revenue),
                operating_expenses: number(row.operating_expenses),
                commission_expense: number(row.commission_expense),
                net_profit: number(row.net_profit),
                net_margin: number(row.net_margin),
                net_cash_flow: number(cashByDate.get(dateKey)?.net_cash_flow),
            };
        });
    }, [plSeries, cashFlowSeries, period]);
    const discountItems = useMemo(() => discount.items || [], [discount.items]);

    const categories = useMemo(() => {
        const names = new Set(expenses.map((expense) => expense.category_name || 'Uncategorized'));
        return ['all', ...Array.from(names).sort()];
    }, [expenses]);

    const filteredExpenses = useMemo(() => (
        categoryFilter === 'all'
            ? expenses
            : expenses.filter((expense) => (expense.category_name || 'Uncategorized') === categoryFilter)
    ), [categoryFilter, expenses]);

    const analytics = useMemo(() => {
        const grossRevenue = number(pl.gross_revenue);
        const totalExpenses = number(pl.total_expenses);
        // Keep the accrual and cash bases strictly separate. commission_expense is
        // the accrued figure that feeds net_profit; commission_paid is cash out.
        // Never substitute one for the other — a missing accrual is 0, not cash.
        const commissionExpense = number(pl.commission_expense);
        const commissionPaid = number(pl.commission_paid);
        const netProfit = number(pl.net_profit);
        const margin = grossRevenue > 0 ? netProfit / grossRevenue * 100 : 0;
        const expenseRatio = grossRevenue > 0 ? totalExpenses / grossRevenue * 100 : 0;
        const commissionRatio = grossRevenue > 0 ? commissionExpense / grossRevenue * 100 : 0;
        const outstanding = number(aging.total_outstanding);
        const oldReceivables = number(aging['90_plus']);
        const oldReceivablesRatio = outstanding > 0 ? oldReceivables / outstanding * 100 : 0;
        const cashierVariance = (cashier.data || []).reduce((sum, shift) => sum + number(shift.variance), 0);
        const pendingCommission = commissions.reduce((sum, row) => sum + number(row.commission_pending), 0);
        const expenseTax = filteredExpenses.reduce((sum, row) => sum + number(row.tax_amount), 0);
        const expenseGross = filteredExpenses.reduce((sum, row) => sum + number(row.amount), 0);
        return {
            grossRevenue,
            totalExpenses,
            commissionPaid,
            commissionExpense,
            netProfit,
            margin,
            expenseRatio,
            commissionRatio,
            outstanding,
            oldReceivables,
            oldReceivablesRatio,
            cashierVariance,
            pendingCommission,
            expenseTax,
            expenseGross,
            patientOutstanding: number(aging.patient_outstanding),
            insuranceOutstanding: number(aging.insurance_outstanding),
            netCashFlow: number(pl.cash_summary?.net_cash_flow),
        };
    }, [aging, cashier.data, commissions, filteredExpenses, pl]);

    const sections = useMemo(() => {
        const expenseByCategory = Object.values(filteredExpenses.reduce((acc, expense) => {
            const key = expense.category_name || 'Uncategorized';
            acc[key] = acc[key] || { category: key, amount: 0, tax: 0, records: 0 };
            acc[key].amount += number(expense.amount);
            acc[key].tax += number(expense.tax_amount);
            acc[key].records += 1;
            return acc;
        }, {})).sort((a, b) => b.amount - a.amount);

        const closureRows = closures.slice(0, 30);

        return {
            pl: {
                title: t('finance.reports.sections.pl', { defaultValue: 'Profit and loss summary' }),
                columns: [
                    { key: 'metric', header: t('finance.reports.columns.metric', { defaultValue: 'Metric' }) },
                    { key: 'value', header: t('finance.reports.columns.value', { defaultValue: 'Value' }) },
                    { key: 'note', header: t('finance.reports.columns.note', { defaultValue: 'Management note' }) },
                ],
                rows: [
                    { metric: t('finance.reports.metrics.grossRevenue', { defaultValue: 'Gross revenue' }), value: money(analytics.grossRevenue), note: t('finance.reports.notes.grossRevenue', { defaultValue: 'Revenue excluding voided invoices and tax.' }) },
                    { metric: t('finance.reports.metrics.operatingExpenses', { defaultValue: 'Operating expenses' }), value: money(analytics.totalExpenses), note: t('finance.reports.notes.expenseRatio', { defaultValue: '{{value}} of gross revenue.', value: percent(analytics.expenseRatio) }) },
                    { metric: t('finance.reports.metrics.commissionExpense', { defaultValue: 'Commission expense (accrued)' }), value: money(analytics.commissionExpense), note: t('finance.reports.notes.commissionRatio', { defaultValue: '{{value}} of net revenue.', value: percent(analytics.commissionRatio) }) },
                    { metric: t('finance.reports.metrics.netCashFlow', { defaultValue: 'Net cash flow' }), value: money(analytics.netCashFlow), note: t('finance.reports.notes.cashBasis', { defaultValue: 'Collections less refunds, expenses, and paid commissions.' }) },
                    { metric: t('finance.reports.metrics.netProfit', { defaultValue: 'Net profit' }), value: money(analytics.netProfit), note: t('finance.reports.notes.margin', { defaultValue: 'Net margin {{value}}.', value: percent(analytics.margin) }) },
                    { metric: t('finance.reports.metrics.netTax', { defaultValue: 'Net tax liability' }), value: money(tax.net_tax_liability), note: t('finance.reports.notes.tax', { defaultValue: 'Collected {{collected}} / paid {{paid}}.', collected: money(tax.tax_collected), paid: money(tax.tax_paid) }) },
                ],
            },
            expenses: {
                title: t('finance.reports.sections.expenses', { defaultValue: 'Expense analysis by category' }),
                columns: [
                    { key: 'category', header: t('finance.reports.columns.category', { defaultValue: 'Category' }) },
                    { key: 'records', header: t('finance.reports.columns.records', { defaultValue: 'Records' }) },
                    { key: 'amount', header: t('finance.reports.columns.grossAmount', { defaultValue: 'Gross amount' }) },
                    { key: 'tax', header: t('finance.reports.columns.includedTax', { defaultValue: 'Included tax' }) },
                    { key: 'share', header: t('finance.reports.columns.expenseShare', { defaultValue: 'Expense share' }) },
                ],
                rows: expenseByCategory.map((row) => ({
                    ...row,
                    category: row.category === 'Uncategorized' ? t('finance.reports.uncategorized', { defaultValue: 'Uncategorized' }) : row.category,
                    records: numberLabel(row.records),
                    amount: money(row.amount),
                    tax: money(row.tax),
                    share: analytics.expenseGross > 0 ? percent(row.amount / analytics.expenseGross * 100) : percent(0),
                })),
            },
            commissions: {
                title: t('finance.reports.sections.commissions', { defaultValue: 'Doctor commission exposure' }),
                columns: [
                    { key: 'doctor', header: t('finance.reports.columns.doctor', { defaultValue: 'Doctor' }) },
                    { key: 'exams', header: t('finance.reports.columns.exams', { defaultValue: 'Exams' }) },
                    { key: 'revenue', header: t('finance.reports.columns.examRevenue', { defaultValue: 'Exam revenue' }) },
                    { key: 'earned', header: t('finance.reports.columns.earned', { defaultValue: 'Earned' }) },
                    { key: 'paid', header: t('finance.reports.columns.paid', { defaultValue: 'Paid' }) },
                    { key: 'pending', header: t('finance.reports.columns.pending', { defaultValue: 'Pending' }) },
                ],
                rows: commissions.slice(0, 50).map((row) => ({
                    doctor: row.doctor_name || t('finance.common.unknown', { defaultValue: 'Unknown' }),
                    exams: numberLabel(row.total_exams),
                    revenue: money(row.total_exam_value),
                    earned: money(row.commission_est),
                    paid: money(row.commission_paid),
                    pending: money(row.commission_pending),
                })),
            },
            cashier: {
                title: t('finance.reports.sections.cashier', { defaultValue: 'Cashier reconciliation' }),
                columns: [
                    { key: 'cashier', header: t('finance.reports.columns.cashier', { defaultValue: 'Cashier' }) },
                    { key: 'status', header: t('finance.reports.columns.shiftStatus', { defaultValue: 'Shift status' }) },
                    { key: 'collected', header: t('finance.reports.columns.collected', { defaultValue: 'Collected' }) },
                    { key: 'expected', header: t('finance.reports.columns.expectedCash', { defaultValue: 'Expected cash' }) },
                    { key: 'counted', header: t('finance.reports.columns.countedCash', { defaultValue: 'Counted cash' }) },
                    { key: 'variance', header: t('finance.reports.columns.variance', { defaultValue: 'Variance' }) },
                    { key: 'review', header: t('finance.reports.columns.review', { defaultValue: 'Review' }) },
                ],
                rows: (cashier.data || []).slice(0, 50).map((shift) => ({
                    cashier: shift.cashier_name || t('finance.common.unknown', { defaultValue: 'Unknown' }),
                    status: shift.status ? t(`finance.cashier.status.${shift.status}`, { defaultValue: shift.status }) : '-',
                    collected: money(shift.collected_amount),
                    expected: shift.expected_cash == null ? '-' : money(shift.expected_cash),
                    counted: shift.counted_cash == null ? '-' : money(shift.counted_cash),
                    variance: shift.variance == null ? '-' : money(shift.variance),
                    review: shift.review_status ? t(`finance.cashier.reviewStatus.${shift.review_status}`, { defaultValue: shift.review_status }) : '-',
                })),
            },
            receivables: {
                title: t('finance.reports.sections.receivables', { defaultValue: 'Receivables aging' }),
                columns: [
                    { key: 'bucket', header: t('finance.reports.columns.bucket', { defaultValue: 'Bucket' }) },
                    { key: 'amount', header: t('finance.reports.columns.amount', { defaultValue: 'Amount' }) },
                    { key: 'share', header: t('finance.reports.columns.share', { defaultValue: 'Share' }) },
                ],
                rows: [
                    { bucket: t('finance.receivables.buckets.0_30', { defaultValue: '0-30 days' }), amount: money(aging['0_30']), share: analytics.outstanding > 0 ? percent(number(aging['0_30']) / analytics.outstanding * 100) : percent(0) },
                    { bucket: t('finance.receivables.buckets.31_60', { defaultValue: '31-60 days' }), amount: money(aging['31_60']), share: analytics.outstanding > 0 ? percent(number(aging['31_60']) / analytics.outstanding * 100) : percent(0) },
                    { bucket: t('finance.receivables.buckets.61_90', { defaultValue: '61-90 days' }), amount: money(aging['61_90']), share: analytics.outstanding > 0 ? percent(number(aging['61_90']) / analytics.outstanding * 100) : percent(0) },
                    { bucket: t('finance.receivables.buckets.90_plus', { defaultValue: 'Over 90 days' }), amount: money(aging['90_plus']), share: percent(analytics.oldReceivablesRatio) },
                    { bucket: t('finance.reports.metrics.patientReceivables', { defaultValue: 'Patient receivables' }), amount: money(analytics.patientOutstanding), share: analytics.outstanding > 0 ? percent(analytics.patientOutstanding / analytics.outstanding * 100) : percent(0) },
                    { bucket: t('finance.reports.metrics.insuranceReceivables', { defaultValue: 'Insurance receivables' }), amount: money(analytics.insuranceOutstanding), share: analytics.outstanding > 0 ? percent(analytics.insuranceOutstanding / analytics.outstanding * 100) : percent(0) },
                ],
            },
            closures: {
                title: t('finance.reports.sections.closures', { defaultValue: 'Financial closures' }),
                columns: [
                    { key: 'date', header: t('finance.reports.columns.closureDate', { defaultValue: 'Closure date' }) },
                    { key: 'revenue', header: t('finance.reports.columns.revenue', { defaultValue: 'Revenue' }) },
                    { key: 'expenses', header: t('finance.reports.columns.expenses', { defaultValue: 'Expenses' }) },
                    { key: 'net', header: t('finance.reports.columns.netProfit', { defaultValue: 'Net profit' }) },
                    { key: 'status', header: t('finance.reports.columns.status', { defaultValue: 'Status' }) },
                    { key: 'closedBy', header: t('finance.reports.columns.closedBy', { defaultValue: 'Closed by' }) },
                ],
                rows: closureRows.map((closure) => ({
                    date: date(closure.closure_date),
                    revenue: money(closure.total_revenue),
                    expenses: money(closure.total_expenses),
                    net: money(closure.net_profit),
                    status: closure.status ? t(`finance.closures.status.${closure.status}`, { defaultValue: closure.status }) : '-',
                    closedBy: closure.closed_by_name || '-',
                })),
            },
            trend: {
                title: t('finance.reports.sections.trend', { defaultValue: 'Performance trend' }),
                columns: [
                    { key: 'period', header: t('finance.reports.columns.period', { defaultValue: 'Period' }) },
                    { key: 'netRevenue', header: t('finance.reports.columns.netRevenue', { defaultValue: 'Net revenue' }) },
                    { key: 'expenses', header: t('finance.reports.columns.expenses', { defaultValue: 'Expenses' }) },
                    { key: 'commission', header: t('finance.reports.columns.commissionExpense', { defaultValue: 'Commission' }) },
                    { key: 'netProfit', header: t('finance.reports.columns.netProfit', { defaultValue: 'Net profit' }) },
                    { key: 'margin', header: t('finance.reports.columns.margin', { defaultValue: 'Margin' }) },
                    { key: 'netCashFlow', header: t('finance.reports.columns.netCashFlow', { defaultValue: 'Net cash flow' }) },
                ],
                rows: trend.map((row) => ({
                    period: date(row.date),
                    netRevenue: money(row.net_revenue),
                    expenses: money(row.operating_expenses),
                    commission: money(row.commission_expense),
                    netProfit: money(row.net_profit),
                    margin: percent(row.net_margin),
                    netCashFlow: money(row.net_cash_flow),
                })),
            },
            discounts: {
                title: t('finance.reports.sections.discounts', { defaultValue: 'Discount detection' }),
                columns: [
                    { key: 'invoice', header: t('finance.reports.columns.invoice', { defaultValue: 'Invoice' }) },
                    { key: 'date', header: t('finance.reports.columns.date', { defaultValue: 'Date' }) },
                    { key: 'subtotal', header: t('finance.reports.columns.subtotal', { defaultValue: 'Subtotal' }) },
                    { key: 'discount', header: t('finance.reports.columns.discount', { defaultValue: 'Discount' }) },
                    { key: 'rate', header: t('finance.reports.columns.rate', { defaultValue: 'Rate' }) },
                    { key: 'reason', header: t('finance.reports.columns.reason', { defaultValue: 'Reason' }) },
                    { key: 'approver', header: t('finance.reports.columns.approver', { defaultValue: 'Approved by' }) },
                    { key: 'flags', header: t('finance.reports.columns.flags', { defaultValue: 'Flags' }) },
                ],
                rows: discountItems.slice(0, 100).map((row) => ({
                    invoice: row.invoice_number || '-',
                    date: date(row.business_date),
                    subtotal: money(row.subtotal_amount),
                    discount: money(row.discount_amount),
                    rate: percent(row.effective_rate),
                    reason: row.discount_reason || t('finance.reports.discounts.noReason', { defaultValue: 'none' }),
                    approver: row.approved_by || t('finance.reports.discounts.noApprover', { defaultValue: 'none' }),
                    flags: row.flags.length
                        ? row.flags.map((flag) => t(`finance.reports.discounts.flags.${flag}`, { defaultValue: flag })).join(', ')
                        : t('finance.reports.discounts.clean', { defaultValue: 'OK' }),
                })),
            },
        };
    }, [aging, analytics, cashier.data, closures, commissions, date, discountItems, filteredExpenses, money, numberLabel, percent, t, tax, trend]);

    const selectedSections = useMemo(() => {
        if (reportType === 'executive') return [sections.pl, sections.trend, sections.expenses, sections.commissions, sections.receivables, sections.cashier, sections.closures];
        return [sections[reportType]].filter(Boolean);
    }, [reportType, sections]);

    const selectedReportOption = useMemo(() => REPORT_OPTIONS.find((option) => option.id === reportType) || REPORT_OPTIONS[0], [reportType]);

    const categoryLabel = useMemo(() => {
        if (categoryFilter === 'all') return t('finance.reports.allCategories', { defaultValue: 'All expense categories' });
        if (categoryFilter === 'Uncategorized') return t('finance.reports.uncategorized', { defaultValue: 'Uncategorized' });
        return categoryFilter;
    }, [categoryFilter, t]);

    const report = useMemo(() => ({
        title: reportOptionLabel(selectedReportOption),
        subtitle: `${date(activeDateRange.startDate)} - ${date(activeDateRange.endDate)} | ${t('finance.reports.accrualBasis', { defaultValue: 'Accrual performance' })} | ${categoryLabel}`,
        generatedAt: new Date().toLocaleString(localeFor(language)),
        filename: `financial-${reportType}`,
        exportLabels: {
            generatedAt: t('finance.reports.exportLabels.generatedAt', { defaultValue: 'Generated at' }),
            summary: t('finance.reports.exportLabels.summary', { defaultValue: 'Summary' }),
            metric: t('finance.reports.exportLabels.metric', { defaultValue: 'Metric' }),
            value: t('finance.reports.exportLabels.value', { defaultValue: 'Value' }),
        },
        summary: [
            { label: t('finance.reports.metrics.grossRevenue', { defaultValue: 'Gross revenue' }), value: money(analytics.grossRevenue) },
            { label: t('finance.reports.metrics.netProfit', { defaultValue: 'Net profit' }), value: money(analytics.netProfit) },
            { label: t('finance.reports.metrics.netCashFlow', { defaultValue: 'Net cash flow' }), value: money(analytics.netCashFlow) },
            { label: t('finance.reports.metrics.margin', { defaultValue: 'Margin' }), value: percent(analytics.margin) },
            { label: t('finance.reports.metrics.outstandingReceivables', { defaultValue: 'Outstanding receivables' }), value: money(analytics.outstanding) },
            { label: t('finance.reports.metrics.pendingCommissions', { defaultValue: 'Pending commissions' }), value: money(analytics.pendingCommission) },
            { label: t('finance.reports.metrics.cashierVariance', { defaultValue: 'Cashier variance' }), value: money(analytics.cashierVariance) },
        ],
        sections: selectedSections,
    }), [analytics, categoryLabel, date, activeDateRange.endDate, activeDateRange.startDate, language, money, percent, reportOptionLabel, reportType, selectedReportOption, selectedSections, t]);

    const exportReport = async (format) => {
        try {
            await exportFinancialReport(report, format);
            toast.success(t('finance.reports.exportSuccess', { defaultValue: 'Financial report exported.' }));
        } catch (error) {
            toast.error(error?.message || t('finance.reports.exportError', { defaultValue: 'Export failed.' }));
        }
    };

    const refreshAll = () => {
        allQueries.forEach((query) => query.refetch?.());
    };

    if (isLoading) {
        return <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">{t('finance.reports.loading', { defaultValue: 'Building financial report...' })}</div>;
    }

    if (isError) {
        return <div role="alert" className="rounded-2xl border border-rose-200 bg-white p-12 text-center text-sm font-bold text-rose-600 shadow-sm dark:border-rose-900/60 dark:bg-slate-900/70 dark:text-rose-300">{t('finance.reports.error', { defaultValue: 'Financial reports could not be loaded.' })}</div>;
    }

    return (
        <div className="space-y-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300">
                            <FileText size={13} />
                            {t('finance.reports.builderEyebrow', { defaultValue: 'Report builder' })}
                        </p>
                        <h2 className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white sm:text-xl">{report.title}</h2>
                        <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{report.subtitle}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <StatusPill icon={Layers3} label={t('finance.reports.reportSections', { defaultValue: '{{count}} sections', count: numberLabel(selectedSections.length) })} />
                        <button type="button" onClick={refreshAll} disabled={isFetching} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {isFetching ? t('finance.reports.refreshing', { defaultValue: 'Refreshing...' }) : t('finance.cashier.refresh')}
                        </button>
                    </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_140px_140px_minmax(180px,1fr)_minmax(170px,1fr)]">
                    <div className="flex h-9 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/40" role="group" aria-label={t('finance.reports.period', { defaultValue: 'Report period' })}>
                        {['day', 'month', 'year'].map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => {
                                    setPeriod(option);
                                    updateDateRange(presetRange(option), { day: 'today', month: 'thisMonth', year: 'thisYear' }[option]);
                                }}
                                className={`min-w-14 flex-1 rounded-lg px-2 text-xs font-black transition ${period === option ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800/70'}`}
                            >
                                {t(`finance.reports.periods.${option}`, { defaultValue: option[0].toUpperCase() + option.slice(1) })}
                            </button>
                        ))}
                    </div>
                    <DateInput label={t('finance.pl.startDate')} value={activeDateRange.startDate} max={activeDateRange.endDate} onChange={(value) => updateDateRange({ ...activeDateRange, startDate: value })} />
                    <DateInput label={t('finance.pl.endDate')} value={activeDateRange.endDate} min={activeDateRange.startDate} onChange={(value) => updateDateRange({ ...activeDateRange, endDate: value })} />
                    <select value={reportType} onChange={(event) => setReportType(event.target.value)} aria-label={t('finance.reports.reportType', { defaultValue: 'Report type' })} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        {REPORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{reportOptionLabel(option)}</option>)}
                    </select>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label={t('finance.reports.expenseCategory', { defaultValue: 'Expense category' })} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        {categories.map((category) => <option key={category} value={category}>{category === 'all' ? t('finance.reports.allCategories', { defaultValue: 'All expense categories' }) : category === 'Uncategorized' ? t('finance.reports.uncategorized', { defaultValue: 'Uncategorized' }) : category}</option>)}
                    </select>
                </div>

                <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1">
                        <Kpi icon={TrendingUp} label={t('finance.reports.metrics.grossRevenue', { defaultValue: 'Gross revenue' })} value={money(analytics.grossRevenue)} tone="emerald" />
                        <Kpi icon={TrendingDown} label={t('finance.reports.metrics.expenses', { defaultValue: 'Expenses' })} value={money(analytics.totalExpenses)} tone="rose" detail={percent(analytics.expenseRatio)} />
                        <Kpi icon={FileText} label={t('finance.reports.metrics.netProfit', { defaultValue: 'Net profit' })} value={money(analytics.netProfit)} tone={analytics.netProfit >= 0 ? 'slate' : 'rose'} detail={percent(analytics.margin)} />
                        <Kpi icon={AlertTriangle} label={t('finance.reports.metrics.oldReceivables', { defaultValue: 'Receivables > 90d' })} value={money(analytics.oldReceivables)} tone={analytics.oldReceivables > 0 ? 'amber' : 'emerald'} detail={percent(analytics.oldReceivablesRatio)} />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end pt-4 sm:pt-5">
                    <ExportButton icon={FileSpreadsheet} label="CSV" onClick={() => exportReport('csv')} />
                    <ExportButton icon={FileSpreadsheet} label="Excel" onClick={() => exportReport('excel')} />
                    <ExportButton icon={FileType2} label="Word" onClick={() => exportReport('word')} />
                    <ExportButton icon={Printer} label="PDF" onClick={() => exportReport('pdf')} />
                </div>
            </section>

            <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_280px]">
                <ReportPreview report={report} t={t} sectionCount={selectedSections.length} numberLabel={numberLabel} />
                <InsightPanel analytics={analytics} money={money} t={t} percent={percent} />
            </section>
        </div>
    );
};

const StatusPill = ({ icon: Icon, label }) => (
    <span className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <Icon size={14} className="shrink-0 text-cyan-600 dark:text-cyan-300" />
        <span className="truncate">{label}</span>
    </span>
);

const DateInput = ({ label, value, min, max, onChange }) => (
    <label>
        <span className="sr-only">{label}</span>
        <input type="date" aria-label={label} value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" />
    </label>
);

const Kpi = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
    const tones = {
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200',
        rose: 'border-rose-100 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200',
        amber: 'border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200',
        cyan: 'border-cyan-100 bg-cyan-50 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/25 dark:text-cyan-200',
        slate: 'border-slate-200 bg-slate-950 text-white dark:border-slate-700 dark:bg-slate-800',
    };
    return (
        <article className={`min-w-0 rounded-xl border p-2.5 lg:min-w-[150px] ${tones[tone]}`}>
            <div className="flex items-center justify-between gap-2"><p className="truncate text-[9px] font-black uppercase tracking-wider opacity-75">{label}</p><Icon size={14} /></div>
            <p className="mt-1.5 truncate font-mono text-sm font-black">{value}</p>
            {detail ? <p className="mt-0.5 truncate text-[10px] font-bold opacity-70">{detail}</p> : null}
        </article>
    );
};

const ExportButton = ({ icon: Icon, label, onClick, dark = false }) => (
    <button type="button" onClick={onClick} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black shadow-sm transition ${dark ? 'border-white/10 bg-white/10 text-white hover:border-cyan-300/40 hover:bg-cyan-400/15 hover:text-cyan-100' : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-900/60 dark:hover:bg-cyan-950/25 dark:hover:text-cyan-200'}`}>
        <Icon size={14} />
        <Download size={12} />
        {label}
    </button>
);

const ReportPreview = ({ report, t, sectionCount, numberLabel }) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300">{t('finance.reports.previewTitle', { defaultValue: 'Preview and control checks' })}</p>
                <h3 className="mt-1 truncate text-base font-black text-slate-900 dark:text-white">{report.title}</h3>
                <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{report.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                <StatusPill icon={Layers3} label={t('finance.reports.reportSections', { defaultValue: '{{count}} sections', count: numberLabel(sectionCount) })} />
                <StatusPill icon={CalendarDays} label={t('finance.reports.generatedAt', { defaultValue: 'Generated {{date}}', date: report.generatedAt })} />
            </div>
        </div>
        <div className="max-h-[620px] overflow-auto p-3 sm:p-4">
            {(report.sections || []).map((section) => (
                <section key={section.title} className="mb-4 last:mb-0">
                    <h4 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{section.title}</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="min-w-full text-start text-xs">
                            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/45 dark:text-slate-400">
                                <tr>{section.columns.map((column) => <th key={column.key} className="px-2.5 py-2 text-start font-black uppercase tracking-wider whitespace-nowrap">{column.header}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {section.rows.length ? section.rows.map((row, index) => <tr key={`${section.title}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/45">{section.columns.map((column) => <td key={column.key} className="px-2.5 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{row[column.key]}</td>)}</tr>) : <tr><td className="px-3 py-4 text-center font-bold text-slate-400" colSpan={section.columns.length}>{t('finance.reports.noRecords', { defaultValue: 'No records' })}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </div>
    </div>
);

const InsightPanel = ({ analytics, money, t, percent }) => {
    const insights = [
        {
            title: analytics.margin >= 20
                ? t('finance.reports.insights.healthyProfitTitle', { defaultValue: 'Healthy profitability' })
                : t('finance.reports.insights.profitAttentionTitle', { defaultValue: 'Profitability needs attention' }),
            text: t('finance.reports.insights.profitText', { defaultValue: 'Net margin is {{margin}} with net profit of {{profit}}.', margin: percent(analytics.margin), profit: money(analytics.netProfit) }),
            tone: analytics.margin >= 20 ? 'emerald' : 'amber',
        },
        {
            title: analytics.oldReceivables > 0
                ? t('finance.reports.insights.agingRiskTitle', { defaultValue: 'Aging receivables risk' })
                : t('finance.reports.insights.agingControlledTitle', { defaultValue: 'Receivables aging is controlled' }),
            text: t('finance.reports.insights.agingText', { defaultValue: '{{amount}} is older than 90 days, representing {{ratio}} of outstanding receivables.', amount: money(analytics.oldReceivables), ratio: percent(analytics.oldReceivablesRatio) }),
            tone: analytics.oldReceivables > 0 ? 'rose' : 'emerald',
        },
        {
            title: Math.abs(analytics.cashierVariance) > 0
                ? t('finance.reports.insights.cashReviewTitle', { defaultValue: 'Cash variance requires review' })
                : t('finance.reports.insights.cashBalancedTitle', { defaultValue: 'Cashier variance is balanced' }),
            text: t('finance.reports.insights.cashText', { defaultValue: 'Current recorded cashier variance is {{variance}}.', variance: money(analytics.cashierVariance) }),
            tone: Math.abs(analytics.cashierVariance) > 0 ? 'amber' : 'emerald',
        },
        {
            title: analytics.pendingCommission > 0
                ? t('finance.reports.insights.commissionPendingTitle', { defaultValue: 'Commission liability outstanding' })
                : t('finance.reports.insights.commissionSettledTitle', { defaultValue: 'Commissions are settled' }),
            text: t('finance.reports.insights.commissionText', { defaultValue: '{{amount}} remains pending for referring doctors.', amount: money(analytics.pendingCommission) }),
            tone: analytics.pendingCommission > 0 ? 'cyan' : 'emerald',
        },
    ];
    const tones = {
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100',
        amber: 'border-amber-100 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100',
        rose: 'border-rose-100 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-100',
        cyan: 'border-cyan-100 bg-cyan-50 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/25 dark:text-cyan-100',
    };
    return (
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300">{t('finance.reports.insightsEyebrow', { defaultValue: 'Management insights' })}</p>
            <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white">{t('finance.reports.insightsTitle', { defaultValue: 'Financial control signals' })}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('finance.reports.insightsDescription', { defaultValue: 'Automated checks based on margin, aging, variance, and commission exposure.' })}</p>
            <div className="mt-3 space-y-2">
                {insights.map((item) => (
                    <article key={item.title} className={`rounded-xl border p-2.5 ${tones[item.tone]}`}>
                        <h4 className="line-clamp-1 text-xs font-black">{item.title}</h4>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-80">{item.text}</p>
                    </article>
                ))}
            </div>
        </aside>
    );
};

export default AdvancedFinancialReports;
