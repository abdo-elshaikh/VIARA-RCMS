import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
    AlertCircle,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Banknote,
    Building2,
    Calendar,
    Check,
    CheckCircle2,
    Clock3,
    Copy,
    CreditCard,
    Download,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Filter,
    Hash,
    History,
    Layers,
    PackagePlus,
    Percent,
    Printer,
    Receipt,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    Stethoscope,
    TrendingDown,
    User,
    X
} from 'lucide-react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    useGetCashierReconciliationQuery,
    useGetInvoiceQuery,
    useGetInvoiceSummaryQuery,
    useGetInvoicesQuery,
    useGetRefundsQuery,
    useLazyGetInvoicePdfQuery,
    useLazyGetInvoicesQuery,
    useRefundInvoiceMutation,
    useReviewRefundMutation,
} from '../../store/api';
import Modal from '../ui/Modal';
import ConsumeItemModal from '../inventory/ConsumeItemModal';
import { getInvoiceCoverageCategory, getContractRequirementsChecklist } from './receptionLogic';
import Pagination from '../ui/Pagination';
import { getPaginationState } from '../../utils/pagination';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { generateUUID } from '../../utils/uuid';
import { selectCurrentUser } from '../../store/authSlice';
import useDebounce from '../../hooks/useDebounce';

const fieldClass =
    'h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const labelClass = 'mb-1.5 block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';

const STATUS_STYLES = {
    Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
    Pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
    Partial: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-900/50',
    Voided: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    Refunded: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50',
};

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const EMPTY_INVOICES = [];

const StatusPill = ({ status }) => {
    const { t } = useTranslation('reception');
    const label = t(`billing.statuses.${status}`, { defaultValue: status });
    return (
        <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.Voided}`}>
            {label}
        </span>
    );
};

const BillingTab = () => {
    const { t, i18n } = useTranslation('reception');
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectCurrentUser);
    const isRtl = i18n?.language?.startsWith('ar');

    const permissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const canCollect = user?.role === 'Developer' || permissions.has('PROCESS_PAYMENTS');
    const canReconcile = user?.role === 'Developer' || permissions.has('RECONCILE_SHIFTS');
    const canRequestRefund = user?.role === 'Developer' || permissions.has('REQUEST_REFUNDS');
    const canApproveRefund = user?.role === 'Developer' || permissions.has('APPROVE_REFUNDS');
    const canProcessRefund = user?.role === 'Developer' || permissions.has('PROCESS_REFUNDS');
    const canAppendSupplies = user?.role === 'Developer' || permissions.has('CONSUME_INVENTORY');
    const userId = user?.id || user?.user_id;

    const { data: invoiceSummary, isError: isSummaryError, refetch: refetchSummary } = useGetInvoiceSummaryQuery(undefined, { pollingInterval: 30000 });
    const [refundInvoice, { isLoading: isRefunding }] = useRefundInvoiceMutation();
    const [reviewRefund, { isLoading: isReviewingRefund }] = useReviewRefundMutation();
    const [getPdf, { isFetching: isDownloading }] = useLazyGetInvoicePdfQuery();
    const [getInvoicesForExport, { isFetching: isExporting }] = useLazyGetInvoicesQuery();

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [sortField, setSortField] = useState('date');
    const [sortDirection, setSortDirection] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const invoiceQueryParams = useMemo(() => ({
        q: debouncedSearchTerm.trim() || undefined,
        status: !['All', 'Open'].includes(statusFilter) ? statusFilter : undefined,
        openOnly: statusFilter === 'Open' ? 'true' : undefined,
        includeMeta: 'true',
        sortBy: sortField,
        sortDirection,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
    }), [currentPage, debouncedSearchTerm, pageSize, sortDirection, sortField, statusFilter]);
    const {
        data: invoicePage,
        isLoading,
        isFetching,
        isError: isInvoicesError,
        refetch,
    } = useGetInvoicesQuery(invoiceQueryParams, { pollingInterval: 30000 });
    const invoices = invoicePage?.items || EMPTY_INVOICES;
    const filteredInvoiceCount = Number(invoicePage?.meta?.total || 0);

    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [printInvoice, setPrintInvoice] = useState(null);
    const [printLang, setPrintLang] = useState('both');
    const [refundTarget, setRefundTarget] = useState(null);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundMethod, setRefundMethod] = useState('Cash');
    const [refundReason, setRefundReason] = useState('');
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewReason, setReviewReason] = useState('');
    const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => generateUUID());
    const [supplyExamId, setSupplyExamId] = useState(null);
    const linkedInvoiceId = searchParams.get('invoiceId');
    const { data: linkedInvoice } = useGetInvoiceQuery(linkedInvoiceId, { skip: !linkedInvoiceId });

    useEffect(() => {
        const invoiceId = searchParams.get('invoiceId');
        if (!invoiceId) return;
        const invoice = linkedInvoice || invoices.find((item) => item.invoice_id === invoiceId);
        if (!invoice) return;
        setSelectedInvoice(invoice);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('invoiceId');
        setSearchParams(nextParams, { replace: true });
    }, [invoices, linkedInvoice, searchParams, setSearchParams]);

    const { data: refundsForApproval = [], isFetching: isLoadingApprovals } = useGetRefundsQuery(
        { status: 'Pending', limit: '100' },
        { skip: !canApproveRefund, pollingInterval: 30000 }
    );
    const { data: refundsForProcessing = [], isFetching: isLoadingProcessing } = useGetRefundsQuery(
        { status: 'Approved', limit: '100' },
        { skip: !canProcessRefund, pollingInterval: 30000 }
    );
    const pendingRefunds = useMemo(() => [
        ...refundsForApproval,
        ...refundsForProcessing.filter((refund) => !refundsForApproval.some((item) => item.refund_id === refund.refund_id)),
    ], [refundsForApproval, refundsForProcessing]);
    const isLoadingRefunds = isLoadingApprovals || isLoadingProcessing;
    const { data: cashierData } = useGetCashierReconciliationQuery(
        { cashierId: userId },
        { skip: !userId || (!canCollect && !canReconcile) }
    );
    const currentShift = cashierData?.data?.find((shift) => ['Open', 'Active'].includes(shift.status));

    const { data: invoiceDetail, isFetching: isLoadingInvoiceDetail } = useGetInvoiceQuery(
        selectedInvoice?.invoice_id,
        { skip: !selectedInvoice?.invoice_id }
    );

    // Reset pagination to page 1 on filter/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, pageSize]);

    const paginationState = useMemo(() => {
        return getPaginationState(filteredInvoiceCount, currentPage, pageSize);
    }, [currentPage, filteredInvoiceCount, pageSize]);

    useEffect(() => {
        if (currentPage !== paginationState.currentPage) {
            setCurrentPage(paginationState.currentPage);
        }
    }, [currentPage, paginationState.currentPage]);

    const paginatedInvoices = invoices;

    const kpis = useMemo(() => {
        if (invoiceSummary) {
            const grossBilled = Number(invoiceSummary.gross_billed || 0);
            const collected = Number(invoiceSummary.collected || 0);
            return {
                collected,
                outstanding: Number(invoiceSummary.outstanding || 0),
                discounts: Number(invoiceSummary.discounts || 0),
                grossBilled,
                collectionRate: grossBilled > 0
                    ? Math.min(100, Math.max(0, Math.round((collected / grossBilled) * 100)))
                    : 0,
                open: Number(invoiceSummary.open_count || 0),
                paidCount: Number(invoiceSummary.paid_count || 0),
                partialCount: Number(invoiceSummary.partial_count || 0),
                pendingCount: Number(invoiceSummary.pending_count || 0),
                refundedCount: Number(invoiceSummary.refunded_count || 0),
                voidedCount: Number(invoiceSummary.voided_count || 0),
            };
        }
        let collected = 0;
        let outstanding = 0;
        let discounts = 0;
        let grossBilled = 0;
        let openCount = 0;
        let paidCount = 0;
        let partialCount = 0;
        let pendingCount = 0;
        let refundedCount = 0;
        let voidedCount = 0;

        invoices.forEach((inv) => {
            const billed = Number(inv.patient_payable_amount ?? inv.total_amount ?? 0);
            const paid = Number(inv.paid_amount || 0) - Number(inv.refunded_amount || 0);
            const balance = Number(inv.balance_amount || 0);
            const discount = Number(inv.discount_amount || 0);

            if (inv.invoice_status !== 'Voided') {
                grossBilled += billed;
                collected += paid;
                outstanding += balance;
                discounts += discount;
            }

            if (balance > 0 && inv.invoice_status !== 'Voided') openCount += 1;
            if (inv.invoice_status === 'Paid') paidCount += 1;
            else if (inv.invoice_status === 'Partial') partialCount += 1;
            else if (inv.invoice_status === 'Pending') pendingCount += 1;
            else if (inv.invoice_status === 'Refunded') refundedCount += 1;
            else if (inv.invoice_status === 'Voided') voidedCount += 1;
        });

        const collectionRate = grossBilled > 0
            ? Math.min(100, Math.max(0, Math.round((collected / grossBilled) * 100)))
            : 0;

        return {
            collected,
            outstanding,
            discounts,
            grossBilled,
            collectionRate,
            open: openCount,
            paidCount,
            partialCount,
            pendingCount,
            refundedCount,
            voidedCount,
        };
    }, [invoiceSummary, invoices]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection(field === 'date' ? 'desc' : 'asc');
        }
    };

    const handleConfirmPrint = async (event) => {
        event.preventDefault();
        if (!printInvoice) return;
        try {
            toast.loading(t('billing.downloadingPdf'), { id: 'pdf' });
            const html = await getPdf({ id: printInvoice.invoice_id, lang: printLang }).unwrap();
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            setTimeout(() => window.URL.revokeObjectURL(url), 30000);
            toast.success(t('billing.printOpened'), { id: 'pdf' });
            setPrintInvoice(null);
        } catch {
            toast.error(t('billing.printFailed'), { id: 'pdf' });
        }
    };

    const exportInvoicesCsv = async () => {
        const exportRows = [];
        let offset = 0;
        let total = Number.POSITIVE_INFINITY;
        try {
            while (offset < total) {
                const page = await getInvoicesForExport({
                    ...invoiceQueryParams,
                    includeMeta: 'true',
                    limit: 500,
                    offset,
                }, true).unwrap();
                const pageItems = page?.items || [];
                total = Number(page?.meta?.total || 0);
                exportRows.push(...pageItems);
                if (!pageItems.length) break;
                offset += pageItems.length;
            }
        } catch (error) {
            toast.error(getErrorMessage(error, t('billing.exportFailed', { defaultValue: 'Invoices could not be exported.' })));
            return;
        }
        if (!exportRows.length) {
            toast.error(t('billing.noDataToExport', { defaultValue: 'No invoices to export' }));
            return;
        }
        const headers = ['Invoice Number', 'Patient Name', 'MRN', 'Date', 'Total Amount', 'Paid Amount', 'Balance', 'Status'];
        const rows = exportRows.map((inv) => [
            `"${inv.invoice_number || ''}"`,
            `"${(inv.patient_name || '').replace(/"/g, '""')}"`,
            `"${inv.mrn || ''}"`,
            `"${new Date(inv.generated_at || inv.created_at || Date.now()).toLocaleDateString()}"`,
            Number(inv.patient_payable_amount ?? inv.total_amount ?? 0).toFixed(2),
            Number(inv.paid_amount || 0).toFixed(2),
            Number(inv.balance_amount || 0).toFixed(2),
            `"${inv.invoice_status || ''}"`,
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `viara_invoices_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(t('billing.exportSuccess', { defaultValue: 'Invoices exported to CSV' }));
    };

    const openRefund = (invoice, payment) => {
        const reserved = (invoiceDetail?.refunds || [])
            .filter((refund) => refund.payment_id === payment.payment_id && refund.status !== 'Rejected')
            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
        const available = Math.max(0, Number(payment.amount || 0) - reserved);
        setRefundTarget({ invoice, payment, available });
        setRefundAmount(available.toFixed(2));
        setRefundMethod(payment.method || 'Cash');
        setRefundReason('');
        setRefundIdempotencyKey(generateUUID());
        setSelectedInvoice(null);
    };

    const handleConfirmRefund = async (event) => {
        event.preventDefault();
        if (!refundTarget) return;
        const amount = Number(refundAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > refundTarget.available + 0.005) {
            toast.error(t('billing.refundAmountInvalid', { defaultValue: 'Enter a valid refund amount within the refundable balance.' }));
            return;
        }
        if (refundReason.trim().length < 3) {
            toast.error(t('billing.refundReasonRequired', { defaultValue: 'A refund reason of at least 3 characters is required.' }));
            return;
        }
        try {
            await refundInvoice({
                id: refundTarget.invoice.invoice_id,
                idempotencyKey: refundIdempotencyKey,
                paymentId: refundTarget.payment.payment_id,
                amount,
                method: refundMethod,
                reason: refundReason.trim(),
            }).unwrap();
            toast.success(t('billing.refundRequested'));
            setRefundTarget(null);
            setSelectedInvoice(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('billing.refundFailed')));
        }
    };

    const openRefundReview = (refund, status) => {
        setReviewTarget({ refund, status });
        setReviewReason('');
    };

    const handleRefundReview = async (event) => {
        event.preventDefault();
        if (!reviewTarget) return;
        if (reviewTarget.status === 'Processed' && !currentShift) {
            toast.error(t('billing.openShiftRequired'));
            return;
        }
        try {
            await reviewRefund({
                id: reviewTarget.refund.refund_id,
                status: reviewTarget.status,
                reason: reviewReason.trim(),
            }).unwrap();
            toast.success(t(reviewTarget.status === 'Approved' ? 'billing.refundApproved' : (reviewTarget.status === 'Processed' ? 'billing.refundProcessed' : 'billing.refundRejected')));
            setReviewTarget(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('billing.refundReviewFailed')));
        }
    };

    const filterChips = [
        { id: 'All', label: t('billing.allStatuses', { defaultValue: 'All Invoices' }), count: invoices.length },
        { id: 'Open', label: t('billing.openInvoicesShort', { defaultValue: 'Open Balance' }), count: kpis.open, tone: 'amber' },
        { id: 'Paid', label: t('billing.statuses.Paid', { defaultValue: 'Paid' }), count: kpis.paidCount, tone: 'emerald' },
        { id: 'Partial', label: t('billing.statuses.Partial', { defaultValue: 'Partial' }), count: kpis.partialCount, tone: 'teal' },
        { id: 'Pending', label: t('billing.statuses.Pending', { defaultValue: 'Pending' }), count: kpis.pendingCount, tone: 'amber' },
        { id: 'Refunded', label: t('billing.statuses.Refunded', { defaultValue: 'Refunded' }), count: kpis.refundedCount, tone: 'rose' },
        { id: 'Voided', label: t('billing.statuses.Voided', { defaultValue: 'Voided' }), count: kpis.voidedCount, tone: 'slate' },
    ];

    return (
        <div className="space-y-5">
            {(isInvoicesError || isSummaryError) && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                    <AlertTriangle size={17} />
                    {t('billing.loadError', { defaultValue: 'Invoice data could not be loaded. Totals are unavailable until refresh succeeds.' })}
                </div>
            )}
            {/* KPI Cards */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[.18em] text-teal-700 dark:text-teal-400">
                                {t('billing.workspaceTitle', { defaultValue: 'Billing workspace' })}
                            </span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                            {t('billing.title')}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            {t('billing.subtitle')}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start">
                        <button
                            type="button"
                            onClick={() => Promise.all([refetch(), refetchSummary()])}
                            disabled={isFetching}
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            title={t('common.refresh', { defaultValue: 'Refresh live feed' })}
                        >
                            <RefreshCw size={13} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                            <span>{isFetching ? 'Syncing...' : 'Refresh'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={exportInvoicesCsv}
                            disabled={isExporting}
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            title="Export to CSV"
                        >
                            <FileSpreadsheet size={14} className="text-emerald-600" />
                            <span>{isExporting ? t('billing.exporting', { defaultValue: 'Exporting...' }) : 'Export CSV'}</span>
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <BillingMetric
                        icon={Banknote}
                        label={t('billing.totalCollected')}
                        value={kpis.collected}
                        sub={`${kpis.collectionRate}% collection rate`}
                        tone="emerald"
                        onClick={() => setStatusFilter(statusFilter === 'Paid' ? 'All' : 'Paid')}
                        active={statusFilter === 'Paid'}
                    />
                    <BillingMetric
                        icon={Clock3}
                        label={t('billing.totalOutstanding')}
                        value={kpis.outstanding}
                        sub={t('billing.openInvoices', { count: kpis.open })}
                        tone="amber"
                        onClick={() => setStatusFilter(statusFilter === 'Open' ? 'All' : 'Open')}
                        active={statusFilter === 'Open'}
                    />
                    <BillingMetric
                        icon={TrendingDown}
                        label={t('billing.totalDiscounts')}
                        value={kpis.discounts}
                        tone="violet"
                    />
                    <BillingMetric
                        icon={Receipt}
                        label={t('billing.invoiceCount')}
                        value={Number(invoiceSummary?.total_count || filteredInvoiceCount)}
                        money={false}
                        sub={`${filteredInvoiceCount} active filter`}
                        tone="blue"
                        onClick={() => setStatusFilter('All')}
                        active={statusFilter === 'All'}
                    />
                </div>
            </section>

            {/* Refund Review Queue */}
            {(canApproveRefund || canProcessRefund) && (
                <RefundReviewQueue
                    canApproveRefund={canApproveRefund}
                    canProcessRefund={canProcessRefund}
                    currentShift={currentShift}
                    isLoading={isLoadingRefunds}
                    onReview={openRefundReview}
                    refunds={pendingRefunds}
                    t={t}
                />
            )}

            {/* Invoices List Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Search & Filter Toolbar */}
                <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <label className="relative w-full lg:max-w-md">
                            <span className="sr-only">{t('billing.searchPlaceholder')}</span>
                            <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                placeholder={t('billing.searchPlaceholder', { defaultValue: 'Search by invoice #, patient, MRN, order...' })}
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 ps-10 pe-10 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </label>

                        <div className="flex items-center gap-2 self-end lg:self-center">
                            <span className="rounded-xl bg-slate-100 px-3 py-1.5 font-mono text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {invoices.length} of {filteredInvoiceCount}
                            </span>
                        </div>
                    </div>

                    {/* Interactive Filter Chips Bar */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {filterChips.map((chip) => {
                            const isSelected = statusFilter === chip.id;
                            return (
                                <button
                                    key={chip.id}
                                    type="button"
                                    onClick={() => setStatusFilter(chip.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${isSelected
                                        ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500'
                                        : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    <span>{chip.label}</span>
                                    <span className={`rounded-md px-1.5 py-0.2 font-mono text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
                                        {chip.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="space-y-2 p-4">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                            ))}
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="flex min-h-56 flex-col items-center justify-center text-center p-8">
                            <Receipt size={32} className="text-slate-300 dark:text-slate-700" />
                            <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">{t('billing.noInvoices')}</p>
                            <p className="mt-1 text-xs text-slate-400">Try adjusting your search terms or filter criteria.</p>
                            {(searchTerm || statusFilter !== 'All') && (
                                <button
                                    type="button"
                                    onClick={() => { setSearchTerm(''); setStatusFilter('All'); }}
                                    className="mt-3 inline-flex items-center gap-1 rounded-xl bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300"
                                >
                                    <RotateCcw size={12} />
                                    <span>Reset Filters</span>
                                </button>
                            )}
                        </div>
                    ) : (
                        <InvoiceTable
                            invoices={paginatedInvoices}
                            isDownloading={isDownloading}
                            onPrint={setPrintInvoice}
                            onSelect={setSelectedInvoice}
                            onSort={handleSort}
                            sortField={sortField}
                            sortDirection={sortDirection}
                            t={t}
                        />
                    )}
                </div>

                {/* Pagination Footer */}
                {filteredInvoiceCount > 0 && (
                    <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:px-6">
                        <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                            <span>
                                {t('pagination.showing', {
                                    from: paginationState.startIndex + 1,
                                    to: paginationState.endIndex,
                                    total: filteredInvoiceCount,
                                    defaultValue: `Showing ${paginationState.startIndex + 1}–${paginationState.endIndex} of ${filteredInvoiceCount}`
                                })}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold">{t('pagination.perPage', { defaultValue: 'Rows:' })}</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                    aria-label={t('pagination.selectPageSize', { defaultValue: 'Rows per page' })}
                                >
                                    {PAGE_SIZE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <Pagination
                            currentPage={paginationState.currentPage}
                            pageCount={paginationState.pageCount}
                            onPageChange={setCurrentPage}
                            isRtl={isRtl}
                        />
                    </footer>
                )}
            </section>

            {/* Modals */}
            <Modal
                isOpen={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                title={selectedInvoice ? `${t('billing.invoiceDetails', { defaultValue: 'تفاصيل الفاتورة' })} · ${selectedInvoice.invoice_number}` : t('billing.invoiceDetails', { defaultValue: 'تفاصيل الفاتورة' })}
                width="w-full max-w-3xl lg:max-w-4xl"
            >
                {selectedInvoice && (
                    <InvoiceDetailsContent
                        canAppendSupplies={canAppendSupplies}
                        canRequestRefund={canRequestRefund}
                        invoice={selectedInvoice}
                        invoiceDetail={invoiceDetail}
                        isLoading={isLoadingInvoiceDetail}
                        onClose={() => setSelectedInvoice(null)}
                        onOpenRefund={openRefund}
                        onSetSupplyExamId={setSupplyExamId}
                        t={t}
                    />
                )}
            </Modal>

            <Modal
                isOpen={!!reviewTarget}
                onClose={() => !isReviewingRefund && setReviewTarget(null)}
                title={t(reviewTarget?.status === 'Rejected' ? 'billing.rejectRefundTitle' : (reviewTarget?.status === 'Processed' ? 'billing.processRefundTitle' : 'billing.approveRefundTitle'))}
            >
                {reviewTarget && (
                    <form onSubmit={handleRefundReview} className="space-y-5">
                        <div className={`rounded-xl border p-4 ${reviewTarget.status !== 'Rejected' ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20' : 'border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 dark:text-white">{reviewTarget.refund.patient_name}</p>
                                    <p className="font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{reviewTarget.refund.invoice_number}</p>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{reviewTarget.refund.reason}</p>
                                </div>
                                <AmountBlock label={t('billing.refundAmount')} value={reviewTarget.refund.amount} />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>{t('billing.reviewReason', { defaultValue: 'Decision note' })}</label>
                            <textarea
                                rows="3"
                                minLength="3"
                                maxLength="1000"
                                required
                                value={reviewReason}
                                onChange={(event) => setReviewReason(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={() => setReviewTarget(null)} disabled={isReviewingRefund} className="min-h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
                            <button type="submit" disabled={isReviewingRefund || reviewReason.trim().length < 3 || (reviewTarget.status === 'Processed' && !currentShift)} className={`flex min-h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition disabled:opacity-40 ${reviewTarget.status === 'Rejected' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                {reviewTarget.status === 'Rejected' ? <X size={14} /> : <CheckCircle2 size={14} />}
                                {isReviewingRefund ? t('billing.processing') : t(reviewTarget.status === 'Rejected' ? 'billing.rejectRefund' : (reviewTarget.status === 'Processed' ? 'billing.processRefund' : 'billing.approveRefund'))}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={!!refundTarget}
                onClose={() => !isRefunding && setRefundTarget(null)}
                title={t('billing.refundTitle')}
            >
                {refundTarget && (
                    <form onSubmit={handleConfirmRefund} className="space-y-5">
                        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 dark:text-white">{refundTarget.invoice.patient_name || t('billing.unnamedPatient')}</p>
                                    <p className="font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{refundTarget.invoice.invoice_number}</p>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t(`billing.methods.${refundTarget.payment.method}`, { defaultValue: refundTarget.payment.method })}</p>
                                </div>
                                <AmountBlock label={t('billing.refundable')} value={refundTarget.available} tone="amber" />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>{t('billing.refundAmount')}</label>
                                <input type="number" min="0.01" step="0.01" max={refundTarget.available} required value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className={fieldClass} dir="ltr" />
                            </div>
                            <div>
                                <label className={labelClass}>{t('billing.refundMethod')}</label>
                                <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} className={fieldClass}>
                                    {['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate'].map((method) => (
                                        <option key={method} value={method}>{t(`billing.methods.${method}`)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>{t('billing.refundReason')}</label>
                            <textarea rows="3" minLength="3" maxLength="1000" required value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder={t('billing.refundReasonPlaceholder')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('billing.refundApprovalHelp')}</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={() => setRefundTarget(null)} disabled={isRefunding} className="min-h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
                            <button type="submit" disabled={isRefunding || Number(refundAmount) <= 0 || Number(refundAmount) > refundTarget.available + 0.005 || refundReason.trim().length < 3} className="flex min-h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-40">
                                <RotateCcw size={14} />
                                {isRefunding ? t('billing.processing') : t('billing.requestRefund')}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={!!printInvoice}
                onClose={() => !isDownloading && setPrintInvoice(null)}
                title={t('billing.printPdf') || 'Print invoice'}
            >
                {printInvoice && (
                    <form onSubmit={handleConfirmPrint} className="space-y-5">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {t('billing.selectPrintLanguage', { invoice: printInvoice.invoice_number })}
                            </p>
                        </div>
                        <div>
                            <label className={labelClass}>{t('billing.language')}</label>
                            <select value={printLang} onChange={(event) => setPrintLang(event.target.value)} className={fieldClass}>
                                <option value="both">{t('billing.languages.both')}</option>
                                <option value="en">{t('billing.languages.en')}</option>
                                <option value="ar">{t('billing.languages.ar')}</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={() => setPrintInvoice(null)} disabled={isDownloading} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {t('cancel')}
                            </button>
                            <button type="submit" disabled={isDownloading} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500">
                                <Download size={14} />
                                {isDownloading ? '...' : t('billing.printPdf') || 'Download PDF'}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {supplyExamId && <ConsumeItemModal examId={supplyExamId} onClose={() => setSupplyExamId(null)} />}
        </div>
    );
};

const BillingMetric = ({ icon: Icon, label, value, money = true, sub, tone = 'slate', onClick, active }) => {
    const toneClass = {
        slate: 'border-slate-200/80 bg-slate-50/50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
        emerald: 'border-emerald-200/80 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
        amber: 'border-amber-200/80 bg-amber-50/50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
        violet: 'border-cyan-200/80 bg-cyan-50/50 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:text-cyan-300',
        blue: 'border-teal-200/80 bg-teal-50/50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/20 dark:text-teal-300',
    }[tone];

    const activeRing = active ? 'ring-2 ring-teal-500 shadow-md' : '';

    return (
        <div
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            className={`rounded-xl border p-3.5 transition-all ${toneClass} ${activeRing} ${onClick ? 'cursor-pointer hover:scale-[1.01] hover:shadow-sm' : ''}`}
        >
            <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Icon size={14} className="shrink-0 opacity-80" />
                    <p className="truncate text-[10px] font-black uppercase tracking-wide opacity-75">{label}</p>
                </div>
            </div>
            <p className="mt-1.5 truncate font-mono text-xl font-black tabular-nums" dir="ltr">
                {money ? Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
            </p>
            {sub && <p className="mt-0.5 truncate text-[11px] font-semibold opacity-75">{sub}</p>}
        </div>
    );
};

const AmountBlock = ({ label, value, tone = 'default' }) => {
    const tones = {
        default: 'bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-300',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    };
    return (
        <div className={`rounded-xl px-4 py-3 ${tones[tone] || tones.default}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums ltr-embed" dir="ltr">
                {Number(value || 0).toFixed(2)}
            </p>
        </div>
    );
};

const RefundReviewQueue = ({ canApproveRefund, canProcessRefund, currentShift, isLoading, onReview, refunds, t }) => (
    <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm dark:border-amber-500/20 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/50 px-4 py-3.5 dark:border-amber-500/20 dark:bg-amber-950/20">
            <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-black text-amber-900 dark:text-amber-200">
                    <ShieldCheck size={16} />
                    {t('billing.refundApprovalQueue')}
                </h3>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{t('billing.refundApprovalQueueHelp')}</p>
            </div>
            <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">{refunds.length}</span>
        </header>
        {isLoading ? (
            <div className="space-y-2 p-4">
                {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ))}
            </div>
        ) : refunds.length === 0 ? (
            <p className="px-5 py-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('billing.noPendingRefunds')}</p>
        ) : (
            <div className="grid gap-3 p-3.5 lg:grid-cols-2">
                {refunds.map((refund) => (
                    <article key={refund.refund_id} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{refund.patient_name || t('billing.unnamedPatient')}</p>
                                <p className="font-mono text-[11px] text-slate-400 ltr-embed" dir="ltr">{refund.invoice_number} / {refund.mrn || '-'}</p>
                                <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-700 dark:text-slate-300">{refund.reason}</p>
                                <p className="mt-1 text-[11px] text-slate-400">{t('billing.requestedBy', { name: refund.requested_by_name || '-' })}</p>
                            </div>
                            <div className="sm:text-end">
                                <p className="font-mono text-sm font-black text-rose-700 dark:text-rose-400 ltr-embed" dir="ltr">{Number(refund.amount || 0).toFixed(2)}</p>
                                <p className="text-[11px] text-slate-400 ltr-embed" dir="ltr">{new Date(refund.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {refund.status === 'Pending' && canApproveRefund && (
                                <>
                                    <button type="button" onClick={() => onReview(refund, 'Rejected')} className="min-h-9 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">{t('billing.rejectRefund')}</button>
                                    <button type="button" onClick={() => onReview(refund, 'Approved')} className="min-h-9 rounded-xl bg-teal-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700">{t('billing.approveRefund')}</button>
                                </>
                            )}
                            {refund.status === 'Approved' && canProcessRefund && (
                                <button type="button" onClick={() => onReview(refund, 'Processed')} disabled={!currentShift} title={!currentShift ? t('billing.openShiftRequired') : undefined} className="min-h-9 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{t('billing.processRefund')}</button>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        )}
    </section>
);

const InvoiceTable = ({ invoices, isDownloading, onPrint, onSelect, onSort, sortField, sortDirection, t }) => {
    const SortableHeader = ({ field, label, width, className = '' }) => {
        const isCurrent = sortField === field;
        return (
            <th className={`${width} px-3 py-3 text-start ${className}`}>
                <button
                    type="button"
                    onClick={() => onSort(field)}
                    className="group inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:text-slate-900 focus-visible:outline-none dark:text-slate-400 dark:hover:text-white"
                >
                    <span>{label}</span>
                    {isCurrent ? (
                        sortDirection === 'asc' ? (
                            <ArrowUp size={12} className="text-teal-600 dark:text-teal-400" />
                        ) : (
                            <ArrowDown size={12} className="text-teal-600 dark:text-teal-400" />
                        )
                    ) : (
                        <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                    )}
                </button>
            </th>
        );
    };

    return (
        <table className="w-full table-fixed text-start text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                <tr>
                    <SortableHeader field="number" label={t('billing.invoiceNo')} width="w-[120px]" className="ps-5" />
                    <th className="w-[28%] px-3 py-3 text-start text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t('billing.patient')}
                    </th>
                    <SortableHeader field="date" label={t('billing.date')} width="hidden w-[110px] md:table-cell" />
                    <SortableHeader field="total" label={t('billing.total')} width="hidden w-[110px] sm:table-cell" />
                    <SortableHeader field="paid" label={t('billing.paid')} width="hidden w-[110px] lg:table-cell" />
                    <SortableHeader field="balance" label={t('billing.balance')} width="w-[110px]" />
                    <SortableHeader field="status" label={t('billing.status')} width="hidden w-[116px] md:table-cell" />
                    <th className="w-[130px] px-4 py-3 pe-5 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {t('billing.actions')}
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((invoice) => (
                    <InvoiceRow
                        key={invoice.invoice_id}
                        invoice={invoice}
                        isDownloading={isDownloading}
                        onPrint={onPrint}
                        onSelect={onSelect}
                        t={t}
                    />
                ))}
            </tbody>
        </table>
    );
};

const InvoiceRow = ({ invoice, isDownloading, onPrint, onSelect, t }) => {
    const total = Number(invoice.patient_payable_amount ?? invoice.total_amount ?? 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_amount || 0);
    const paidPct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
    const hasBalance = balance > 0 && invoice.invoice_status !== 'Voided';
    const dateValue = invoice.generated_at || invoice.created_at;
    const coverageCategory = getInvoiceCoverageCategory(invoice);

    return (
        <tr className={`group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hasBalance ? 'bg-amber-50/40 dark:bg-amber-500/10' : ''}`}>
            <td className="px-3 py-3.5 ps-5">
                <button
                    type="button"
                    onClick={() => onSelect(invoice)}
                    className="max-w-full truncate font-mono text-xs font-black uppercase tracking-wide text-slate-700 outline-none hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-300 ltr-embed"
                    dir="ltr"
                >
                    {invoice.invoice_number || '-'}
                </button>
            </td>
            <td className="px-3 py-3.5">
                <button
                    type="button"
                    onClick={() => onSelect(invoice)}
                    className="block min-w-0 max-w-full text-start outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                    <span className="block truncate font-black text-slate-950 dark:text-white text-xs sm:text-sm">
                        {invoice.patient_name || t('billing.unnamedPatient')}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-mono text-[11px] text-slate-400 uppercase ltr-embed" dir="ltr">
                            {invoice.mrn || '-'}
                        </span>
                        {coverageCategory.type === 'insurance' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[9.5px] font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                                <ShieldCheck size={10} />
                                <span className="truncate max-w-24">{coverageCategory.providerName || 'Insurance'}</span>
                            </span>
                        )}
                        {coverageCategory.type === 'contract' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                                <Building2 size={10} />
                                <span className="truncate max-w-24">{coverageCategory.providerName || 'Contract'}</span>
                            </span>
                        )}
                        {coverageCategory.type === 'self_pay' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                Self-Pay
                            </span>
                        )}
                        <span className="inline-flex md:hidden">
                            <StatusPill status={invoice.invoice_status} />
                        </span>
                    </div>
                </button>
            </td>
            <td className="hidden px-3 py-3.5 text-xs font-semibold text-slate-500 md:table-cell ltr-embed" dir="ltr">
                {dateValue ? new Date(dateValue).toLocaleDateString() : '-'}
            </td>
            <td className="hidden px-3 py-3.5 text-end sm:table-cell">
                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 ltr-embed" dir="ltr">
                    {total.toFixed(2)}
                </span>
            </td>
            <td className="hidden px-3 py-3.5 text-end lg:table-cell">
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 ltr-embed" dir="ltr">
                    {paid.toFixed(2)}
                </span>
            </td>
            <td className="px-3 py-3.5 text-end">
                <span className={`font-mono text-xs font-black tabular-nums ltr-embed ${hasBalance ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`} dir="ltr">
                    {balance.toFixed(2)}
                </span>
                <div className="ms-auto mt-1 h-1.5 w-full max-w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full transition-all ${paidPct >= 100 ? 'bg-emerald-500' : paidPct > 0 ? 'bg-teal-500' : 'bg-slate-300'}`} style={{ width: `${paidPct}%` }} />
                </div>
            </td>
            <td className="hidden px-3 py-3.5 text-center md:table-cell">
                <StatusPill status={invoice.invoice_status} />
            </td>
            <td className="px-4 py-3.5 pe-5 text-end">
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={() => onSelect(invoice)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title={t('billing.viewDetails', { defaultValue: 'View Details' })}
                    >
                        <FileText size={13} />
                        <span className="sr-only">{t('billing.viewDetails', { defaultValue: 'View Details' })}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => window.open(`/print/invoice/${invoice.invoice_id}`, '_blank')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title={t('billing.print', { defaultValue: 'Print' })}
                    >
                        <Printer size={13} />
                        <span className="sr-only">{t('billing.print', { defaultValue: 'Print' })}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onPrint(invoice)}
                        disabled={isDownloading}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title="PDF"
                    >
                        <Download size={13} />
                        <span className="sr-only">PDF</span>
                    </button>
                </div>
            </td>
        </tr>
    );
};

const InvoiceDetailsContent = ({
    canAppendSupplies,
    canRequestRefund,
    invoice,
    invoiceDetail,
    isLoading,
    onClose,
    onOpenRefund,
    onSetSupplyExamId,
    t,
}) => {
    const [activeTab, setActiveTab] = useState('items'); // 'items' | 'payments' | 'clinical'
    const [copied, setCopied] = useState(false);

    const activeInv = useMemo(
        () => invoiceDetail?.invoice_id === invoice?.invoice_id ? { ...invoice, ...invoiceDetail } : invoice,
        [invoice, invoiceDetail]
    );
    const category = useMemo(() => getInvoiceCoverageCategory(activeInv), [activeInv]);

    const rawIssueDate = activeInv.generated_at || activeInv.created_at || activeInv.business_date || activeInv.issue_date || invoice.created_at;
    const issueDate = rawIssueDate ? new Date(rawIssueDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
    const examId = invoice.exam_id || invoiceDetail?.exam_id;

    const totalAmount = Number(activeInv.total_amount ?? 0);
    const paidAmount = Number(activeInv.paid_amount ?? 0);
    const discountAmount = Number(activeInv.discount_amount ?? 0);
    const balanceAmount = Number(activeInv.balance_amount ?? Math.max(0, totalAmount - paidAmount));
    const paidPct = totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : (paidAmount > 0 ? 100 : 0);

    const copyInvoiceNumber = () => {
        if (invoice?.invoice_number) {
            navigator.clipboard?.writeText(invoice.invoice_number);
            setCopied(true);
            toast.success(t('billing.copied', { defaultValue: 'Invoice number copied' }), { duration: 2000 });
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="space-y-4">
            {/* Top Identity & Action Header */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-slate-800">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3.5">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-200/70 shadow-sm dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60">
                                <Receipt size={22} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {t('billing.invoiceNo', { defaultValue: 'رقم الفاتورة' })}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={copyInvoiceNumber}
                                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                        title="Copy invoice number"
                                    >
                                        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                        <span className="font-mono">{copied ? t('copied', { defaultValue: 'تم النسخ' }) : t('copy', { defaultValue: 'نسخ' })}</span>
                                    </button>
                                </div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                                    <p className="min-w-0 truncate font-mono text-xl font-black text-slate-950 ltr-embed dark:text-white" dir="ltr">
                                        {invoice.invoice_number}
                                    </p>
                                    <StatusPill status={invoice.invoice_status} />
                                    {category.type === 'insurance' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 border border-teal-200/80 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800">
                                            <ShieldCheck size={13} className="text-teal-600" />
                                            <span>{category.labelAr || 'تأمين صحي'}{category.providerName ? ` · ${category.providerName}` : ''}</span>
                                        </span>
                                    )}
                                    {category.type === 'contract' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800 border border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800">
                                            <Building2 size={13} className="text-indigo-600" />
                                            <span>{category.labelAr || 'تعاقد جهة / نقابة'}{category.providerName ? ` · ${category.providerName}` : ''}</span>
                                        </span>
                                    )}
                                    {category.type === 'self_pay' && (
                                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                            <User size={13} className="text-slate-500" />
                                            <span>{category.labelAr || 'حساب خاص (نقدي)'}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-500">
                                    <InvoiceMeta icon={User} value={activeInv.patient_name || t('billing.unnamedPatient', { defaultValue: 'مريض بدون اسم' })} suffix={activeInv.mrn ? `MRN: ${activeInv.mrn}` : null} />
                                    <InvoiceMeta icon={Calendar} value={issueDate} />
                                    {activeInv.order_number && <InvoiceMeta icon={Hash} value={`${t('billing.order', { defaultValue: 'Order' })}: ${activeInv.order_number}`} mono />}
                                    {category.policyNumber && <InvoiceMeta icon={ShieldCheck} value={`${t('billing.policyNo', { defaultValue: 'الوثيقة' })}: ${category.policyNumber}`} mono />}
                                </div>
                            </div>
                        </div>

                        {/* Top Action Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <button
                                type="button"
                                onClick={() => window.open(`/print/invoice/${invoice.invoice_id}`, '_blank')}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-700 active:scale-95 dark:bg-teal-500 dark:hover:bg-teal-600"
                                title={t('billing.printFullInvoice', { defaultValue: 'طباعة الفاتورة الكاملة' })}
                            >
                                <Printer size={15} />
                                <span>{t('billing.print', { defaultValue: 'طباعة الفاتورة' })}</span>
                            </button>
                            {canAppendSupplies && examId && (
                                <button
                                    type="button"
                                    onClick={() => onSetSupplyExamId(examId)}
                                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 text-xs font-black text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-300"
                                    title={t('cashier.addSupply', { defaultValue: 'إضافة مستلزمات' })}
                                >
                                    <PackagePlus size={15} />
                                    <span>{t('cashier.addSupply', { defaultValue: 'إضافة مستلزمات' })}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Void Alert Banner */}
                {invoice.invoice_status === 'Voided' && (
                    <div className="flex items-start gap-2.5 border-b border-rose-200 bg-rose-50/80 p-3.5 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                        <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-wider">{t('billing.voidReason', { defaultValue: 'الفاتورة ملغاة' })}</p>
                            <p className="mt-0.5 text-xs font-medium">{invoice.cancellation_reason || t('billing.noReasonProvided', { defaultValue: 'لم يتم ذكر سبب الإلغاء' })}</p>
                        </div>
                    </div>
                )}

                {/* 4-Card Financial Metrics Matrix */}
                <div className="grid gap-2.5 p-3.5 sm:grid-cols-4">
                    <InvoiceMetric
                        label={t('billing.totalAmount', { defaultValue: 'إجمالي الفاتورة' })}
                        value={totalAmount}
                        icon={Receipt}
                    />
                    {category.insuranceCovered > 0 ? (
                        <InvoiceMetric
                            label={t('billing.insuranceCovered', { defaultValue: 'تغطية التأمين / الجهة' })}
                            value={category.insuranceCovered}
                            tone="emerald"
                            icon={ShieldCheck}
                        />
                    ) : (
                        <InvoiceMetric
                            label={t('billing.discount', { defaultValue: 'الخصم الممنوح' })}
                            value={discountAmount}
                            tone={discountAmount > 0 ? 'emerald' : 'slate'}
                            icon={Percent}
                        />
                    )}
                    <InvoiceMetric
                        label={t('billing.totalPaid', { defaultValue: 'المدفوع نقداً' })}
                        value={paidAmount}
                        tone="emerald"
                        icon={CheckCircle2}
                    />
                    <InvoiceMetric
                        label={category.insuranceCovered > 0 ? t('billing.patientPayable', { defaultValue: 'المتبقي من المريض' }) : t('billing.currentBalance', { defaultValue: 'الرصيد المستحق' })}
                        value={balanceAmount}
                        tone={balanceAmount > 0 ? 'amber' : 'emerald'}
                        icon={Banknote}
                        highlight
                    />
                </div>

                {/* Visual Payment Meter Progress Bar */}
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/30">
                    <div className="flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-slate-500">
                            <Clock3 size={13} />
                            <span>{t('billing.settlementStatus', { defaultValue: 'حالة سداد الفاتورة' })}</span>
                        </span>
                        <span className={`font-mono ${paidPct === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {paidPct}% {t('billing.settled', { defaultValue: 'مسدد' })} ({Number(paidAmount).toFixed(2)} / {Number(totalAmount).toFixed(2)} EGP)
                        </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                            className={`h-full transition-all duration-500 ${paidPct === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-teal-500 to-amber-500'}`}
                            style={{ width: `${paidPct}%` }}
                        />
                    </div>
                </div>
            </section>

            {/* Interactive Tab Switcher */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setActiveTab('items')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'items'
                        ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                >
                    <FileText size={14} />
                    <span>{t('billing.itemsBreakdown', { defaultValue: 'بنود الفاتورة والخدمات' })}</span>
                    <span className={`rounded-md px-1.5 py-0.2 font-mono text-[10px] ${activeTab === 'items' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                        {invoiceDetail?.items?.length || 0}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('payments')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'payments'
                        ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                >
                    <History size={14} />
                    <span>{t('billing.paymentHistory', { defaultValue: 'سجل الدفعات والإيصالات' })}</span>
                    <span className={`rounded-md px-1.5 py-0.2 font-mono text-[10px] ${activeTab === 'payments' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                        {invoiceDetail?.payments?.length || 0}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('clinical')}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${activeTab === 'clinical'
                        ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                >
                    <ShieldCheck size={14} />
                    <span>{t('billing.insuranceAndAudit', { defaultValue: 'التأمين والتدقيق المالي' })}</span>
                </button>
            </div>

            {/* Tab Contents */}
            <div className="min-h-[220px]">
                {activeTab === 'items' && (
                    <InvoiceItemsPanel invoiceDetail={invoiceDetail} isLoading={isLoading} t={t} />
                )}

                {activeTab === 'payments' && (
                    <InvoicePaymentsPanel
                        canRequestRefund={canRequestRefund}
                        invoice={invoice}
                        invoiceDetail={invoiceDetail}
                        isLoading={isLoading}
                        onOpenRefund={onOpenRefund}
                        t={t}
                    />
                )}

                {activeTab === 'clinical' && (
                    <InvoiceClinicalAuditPanel invoice={invoice} invoiceDetail={invoiceDetail} t={t} />
                )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col-reverse justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck size={14} className="text-teal-600 dark:text-teal-400" />
                    <span>{t('billing.certifiedLedger', { defaultValue: 'سجل مالي معتمد - نظام إدارة الفواتير والمقبوضات' })}</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => window.open(`/print/invoice/${invoice.invoice_id}`, '_blank')}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                        <Printer size={14} />
                        <span>{t('billing.print', { defaultValue: 'طباعة' })}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-10 w-full rounded-xl bg-slate-100 px-6 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:w-auto"
                    >
                        {t('close', { defaultValue: 'إغلاق' })}
                    </button>
                </div>
            </div>
        </div>
    );
};

const InvoiceMeta = ({ icon: Icon, value, suffix, mono }) => (
    <div className="flex min-w-0 items-center gap-1.5">
        <Icon size={14} className="shrink-0 text-slate-400" />
        <span className={`min-w-0 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
        {suffix && <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{suffix}</span>}
    </div>
);

const InvoiceMetric = ({ label, value, tone = 'slate', icon: Icon, highlight }) => {
    const toneClass = {
        slate: 'border-slate-200/90 bg-slate-50/70 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100',
        emerald: 'border-emerald-200/90 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
        amber: 'border-amber-200/90 bg-amber-50/70 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
    }[tone];

    return (
        <div className={`rounded-xl border p-3.5 transition-all shadow-sm ${toneClass} ${highlight ? 'ring-1 ring-amber-300/60 dark:ring-amber-900/40' : ''}`}>
            <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-black uppercase tracking-wider opacity-75">{label}</p>
                {Icon && <Icon size={14} className="opacity-60" />}
            </div>
            <p className="mt-1.5 font-mono text-xl font-black ltr-embed" dir="ltr">
                {Number(value || 0).toFixed(2)} <span className="text-xs font-semibold opacity-60">EGP</span>
            </p>
        </div>
    );
};

const InvoiceItemsPanel = ({ invoiceDetail, isLoading, t }) => (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <PanelTitle
            icon={FileText}
            title={t('billing.itemsBreakdown', { defaultValue: 'بنود الفاتورة والخدمات الطبية' })}
            count={invoiceDetail?.items?.length || 0}
            tone="indigo"
        />
        <div className="mt-3.5">
            {isLoading ? (
                <LoadingRows label={t('billing.loadingHistory', { defaultValue: 'جاري تحميل البنود...' })} />
            ) : invoiceDetail?.items?.length ? (
                <div className="space-y-2.5">
                    {invoiceDetail.items.map((item, idx) => {
                        const itemName = item.description || item.name || t('billing.standardService', { defaultValue: 'إجراء طبي سريري' });
                        const unitPrice = Number(item.unit_price ?? item.price ?? (item.total_amount && item.quantity ? Number(item.total_amount) / Number(item.quantity) : 0));
                        const qty = Number(item.quantity || 1);
                        const lineTotal = Number(item.total_amount ?? (unitPrice * qty));

                        return (
                            <div
                                key={item.item_id || idx}
                                className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition hover:border-teal-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex items-start gap-3 min-w-0">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100/70 font-mono text-xs font-black text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                        {idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-black text-slate-900 dark:text-white">{itemName}</p>
                                            {item.item_type && (
                                                <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                    {item.item_type}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                                            {item.code ? `كود: ${item.code}` : (item.description && item.description !== itemName ? item.description : t('billing.standardService', { defaultValue: 'إجراء طبي قياسي' }))}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-6 border-t border-slate-200/60 pt-2 sm:border-t-0 sm:pt-0">
                                    <div className="text-right">
                                        <span className="text-[10px] font-bold uppercase text-slate-400">
                                            {t('billing.rateQty', { defaultValue: 'السعر × الكمية' })}
                                        </span>
                                        <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300" dir="ltr">
                                            {unitPrice.toFixed(2)} × {qty.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="text-right min-w-[90px]">
                                        <span className="text-[10px] font-bold uppercase text-slate-400">
                                            {t('billing.netTotal', { defaultValue: 'الإجمالي الصافي' })}
                                        </span>
                                        <p className="font-mono text-base font-black text-slate-900 dark:text-white" dir="ltr">
                                            {lineTotal.toFixed(2)} <span className="text-xs font-bold text-slate-400">EGP</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="py-10 text-center">
                    <FileText size={32} className="mx-auto mb-2 text-slate-300 opacity-40" />
                    <p className="text-xs font-semibold text-slate-400">{t('billing.noInvoiceItems', { defaultValue: 'لا توجد بنود مسجلة في هذه الفاتورة' })}</p>
                </div>
            )}
        </div>
    </section>
);

const InvoicePaymentsPanel = ({ canRequestRefund, invoice, invoiceDetail, isLoading, onOpenRefund, t }) => (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <PanelTitle
            icon={History}
            title={t('billing.paymentHistory', { defaultValue: 'سجل الدفعات والإيصالات المسددة' })}
            count={invoiceDetail?.payments?.length || 0}
            tone="emerald"
        />
        <div className="mt-3.5 max-h-96 overflow-y-auto pe-1">
            {isLoading ? (
                <LoadingRows label={t('billing.loadingHistory', { defaultValue: 'جاري تحميل الدفعات...' })} />
            ) : invoiceDetail?.payments?.length ? (
                <div className="space-y-2.5">
                    {invoiceDetail.payments.map((payment) => {
                        const reserved = (invoiceDetail.refunds || [])
                            .filter((refund) => refund.payment_id === payment.payment_id && refund.status !== 'Rejected')
                            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
                        const refundable = Math.max(0, Number(payment.amount || 0) - reserved);
                        const canRefundPayment = canRequestRefund && payment.payment_status === 'Completed' && refundable > 0;

                        return (
                            <div
                                key={payment.payment_id}
                                className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition hover:border-emerald-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex items-start gap-3.5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                                        {payment.method === 'Cash' ? <Banknote size={18} className="text-emerald-600" /> : <CreditCard size={18} className="text-sky-600" />}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                                                {t(`billing.methods.${payment.method}`, { defaultValue: payment.method === 'Cash' ? 'نقدي' : payment.method })}
                                            </p>
                                            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                {payment.payment_status === 'Completed' ? 'مكتمل' : payment.payment_status}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-[11px] font-medium text-slate-500 ltr-embed" dir="ltr">
                                            {new Date(payment.transaction_date || payment.created_at).toLocaleString()}
                                        </p>
                                        {payment.payment_reference && (
                                            <p className="mt-1 font-mono text-[10px] font-semibold text-slate-400 ltr-embed" dir="ltr">
                                                REF: {payment.payment_reference}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 pt-2 sm:border-t-0 sm:pt-0">
                                    <div className="text-right">
                                        <span className="text-[10px] font-bold uppercase text-slate-400">
                                            {t('billing.amountPaid', { defaultValue: 'المبلغ المسدد' })}
                                        </span>
                                        <p className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums ltr-embed" dir="ltr">
                                            +{Number(payment.amount || 0).toFixed(2)} <span className="text-xs font-bold text-slate-400">EGP</span>
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => window.open(`/print/receipt/${payment.payment_id}`, '_blank')}
                                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-[10.5px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                            title={t('billing.printReceipt', { defaultValue: 'طباعة الإيصال' })}
                                        >
                                            <Printer size={12} />
                                            <span>{t('billing.receipt', { defaultValue: 'إيصال' })}</span>
                                        </button>

                                        {canRefundPayment && (
                                            <button
                                                type="button"
                                                onClick={() => onOpenRefund(invoice, payment)}
                                                className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 text-[10.5px] font-black text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
                                                title={t('billing.requestRefund', { defaultValue: 'طلب استرجاع' })}
                                            >
                                                <RotateCcw size={12} />
                                                <span>{t('billing.refund', { defaultValue: 'استرجاع' })}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex min-h-36 flex-col items-center justify-center text-center text-slate-400">
                    <AlertCircle size={26} className="mb-2 opacity-30" />
                    <p className="text-sm font-medium">{t('billing.noPaymentHistory', { defaultValue: 'لا توجد دفعات مسجلة لهذه الفاتورة حتى الآن.' })}</p>
                </div>
            )}
        </div>
    </section>
);

const InvoiceClinicalAuditPanel = ({ invoice, invoiceDetail, t }) => {
    const activeInv = invoiceDetail?.invoice_id === invoice?.invoice_id ? { ...invoice, ...invoiceDetail } : invoice;
    const category = getInvoiceCoverageCategory(activeInv);
    const checklist = getContractRequirementsChecklist(category);

    return (
        <section className="space-y-4">
            {/* Case Type Classification & Verification Summary */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <PanelTitle
                    icon={ShieldCheck}
                    title={t('billing.insuranceAndAudit', { defaultValue: 'التأمين والتعاقدات والتدقيق المالي' })}
                    tone="teal"
                />

                {/* Case Type Header Banner */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-500">{t('billing.caseType', { defaultValue: 'تصنيف الحالة:' })}</span>
                        {category.type === 'insurance' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-0.5 text-xs font-black text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                <ShieldCheck size={13} />
                                <span>{category.labelAr || 'تأمين صحي'}{category.providerName ? ` · ${category.providerName}` : ''}</span>
                            </span>
                        )}
                        {category.type === 'contract' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-black text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                                <Building2 size={13} />
                                <span>{category.labelAr || 'تعاقد جهة / نقابة'}{category.providerName ? ` · ${category.providerName}` : ''}</span>
                            </span>
                        )}
                        {category.type === 'self_pay' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-0.5 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <User size={13} />
                                <span>{category.labelAr || 'حساب خاص (نقدي)'}</span>
                            </span>
                        )}
                    </div>

                    {category.insuranceCovered > 0 && (
                        <div className="flex items-center gap-3 font-mono text-xs">
                            <span className="text-teal-700 dark:text-teal-300 font-bold">
                                {t('billing.covered', { defaultValue: 'المغطى:' })} {category.insuranceCovered.toFixed(2)} EGP
                            </span>
                            <span className="text-amber-700 dark:text-amber-300 font-bold">
                                {t('billing.patientCopay', { defaultValue: 'تحمل المريض:' })} {category.patientPayable.toFixed(2)} EGP
                            </span>
                        </div>
                    )}
                </div>

                {/* Details Grid */}
                <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-bold text-xs">
                            <Building2 size={15} className="text-teal-600" />
                            <span>{t('billing.providerDetails', { defaultValue: 'بيانات جهة التأمين / التعاقد' })}</span>
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <p><span className="font-semibold text-slate-400">{t('billing.payer', { defaultValue: 'الجهة / الشركة:' })}</span> {category.providerName || activeInv.insurance_provider || t('billing.selfPayDirect', { defaultValue: 'حساب خاص مباشر' })}</p>
                            <p><span className="font-semibold text-slate-400">{t('billing.policyNo', { defaultValue: 'رقم الوثيقة / العقد:' })}</span> <span className="font-mono">{category.policyNumber || activeInv.policy_number || 'N/A'}</span></p>
                            <p><span className="font-semibold text-slate-400">{t('billing.memberNo', { defaultValue: 'رقم الكارنيه / العضوية:' })}</span> <span className="font-mono">{category.memberNumber || activeInv.member_number || 'N/A'}</span></p>
                            <p><span className="font-semibold text-slate-400">{t('billing.planClass', { defaultValue: 'الفئة / الخطة:' })}</span> {category.planName || activeInv.plan_name || 'Standard'}</p>
                            {activeInv.preauth_code && <p><span className="font-semibold text-slate-400">{t('billing.preauthCode', { defaultValue: 'كود الموافقة المسبقة:' })}</span> <span className="font-mono font-bold text-teal-700 dark:text-teal-300">{activeInv.preauth_code}</span></p>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-bold text-xs">
                            <Stethoscope size={15} className="text-teal-600" />
                            <span>{t('billing.clinicalContext', { defaultValue: 'البيانات الإكلينيكية والطلب' })}</span>
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <p><span className="font-semibold text-slate-400">{t('billing.referringDoctor', { defaultValue: 'الطبيب المعالج:' })}</span> {activeInv?.referring_doctor_name || t('billing.directClinic', { defaultValue: 'عيادة مباشرة' })}</p>
                            <p><span className="font-semibold text-slate-400">{t('billing.orderNo', { defaultValue: 'رقم أمر الفحص:' })}</span> <span className="font-mono">{activeInv.order_number || 'N/A'}</span></p>
                            <p><span className="font-semibold text-slate-400">{t('billing.issuedBy', { defaultValue: 'أنشئت بواسطة:' })}</span> {activeInv.created_by_name || t('billing.frontDesk', { defaultValue: 'موظف الاستقبال' })}</p>
                            <p><span className="font-semibold text-slate-400">{t('billing.createdAt', { defaultValue: 'تاريخ الإنشاء:' })}</span> <span className="font-mono">{new Date(activeInv.created_at || Date.now()).toLocaleString()}</span></p>
                        </div>
                    </div>
                </div>

                {/* Insurance / Contract Compliance Checklist */}
                {checklist.length > 0 && (
                    <div className="mt-3.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-2">
                            {t('billing.requirementsChecklist', { defaultValue: 'قائمة التحقق من متطلبات ومستندات التأمين والتعاقد' })}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {checklist.map((item) => (
                                <div key={item.id} className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-2.5 dark:bg-emerald-950/20 text-xs">
                                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">{item.labelAr || item.labelEn}</p>
                                        <p className="text-[11px] text-slate-500">{item.hintAr || item.hintEn}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

const PanelTitle = ({ icon: Icon, title, count, tone = 'teal' }) => {
    const toneClass = tone === 'emerald'
        ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60'
        : 'bg-teal-50 text-teal-600 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60';
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm ${toneClass}`}>
                    <Icon size={16} />
                </span>
                <p className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{title}</p>
            </div>
            {typeof count === 'number' && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-lg bg-slate-100 px-2 text-[10.5px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {count}
                </span>
            )}
        </div>
    );
};

const LoadingRows = ({ label }) => (
    <div className="space-y-2 py-2">
        <p className="sr-only">{label}</p>
        {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
    </div>
);

export default BillingTab;
