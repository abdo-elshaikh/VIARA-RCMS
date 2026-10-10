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
    ChevronLeft,
    ChevronRight,
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
    Landmark,
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
    Wallet,
    List, LayoutGrid,
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
import { getInvoiceCoverageCategory, getContractRequirementsChecklist, toLocalDateInput, shiftLocalDateInput } from './receptionLogic';
import Pagination from '../ui/Pagination';
import { getPaginationState } from '../../utils/pagination';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { escapeHtml } from '../../utils/financialReportExport';
import { generateUUID } from '../../utils/uuid';
import { selectCurrentUser } from '../../store/authSlice';
import { getEffectivePermissions } from '../../utils/effectivePermissions';
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

const LoadingRows = ({ label }) => (
    <div className="space-y-2" role="status" aria-live="polite">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-1.5">
                    <span className="block h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <span className="block h-2.5 w-1/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                </div>
                <span className="h-3 w-14 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
        ))}
    </div>
);

const BillingTab = ({ selectedDate: propSelectedDate, receptionShift, currentUserId = null, receptionScope = 'all', onOpenPayment }) => {
    const { t, i18n } = useTranslation('reception');
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectCurrentUser);
    const isRtl = i18n?.language?.startsWith('ar');

    const [activeDate, setActiveDate] = useState(() => propSelectedDate || toLocalDateInput());

    useEffect(() => {
        if (propSelectedDate) {
            setActiveDate(propSelectedDate);
        }
    }, [propSelectedDate]);

    const permissions = getEffectivePermissions(user);
    const canCollect = user?.role === 'Developer' || permissions.has('PROCESS_PAYMENTS');
    const canReconcile = user?.role === 'Developer' || permissions.has('RECONCILE_SHIFTS');
    const canRequestRefund = user?.role === 'Developer' || permissions.has('REQUEST_REFUNDS');
    const canApproveRefund = user?.role === 'Developer' || permissions.has('APPROVE_REFUNDS');
    const canProcessRefund = user?.role === 'Developer' || permissions.has('PROCESS_REFUNDS');
    const canAppendSupplies = user?.role === 'Developer' || permissions.has('CONSUME_INVENTORY');
    const userId = user?.id || user?.user_id;

    const invoiceSummaryParams = useMemo(() => ({
        date: activeDate,
    }), [activeDate]);

    const { data: invoiceSummary, isError: isSummaryError, refetch: refetchSummary } = useGetInvoiceSummaryQuery(invoiceSummaryParams, { pollingInterval: 30000, skipPollingIfUnfocused: true });
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
        date: activeDate,
        q: debouncedSearchTerm.trim() || undefined,
        status: !['All', 'Open'].includes(statusFilter) ? statusFilter : undefined,
        openOnly: statusFilter === 'Open' ? 'true' : undefined,
        includeMeta: 'true',
        sortBy: sortField,
        sortDirection,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
    }), [activeDate, currentPage, debouncedSearchTerm, pageSize, sortDirection, sortField, statusFilter]);
    const {
        data: invoicePage,
        isLoading,
        isFetching,
        isError: isInvoicesError,
        refetch,
    } = useGetInvoicesQuery(invoiceQueryParams, { pollingInterval: 30000, skipPollingIfUnfocused: true });
    const invoices = invoicePage?.items || EMPTY_INVOICES;
    const filteredInvoiceCount = Number(invoicePage?.meta?.total || 0);

    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [printInvoice, setPrintInvoice] = useState(null);
    const [printLang, setPrintLang] = useState('both');
    const [refundTarget, setRefundTarget] = useState(null);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundMethod, setRefundMethod] = useState('Cash');
    const [refundReasonCode, setRefundReasonCode] = useState('');
    const [refundReason, setRefundReason] = useState('');
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewReason, setReviewReason] = useState('');
    const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => generateUUID());
    const [supplyExamId, setSupplyExamId] = useState(null);
    const [activeSubTab, setActiveSubTab] = useState('invoices');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [viewMode, setViewMode] = useState('table');
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
        { skip: !canApproveRefund, pollingInterval: 30000, skipPollingIfUnfocused: true }
    );
    const { data: refundsForProcessing = [], isFetching: isLoadingProcessing } = useGetRefundsQuery(
        { status: 'Approved', limit: '100' },
        { skip: !canProcessRefund, pollingInterval: 30000, skipPollingIfUnfocused: true }
    );
    const { data: failedRefunds = [], isFetching: isLoadingFailed } = useGetRefundsQuery(
        { status: 'Failed', limit: '100' },
        { skip: !canApproveRefund, pollingInterval: 30000, skipPollingIfUnfocused: true }
    );
    const pendingRefunds = useMemo(() => [
        ...refundsForApproval,
        ...refundsForProcessing.filter((refund) => !refundsForApproval.some((item) => item.refund_id === refund.refund_id)),
        ...failedRefunds.filter((refund) => !refundsForApproval.some((item) => item.refund_id === refund.refund_id)
            && !refundsForProcessing.some((item) => item.refund_id === refund.refund_id)),
    ], [failedRefunds, refundsForApproval, refundsForProcessing]);
    const isLoadingRefunds = isLoadingApprovals || isLoadingProcessing || isLoadingFailed;
    const { data: cashierData } = useGetCashierReconciliationQuery(
        { cashierId: userId },
        { skip: !userId || (!canCollect && !canReconcile) }
    );
    const currentShift = cashierData?.data?.find((shift) => ['Open', 'Active'].includes(shift.status));

    const { data: invoiceDetail, isFetching: isLoadingInvoiceDetail } = useGetInvoiceQuery(
        selectedInvoice?.invoice_id,
        { skip: !selectedInvoice?.invoice_id }
    );

    const handleOpenPayment = (invoice) => {
        if (!invoice || !onOpenPayment) return;
        setSelectedInvoice(null);
        onOpenPayment(invoice);
    };

    // Reset pagination to page 1 on filter/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, categoryFilter, pageSize]);

    const filteredInvoices = useMemo(() => {
        let list = invoices;

        if (receptionScope === 'mine') {
            list = list.filter((inv) => {
                const assignedTo = inv.receptionist_id ?? inv.assigned_receptionist_id ?? inv.receptionistId ?? inv.assignee_id ?? inv.appointment?.receptionist_id;
                return assignedTo !== null && assignedTo !== undefined && String(assignedTo) === String(currentUserId);
            });
        } else if (receptionScope === 'unclaimed') {
            list = list.filter((inv) => {
                const assignedTo = inv.receptionist_id ?? inv.assigned_receptionist_id ?? inv.receptionistId ?? inv.assignee_id ?? inv.appointment?.receptionist_id;
                return !assignedTo;
            });
        }

        if (categoryFilter === 'all') return list;
        if (categoryFilter === 'selfPay') {
            return list.filter((inv) => getInvoiceCoverageCategory(inv).type === 'self_pay');
        }
        if (categoryFilter === 'insurance') {
            return list.filter((inv) => {
                const cat = getInvoiceCoverageCategory(inv);
                return cat.type === 'insurance' || cat.type === 'contract';
            });
        }
        if (categoryFilter === 'urgent') {
            return list.filter((inv) => inv.priority === 'Urgent' || inv.priority === 'Emergency');
        }
        return list;
    }, [categoryFilter, currentUserId, invoices, receptionScope]);

    const insuranceInvoices = useMemo(() => {
        return invoices.filter((inv) => {
            const cat = getInvoiceCoverageCategory(inv);
            return cat.type === 'insurance' || cat.type === 'contract';
        });
    }, [invoices]);

    const selfPayInvoicesCount = useMemo(() => {
        return invoices.filter((inv) => getInvoiceCoverageCategory(inv).type === 'self_pay').length;
    }, [invoices]);

    const insuranceKpis = useMemo(() => {
        let billed = 0;
        let copay = 0;
        let insuranceShare = 0;
        insuranceInvoices.forEach((inv) => {
            const tot = Number(inv.total_amount || 0);
            const pt = Number(inv.patient_payable_amount ?? tot);
            billed += tot;
            copay += pt;
            insuranceShare += Math.max(0, tot - pt);
        });
        return {
            count: insuranceInvoices.length,
            billed,
            copay,
            insuranceShare,
        };
    }, [insuranceInvoices]);

    const paginationState = useMemo(() => {
        return getPaginationState(filteredInvoiceCount, currentPage, pageSize);
    }, [currentPage, filteredInvoiceCount, pageSize]);

    useEffect(() => {
        if (currentPage !== paginationState.currentPage) {
            setCurrentPage(paginationState.currentPage);
        }
    }, [currentPage, paginationState.currentPage]);

    const paginatedInvoices = filteredInvoices;

    const kpis = useMemo(() => {
        if (invoiceSummary) {
            const grossBilled = Number(invoiceSummary.gross_billed || 0);
            const collected = Number(invoiceSummary.collected || 0);
            const byMethodRaw = invoiceSummary.by_method || {};
            const byMethod = Object.fromEntries(
                Object.entries(byMethodRaw).map(([method, total]) => [method, Number(total || 0)])
            );
            const rails = {
                cash: byMethod.Cash || 0,
                card: (byMethod.Card || 0) + (byMethod['Credit Card'] || 0),
                wallet: (byMethod.Wallet || 0) + (byMethod['Bank Transfer'] || 0) + (byMethod.Installment || 0) + (byMethod.Corporate || 0),
            };
            const hasMethodBreakdown = Object.keys(byMethodRaw).length > 0;
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
                rails,
                hasMethodBreakdown,
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
            rails: null,
            hasMethodBreakdown: false,
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

    const handlePrintDailyStatement = () => {
        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (!printWindow) {
            toast.error(t('billing.printFailed', { defaultValue: 'تعذر فتح نافذة الطباعة' }));
            return;
        }
        const grossBilled = kpis.grossBilled;
        const discounts = kpis.discounts;
        const netRevenue = grossBilled - discounts;
        const collected = kpis.collected;
        const outstanding = kpis.outstanding;
        const efficiency = kpis.collectionRate;

        const html = `
            <!DOCTYPE html>
            <html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
            <head>
                <meta charset="utf-8" />
                <title>${t('billing.statement.title', { defaultValue: 'كشف الإقفال والتسوية المالية اليومية' })} - ${activeDate}</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #0f172a; margin: 0; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px; }
                    .header h1 { margin: 0; font-size: 20px; color: #0f172a; font-weight: 900; }
                    .header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
                    .badge { display: inline-block; padding: 4px 10px; background: #f0fdfa; color: #0f766e; border: 1px solid #99f6e4; border-radius: 9999px; font-size: 11px; font-weight: bold; }
                    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
                    .metric-box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; background: #f8fafc; }
                    .metric-label { font-size: 10.5px; color: #64748b; font-weight: bold; text-transform: uppercase; }
                    .metric-value { font-size: 17px; font-weight: 900; color: #0f172a; margin-top: 4px; font-family: monospace; }
                    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
                    th { background: #f1f5f9; padding: 8px 12px; text-align: ${isRtl ? 'right' : 'left'}; font-weight: 800; border-bottom: 1px solid #cbd5e1; font-size: 11px; }
                    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; }
                    .signatures { display: flex; justify-content: space-between; margin-top: 48px; padding-top: 24px; border-top: 1px dashed #cbd5e1; }
                    .sig-block { width: 40%; text-align: center; }
                    .sig-line { margin-top: 40px; border-top: 1px solid #94a3b8; }
                    @media print { body { padding: 16px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1>VIARA Medical Imaging - ${t('billing.statement.title', { defaultValue: 'كشف الإقفال والتسوية المالية اليومية' })}</h1>
                        <p>${t('billing.selectedDateScope', { defaultValue: 'بيانات يوم:' })} <strong>${activeDate}</strong> | ${new Date().toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US')}</p>
                    </div>
                    <div class="badge">
                        ${receptionShift ? (isRtl ? 'الوردية نشطة' : 'Shift Active') : (isRtl ? 'كشف يومي مجمع' : 'Daily Consolidated')}
                    </div>
                </div>

                <div class="grid">
                    <div class="metric-box">
                        <div class="metric-label">${t('billing.statement.grossRevenue', { defaultValue: 'إجمالي المبيعات' })}</div>
                        <div class="metric-value">${grossBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">${t('billing.statement.totalDiscounts', { defaultValue: 'إجمالي الخصومات' })}</div>
                        <div class="metric-value">${discounts.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div>
                    </div>
                    <div class="metric-box">
                        <div class="metric-label">${t('billing.statement.netRevenue', { defaultValue: 'صافي الإيراد الفعلي' })}</div>
                        <div class="metric-value">${netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div>
                    </div>
                    <div class="metric-box" style="background:#f0fdf4; border-color:#bbf7d0;">
                        <div class="metric-label" style="color:#15803d;">${t('billing.statement.totalCollected', { defaultValue: 'المتحصل الفعلي' })}</div>
                        <div class="metric-value" style="color:#166534;">${collected.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div>
                    </div>
                    <div class="metric-box" style="background:#fffbeb; border-color:#fef3c7;">
                        <div class="metric-label" style="color:#b45309;">${t('billing.statement.totalReceivables', { defaultValue: 'الذمم المدينة والأرصدة المعلقة' })}</div>
                        <div class="metric-value" style="color:#92400e;">${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</div>
                    </div>
                    <div class="metric-box" style="background:#f0fdfa; border-color:#99f6e4;">
                        <div class="metric-label" style="color:#0f766e;">${t('billing.statement.collectionEfficiency', { defaultValue: 'معدل كفاءة التحصيل' })}</div>
                        <div class="metric-value" style="color:#115e59;">${efficiency}%</div>
                    </div>
                </div>

                <h3 style="margin-top:24px; font-size:13px; font-weight:800; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
                    ${t('billing.statement.closingSummary', { defaultValue: 'ملخص فواتير اليوم' })} (${invoices.length})
                </h3>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>${t('billing.invoiceNo', { defaultValue: 'رقم الفاتورة' })}</th>
                            <th>${t('billing.patient', { defaultValue: 'المريض' })}</th>
                            <th style="text-align:end;">${t('billing.total', { defaultValue: 'الإجمالي' })}</th>
                            <th style="text-align:end;">${t('billing.paid', { defaultValue: 'المدفوع' })}</th>
                            <th style="text-align:end;">${t('billing.balance', { defaultValue: 'المتبقي' })}</th>
                            <th style="text-align:center;">${t('billing.status', { defaultValue: 'الحالة' })}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.slice(0, 50).map((inv, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td><strong>${escapeHtml(inv.invoice_number)}</strong></td>
                                <td>${escapeHtml(inv.patient_name)}</td>
                                <td style="text-align:end; font-family:monospace;">${Number(inv.patient_payable_amount ?? inv.total_amount ?? 0).toFixed(2)}</td>
                                <td style="text-align:end; font-family:monospace; color:#16a34a;">${Number(inv.paid_amount || 0).toFixed(2)}</td>
                                <td style="text-align:end; font-family:monospace; color:${Number(inv.balance_amount || 0) > 0 ? '#d97706' : '#64748b'}; font-weight:bold;">${Number(inv.balance_amount || 0).toFixed(2)}</td>
                                <td style="text-align:center;">${escapeHtml(inv.invoice_status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="signatures">
                    <div class="sig-block">
                        <p><strong>${isRtl ? 'مسؤول الخزينة / أمين الصندوق' : 'Cashier Officer'}</strong></p>
                        <p style="font-size:11px; color:#64748b;">${escapeHtml(user?.name || user?.username || (isRtl ? 'أمين الصندوق المناوب' : 'Duty Cashier'))}</p>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-block">
                        <p><strong>${isRtl ? 'المشرف المالي / إدارة الحسابات' : 'Financial Supervisor'}</strong></p>
                        <p style="font-size:11px; color:#64748b;">${isRtl ? 'الاعتماد والمطابقة' : 'Audit & Verification'}</p>
                        <div class="sig-line"></div>
                    </div>
                </div>

                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `;
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const openRefund = (invoice, payment) => {
        const reserved = (invoiceDetail?.refunds || [])
            .filter((refund) => refund.payment_id === payment.payment_id && !['Rejected', 'Failed'].includes(refund.status))
            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
        const available = Math.max(0, Number(payment.amount || 0) - reserved);
        setRefundTarget({ invoice, payment, available });
        setRefundAmount(available.toFixed(2));
        // Refunds must leave through the payment rail they arrived on — the
        // backend enforces this; the field is informational and locked.
        setRefundMethod(payment.method || 'Cash');
        setRefundReasonCode('');
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
                reasonCode: refundReasonCode || undefined,
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
            toast.success(t(reviewTarget.status === 'Approved' ? 'billing.refundApproved' : (reviewTarget.status === 'Processed' ? 'billing.refundProcessed' : (reviewTarget.status === 'Failed' ? 'billing.refundMarkedFailed' : 'billing.refundRejected'))));
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
        <div className="space-y-3">
            {(isInvoicesError || isSummaryError) && (
                <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                    <AlertTriangle size={17} />
                    {t('billing.loadError', { defaultValue: 'Invoice data could not be loaded. Totals are unavailable until refresh succeeds.' })}
                </div>
            )}
            {/* Finance command deck */}
            <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.45)]">
                <div className="border-b border-[var(--VIARA-line)] bg-gradient-to-br from-teal-500/[0.06] via-[var(--VIARA-surface)] to-cyan-500/[0.03] px-4 py-3.5 sm:px-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-600/20">
                                <Receipt size={18} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-black text-[var(--VIARA-ink)] sm:text-lg">{t('billing.title')}</h2>
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9.5px] font-black text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                        {isRtl ? 'بيانات مباشرة' : 'Live'}
                                    </span>
                                    {isFetching && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />}
                                </div>
                                <p className="mt-0.5 truncate text-xs font-medium text-[var(--VIARA-muted)]">{t('billing.subtitle')}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex h-9 items-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveDate((prev) => shiftLocalDateInput(prev, -1))}
                                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface)] hover:text-[var(--VIARA-ink)]"
                                    title={t('billing.prevDay', { defaultValue: isRtl ? 'اليوم السابق' : 'Previous day' })}
                                >
                                    <ChevronRight size={14} className={isRtl ? '' : 'rotate-180'} />
                                </button>
                                <input
                                    type="date"
                                    value={activeDate}
                                    onChange={(e) => e.target.value && setActiveDate(e.target.value)}
                                    className="h-8 border-0 bg-transparent px-1.5 text-xs font-black text-[var(--VIARA-ink)] outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setActiveDate((prev) => shiftLocalDateInput(prev, 1))}
                                    className="grid h-8 w-8 place-items-center rounded-lg text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface)] hover:text-[var(--VIARA-ink)]"
                                    title={t('billing.nextDay', { defaultValue: isRtl ? 'اليوم التالي' : 'Next day' })}
                                >
                                    <ChevronLeft size={14} className={isRtl ? '' : 'rotate-180'} />
                                </button>
                            </div>

                            {activeDate !== toLocalDateInput() && (
                                <button type="button" onClick={() => setActiveDate(toLocalDateInput())} className="h-9 rounded-xl border border-teal-200 bg-teal-50 px-3 text-[11px] font-black text-teal-700 transition hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300">
                                    {t('billing.goToToday', { defaultValue: isRtl ? 'اليوم' : 'Today' })}
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => Promise.all([refetch(), refetchSummary()])}
                                disabled={isFetching}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-[11px] font-black text-[var(--VIARA-muted)] transition hover:text-teal-700 disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                                <span className="hidden sm:inline">{isRtl ? 'تحديث' : 'Refresh'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={exportInvoicesCsv}
                                disabled={isExporting}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[11px] font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                            >
                                <Download size={13} />
                                <span className="hidden sm:inline">{isExporting ? t('billing.exporting', { defaultValue: '...' }) : (isRtl ? 'تصدير' : 'Export')}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Operational finance snapshot */}
                <div className="grid grid-cols-2 gap-px bg-[var(--VIARA-line)] lg:grid-cols-4">
                    <FinanceSnapshot
                        icon={Banknote}
                        label={t('billing.totalCollected')}
                        value={kpis.collected}
                        tone="emerald"
                        active={statusFilter === 'Paid'}
                        onClick={() => setStatusFilter(statusFilter === 'Paid' ? 'All' : 'Paid')}
                    />
                    <FinanceSnapshot
                        icon={Clock3}
                        label={t('billing.totalOutstanding')}
                        value={kpis.outstanding}
                        tone="amber"
                        active={statusFilter === 'Open'}
                        onClick={() => setStatusFilter(statusFilter === 'Open' ? 'All' : 'Open')}
                    />
                    <FinanceSnapshot
                        icon={Receipt}
                        label={t('billing.invoiceCount')}
                        value={Number(invoiceSummary?.total_count || filteredInvoiceCount)}
                        money={false}
                        sub={`${kpis.collectionRate}% ${isRtl ? 'تحصيل' : 'collection'}`}
                        tone="teal"
                        active={statusFilter === 'All'}
                        onClick={() => setStatusFilter('All')}
                    />
                    <FinanceSnapshot
                        icon={RotateCcw}
                        label={isRtl ? 'استردادات تحتاج إجراء' : 'Refunds requiring action'}
                        value={pendingRefunds.length}
                        money={false}
                        sub={(receptionShift || currentShift)?.status ? `${isRtl ? 'الوردية' : 'Shift'}: ${(receptionShift || currentShift).status}` : undefined}
                        tone={pendingRefunds.length ? 'rose' : 'slate'}
                        onClick={() => setActiveSubTab('refunds')}
                        active={activeSubTab === 'refunds'}
                    />
                </div>

                {/* Primary billing navigation */}
                <div className="flex flex-col gap-2 border-t border-[var(--VIARA-line)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-[var(--VIARA-surface-muted)] p-0.5" aria-label={isRtl ? 'أقسام الفوترة' : 'Billing sections'}>
                        {[
                            { id: 'invoices', icon: FileText, label: t('billing.subTabs.invoices', { defaultValue: isRtl ? 'الفواتير' : 'Invoices' }), count: filteredInvoiceCount },
                            { id: 'refunds', icon: RotateCcw, label: t('billing.subTabs.refunds', { defaultValue: isRtl ? 'الاستردادات' : 'Refunds' }), count: pendingRefunds.length },
                            { id: 'insurance', icon: Building2, label: t('billing.subTabs.insurance', { defaultValue: isRtl ? 'التأمين' : 'Insurance' }), count: insuranceInvoices.length },
                            { id: 'statement', icon: Receipt, label: t('billing.subTabs.statement', { defaultValue: isRtl ? 'كشف الإغلاق' : 'Closing statement' }) },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const active = activeSubTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveSubTab(tab.id)}
                                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition ${active ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm dark:text-teal-300' : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}
                                >
                                    <Icon size={13} />
                                    <span>{tab.label}</span>
                                    {tab.count !== undefined && (
                                        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${active ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300' : 'bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'}`}>{tab.count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {activeSubTab === 'invoices' && (
                        <div className="inline-flex shrink-0 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-0.5">
                            <button type="button" onClick={() => setViewMode('table')} title={isRtl ? 'جدول' : 'Table'} aria-label={isRtl ? 'جدول' : 'Table'} className={`h-8 rounded-lg px-2.5 text-[10.5px] font-black transition ${viewMode === 'table' ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm' : 'text-[var(--VIARA-muted)]'}`}><List size={14} /></button>
                            <button type="button" onClick={() => setViewMode('cards')} title={isRtl ? 'بطاقات' : 'Cards'} aria-label={isRtl ? 'بطاقات' : 'Cards'} className={`h-8 rounded-lg px-2.5 text-[10.5px] font-black transition ${viewMode === 'cards' ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm' : 'text-[var(--VIARA-muted)]'}`}><LayoutGrid size={14} /></button>
                        </div>
                    )}
                </div>
            </section>

            {/* TAB 1: Invoices Explorer */}
            {activeSubTab === 'invoices' && (
                <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_16px_42px_-34px_rgba(15,23,42,.4)]">
                    {/* One-line invoice command bar */}
                    <div className="border-b border-[var(--VIARA-line)] p-3 sm:p-4">
                        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
                            <label className="relative min-w-0 flex-1 xl:max-w-xl">
                                <span className="sr-only">{t('billing.searchPlaceholder')}</span>
                                <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400" />
                                <input
                                    type="search"
                                    placeholder={t('billing.searchPlaceholder', { defaultValue: isRtl ? 'رقم الفاتورة، اسم المريض، MRN أو الطلب...' : 'Invoice #, patient, MRN or order...' })}
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    className="h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] ps-10 pe-10 text-sm font-bold text-[var(--VIARA-ink)] outline-none transition placeholder:font-medium placeholder:text-[var(--VIARA-muted)] focus:border-teal-500 focus:bg-[var(--VIARA-surface)] focus:ring-4 focus:ring-teal-500/10"
                                />
                                {searchTerm && (
                                    <button type="button" onClick={() => setSearchTerm('')} className="absolute end-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface)]">
                                        <X size={13} />
                                    </button>
                                )}
                            </label>

                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 xl:justify-end">
                                {[
                                    { id: 'all', label: isRtl ? 'الكل' : 'All', count: invoices.length },
                                    { id: 'selfPay', label: t('billing.categories.selfPay', { defaultValue: isRtl ? 'حساب خاص' : 'Self-Pay' }), count: selfPayInvoicesCount },
                                    { id: 'insurance', label: t('billing.categories.insurance', { defaultValue: isRtl ? 'تأمين' : 'Insurance' }), count: insuranceInvoices.length },
                                    { id: 'urgent', label: t('billing.categories.urgent', { defaultValue: isRtl ? 'عاجل' : 'Urgent' }) },
                                ].map((cat) => {
                                    const active = categoryFilter === cat.id;
                                    return (
                                        <button key={cat.id} type="button" onClick={() => setCategoryFilter(cat.id)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[10.5px] font-black transition ${active ? 'border-teal-500 bg-teal-600 text-white shadow-sm' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-teal-300 hover:text-[var(--VIARA-ink)]'}`}>
                                            <span>{cat.label}</span>
                                            {cat.count !== undefined && <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${active ? 'bg-white/15' : 'bg-[var(--VIARA-surface-muted)]'}`}>{cat.count}</span>}
                                        </button>
                                    );
                                })}

                                <label className="relative">
                                    <span className="sr-only">{t('billing.status', { defaultValue: 'Status' })}</span>
                                    <Filter size={12} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--VIARA-muted)]" />
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="h-9 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ps-7 pe-7 text-[10.5px] font-black text-[var(--VIARA-ink)] outline-none transition focus:border-teal-500"
                                    >
                                        {filterChips.map((chip) => <option key={chip.id} value={chip.id}>{chip.label}{chip.count !== undefined ? ` (${chip.count})` : ''}</option>)}
                                    </select>
                                </label>

                                {(searchTerm || statusFilter !== 'All' || categoryFilter !== 'all') && (
                                    <button
                                        type="button"
                                        onClick={() => { setSearchTerm(''); setStatusFilter('All'); setCategoryFilter('all'); }}
                                        className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-[10.5px] font-black text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
                                    >
                                        <X size={12} />
                                        {isRtl ? 'مسح' : 'Clear'}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-bold text-[var(--VIARA-muted)]">
                            <span>{isRtl ? `عرض ${filteredInvoices.length} من ${filteredInvoiceCount} فاتورة` : `Showing ${filteredInvoices.length} of ${filteredInvoiceCount} invoices`}</span>
                            {statusFilter !== 'All' && (
                                <span className="rounded-lg bg-teal-500/10 px-2 py-0.5 text-teal-700 dark:text-teal-300">{filterChips.find((chip) => chip.id === statusFilter)?.label}</span>
                            )}
                        </div>
                    </div>

                    <div className="min-h-[340px]">
                        {isLoading ? (
                            <div className="p-4"><LoadingRows label={t('billing.loading')} /></div>
                        ) : paginatedInvoices.length === 0 ? (
                            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
                                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]"><Receipt size={21} /></span>
                                <p className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">{t('billing.noInvoices')}</p>
                                <p className="mt-1 text-xs text-[var(--VIARA-muted)]">{isRtl ? 'غيّر البحث أو الفلاتر لعرض نتائج أخرى.' : 'Adjust search or filters to see other results.'}</p>
                                {(searchTerm || statusFilter !== 'All' || categoryFilter !== 'all') && (
                                    <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('All'); setCategoryFilter('all'); }} className="mt-3 inline-flex h-8 items-center gap-1 rounded-xl bg-teal-500/10 px-3 text-[10.5px] font-black text-teal-700 dark:text-teal-300">
                                        <RotateCcw size={12} />
                                        {isRtl ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
                                    </button>
                                )}
                            </div>
                        ) : viewMode === 'table' ? (
                            <InvoiceTable
                                invoices={paginatedInvoices}
                                canCollect={canCollect}
                                isDownloading={isDownloading}
                                onCollect={handleOpenPayment}
                                onPrint={setPrintInvoice}
                                onSelect={setSelectedInvoice}
                                onSort={handleSort}
                                sortField={sortField}
                                sortDirection={sortDirection}
                                t={t}
                            />
                        ) : (
                            <InvoiceCardsGrid
                                invoices={paginatedInvoices}
                                canCollect={canCollect}
                                isDownloading={isDownloading}
                                onCollect={handleOpenPayment}
                                onPrint={setPrintInvoice}
                                onSelect={setSelectedInvoice}
                                t={t}
                            />
                        )}
                    </div>

                    {filteredInvoiceCount > 0 && (
                        <footer className="flex flex-col items-center justify-between gap-3 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/40 px-4 py-2.5 sm:flex-row sm:px-5">
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-[var(--VIARA-muted)]">
                                <span>{t('pagination.showing', { from: paginationState.startIndex + 1, to: paginationState.endIndex, total: filteredInvoiceCount, defaultValue: `${paginationState.startIndex + 1}–${paginationState.endIndex} / ${filteredInvoiceCount}` })}</span>
                                <label className="inline-flex items-center gap-1.5">
                                    <span>{t('pagination.perPage', { defaultValue: isRtl ? 'في الصفحة:' : 'Rows:' })}</span>
                                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-7 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 text-xs font-black text-[var(--VIARA-ink)] outline-none focus:border-teal-500">
                                        {PAGE_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </label>
                            </div>
                            <Pagination currentPage={paginationState.currentPage} pageCount={paginationState.pageCount} onPageChange={setCurrentPage} isRtl={isRtl} />
                        </footer>
                    )}
                </section>
            )}

            {/* TAB 2: Refunds & Reversals Hub */}
            {activeSubTab === 'refunds' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-amber-800 dark:text-amber-300">{t('billing.refundApprovalQueue', { defaultValue: 'قائمة اعتماد الاستردادات' })}</span>
                                <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">{refundsForApproval.length}</span>
                            </div>
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t('billing.refundApprovalQueueHelp', { defaultValue: 'طلبات معلقة بانتظار موافقة المشرف المالي' })}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">{t('billing.processRefund', { defaultValue: 'جاهز للصرف من الخزينة' })}</span>
                                <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">{refundsForProcessing.length}</span>
                            </div>
                            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{t('billing.refundApproved', { defaultValue: 'معتمدة وجاهزة لتسليم النقدية للمريض' })}</p>
                        </div>
                        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-rose-800 dark:text-rose-300">{t('billing.failRefund', { defaultValue: 'استردادات غير مكتملة / فشلت' })}</span>
                                <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-800 dark:bg-rose-900/60 dark:text-rose-200">{failedRefunds.length}</span>
                            </div>
                            <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">{t('billing.failureReason', { defaultValue: 'تحتاج لإعادة فحص أو تصحيح مسار الدفع' })}</p>
                        </div>
                    </div>

                    <RefundReviewQueue
                        canApproveRefund={canApproveRefund}
                        canProcessRefund={canProcessRefund}
                        currentShift={currentShift}
                        isLoading={isLoadingRefunds}
                        onReview={openRefundReview}
                        refunds={pendingRefunds}
                        t={t}
                    />

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="flex items-start gap-3">
                            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                            <div className="text-xs">
                                <p className="font-bold text-slate-800 dark:text-slate-200">{t('billing.refundAdminHelp', { defaultValue: 'حوكمة الاسترداد والرقابة المالية' })}</p>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    {isRtl
                                        ? 'تخضع جميع الاستردادات لرقابة صارمة حيث تُصرف الدفعات المستردة بنفس وسيلة التحصيل الأصلية وتُخصم تلقائيًا من عهدة وردية الخزينة وتسجل في مسار التدقيق المالي.'
                                        : 'All refunds adhere to financial invariants: reversals must exit via the original payment rail, automatically adjust cashier shift float, and persist in the financial audit log.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: Corporate & Insurance */}
            {activeSubTab === 'insurance' && (
                <section className="space-y-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                                {t('billing.statement.grossRevenue', { defaultValue: 'إجمالي مطالبات التأمين' })}
                            </span>
                            <p className="mt-1 font-mono text-lg font-black text-indigo-950 dark:text-white">
                                {insuranceKpis.billed.toFixed(2)} EGP
                            </p>
                        </div>
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                {t('billing.patientCopay', { defaultValue: 'تحمل المرضى (Co-pay)' })}
                            </span>
                            <p className="mt-1 font-mono text-lg font-black text-amber-950 dark:text-white">
                                {insuranceKpis.copay.toFixed(2)} EGP
                            </p>
                        </div>
                        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                {t('billing.covered', { defaultValue: 'تغطية الشركات (Claim Share)' })}
                            </span>
                            <p className="mt-1 font-mono text-lg font-black text-emerald-950 dark:text-white">
                                {insuranceKpis.insuranceShare.toFixed(2)} EGP
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('billing.invoiceCount', { defaultValue: 'عدد المطالبات' })}
                            </span>
                            <p className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                                {insuranceKpis.count}
                            </p>
                        </div>
                    </div>

                    {insuranceInvoices.length === 0 ? (
                        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                            <Building2 size={36} className="text-slate-300 dark:text-slate-600" />
                            <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                                {isRtl ? 'لا توجد فواتير تأمين أو تعاقد مسجلة في هذا اليوم' : 'No corporate or insurance claims for this date'}
                            </p>
                        </div>
                    ) : (
                        <InsuranceClaimsTable
                            invoices={insuranceInvoices}
                            onSelect={setSelectedInvoice}
                            t={t}
                        />
                    )}
                </section>
            )}

            {/* TAB 4: Financial Statement */}
            {activeSubTab === 'statement' && (
                <section className="space-y-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                        <div>
                            <div className="flex items-center gap-2">
                                <Receipt size={18} className="text-teal-600 dark:text-teal-400" />
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                    {t('billing.statement.title', { defaultValue: 'كشف الإقفال والتسوية المالية اليومية' })}
                                </h3>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {t('billing.statement.subtitle', { defaultValue: 'تقرير مالي مجمع للمتحصلات والمبيعات والذمم المدينة ووسائل التسوية' })}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handlePrintDailyStatement}
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
                            >
                                <Printer size={14} />
                                <span>{t('billing.statement.print', { defaultValue: 'طباعة كشف الإقفال اليومي' })}</span>
                            </button>
                            <button
                                type="button"
                                onClick={exportInvoicesCsv}
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                                <Download size={13} />
                                <span>{t('billing.statement.export', { defaultValue: 'تصدير كشف الحساب' })}</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{t('billing.statement.grossRevenue', { defaultValue: 'إجمالي المبيعات' })}</span>
                            <p className="mt-1 font-mono text-base font-black text-slate-900 dark:text-white">{kpis.grossBilled.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{t('billing.statement.totalDiscounts', { defaultValue: 'إجمالي الخصومات' })}</span>
                            <p className="mt-1 font-mono text-base font-black text-violet-700 dark:text-violet-400">{kpis.discounts.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{t('billing.statement.netRevenue', { defaultValue: 'صافي الإيراد' })}</span>
                            <p className="mt-1 font-mono text-base font-black text-teal-700 dark:text-teal-400">{(kpis.grossBilled - kpis.discounts).toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                            <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">{t('billing.statement.totalCollected', { defaultValue: 'المتحصل الفعلي' })}</span>
                            <p className="mt-1 font-mono text-base font-black text-emerald-700 dark:text-emerald-300">{kpis.collected.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                            <span className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">{t('billing.statement.totalReceivables', { defaultValue: 'الذمم المدينة' })}</span>
                            <p className="mt-1 font-mono text-base font-black text-amber-700 dark:text-amber-300">{kpis.outstanding.toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-3 dark:border-teal-900/40 dark:bg-teal-950/20">
                            <span className="text-[10px] font-bold uppercase text-teal-800 dark:text-teal-300">{t('billing.statement.collectionEfficiency', { defaultValue: 'كفاءة التحصيل' })}</span>
                            <p className="mt-1 font-mono text-base font-black text-teal-700 dark:text-teal-300">{kpis.collectionRate}%</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t('billing.statement.paymentRails', { defaultValue: 'تفصيل المتحصلات حسب وسيلة التسوية' })}
                        </h4>
                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                    <Banknote size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('billing.statement.cashRail', { defaultValue: 'نقدًا بالخزينة' })}</p>
                                    <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                        {kpis.hasMethodBreakdown
                                            ? `${kpis.rails.cash.toFixed(2)} EGP`
                                            : (((receptionShift || currentShift)?.collected_amount != null)
                                                ? `${Number((receptionShift || currentShift).collected_amount).toFixed(2)} EGP`
                                                : '—')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                                    <CreditCard size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('billing.statement.cardRail', { defaultValue: 'بطاقات دفع POS' })}</p>
                                    <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                        {kpis.hasMethodBreakdown ? `${kpis.rails.card.toFixed(2)} EGP` : '—'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                    <Wallet size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('billing.statement.walletRail', { defaultValue: 'محافظ إلكترونية' })}</p>
                                    <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                        {kpis.hasMethodBreakdown ? `${kpis.rails.wallet.toFixed(2)} EGP` : '—'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                    <Building2 size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('billing.statement.insuranceRail', { defaultValue: 'تأمين معلق' })}</p>
                                    <p className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                        {insuranceKpis.insuranceShare.toFixed(2)} EGP
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/20">
                        <div className="border-b border-slate-100 p-3 dark:border-slate-800">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {t('billing.statement.closingSummary', { defaultValue: 'ملخص فواتير اليوم' })} ({invoices.length})
                            </span>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            <table className="w-full text-start text-xs">
                                <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2 text-start">{t('billing.invoiceNo')}</th>
                                        <th className="px-3 py-2 text-start">{t('billing.patient')}</th>
                                        <th className="px-3 py-2 text-end">{t('billing.total')}</th>
                                        <th className="px-3 py-2 text-end">{t('billing.paid')}</th>
                                        <th className="px-3 py-2 text-end">{t('billing.balance')}</th>
                                        <th className="px-3 py-2 text-center">{t('billing.status')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                    {invoices.map((inv) => (
                                        <tr key={inv.invoice_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                            <td className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300">{inv.invoice_number || '-'}</td>
                                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{inv.patient_name || '-'}</td>
                                            <td className="px-3 py-2 text-end font-mono">{Number(inv.patient_payable_amount ?? inv.total_amount ?? 0).toFixed(2)}</td>
                                            <td className="px-3 py-2 text-end font-mono text-emerald-600 dark:text-emerald-400">{Number(inv.paid_amount || 0).toFixed(2)}</td>
                                            <td className="px-3 py-2 text-end font-mono text-amber-600 dark:text-amber-400">{Number(inv.balance_amount || 0).toFixed(2)}</td>
                                            <td className="px-3 py-2 text-center"><StatusPill status={inv.invoice_status} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

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
                        canCollect={canCollect}
                        canRequestRefund={canRequestRefund}
                        invoice={selectedInvoice}
                        invoiceDetail={invoiceDetail}
                        isLoading={isLoadingInvoiceDetail}
                        onClose={() => setSelectedInvoice(null)}
                        onCollect={() => handleOpenPayment(selectedInvoice)}
                        onOpenRefund={openRefund}
                        onSetSupplyExamId={setSupplyExamId}
                        t={t}
                        isRtl={isRtl}
                    />
                )}
            </Modal>

            <Modal
                isOpen={!!reviewTarget}
                onClose={() => !isReviewingRefund && setReviewTarget(null)}
                title={t(reviewTarget?.status === 'Rejected' ? 'billing.rejectRefundTitle' : (reviewTarget?.status === 'Processed' ? 'billing.processRefundTitle' : (reviewTarget?.status === 'Failed' ? 'billing.failRefundTitle' : 'billing.approveRefundTitle')))}
            >
                {reviewTarget && (
                    <form onSubmit={handleRefundReview} className="space-y-5">
                        <div className={`rounded-xl border p-4 ${reviewTarget.status === 'Rejected' ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20' : (reviewTarget.status === 'Failed' ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20')}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 dark:text-white">{reviewTarget.refund.patient_name}</p>
                                    <p className="font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{reviewTarget.refund.invoice_number}</p>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{reviewTarget.refund.reason}</p>
                                    {reviewTarget.refund.failure_reason && (
                                        <p className="mt-2 rounded-lg bg-amber-100/70 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t('billing.failureReason')}: {reviewTarget.refund.failure_reason}</p>
                                    )}
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
                            <button type="submit" disabled={isReviewingRefund || reviewReason.trim().length < 3 || (reviewTarget.status === 'Processed' && !currentShift)} className={`flex min-h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition disabled:opacity-40 ${reviewTarget.status === 'Rejected' ? 'bg-rose-600 hover:bg-rose-700' : (reviewTarget.status === 'Failed' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700')}`}>
                                {reviewTarget.status === 'Rejected' ? <X size={14} /> : <CheckCircle2 size={14} />}
                                {isReviewingRefund ? t('billing.processing') : t(reviewTarget.status === 'Rejected' ? 'billing.rejectRefund' : (reviewTarget.status === 'Processed' ? 'billing.processRefund' : (reviewTarget.status === 'Failed' ? 'billing.failRefund' : 'billing.approveRefund')))}
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
                                <select value={refundMethod} disabled className={`${fieldClass} cursor-not-allowed opacity-70`}>
                                    {['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate'].map((method) => (
                                        <option key={method} value={method}>{t(`billing.methods.${method}`)}</option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('billing.refundMethodLocked')}</p>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>{t('billing.refundReasonCode')}</label>
                            <select value={refundReasonCode} onChange={(event) => setRefundReasonCode(event.target.value)} className={fieldClass}>
                                <option value="">{t('billing.refundReasonCodeNone')}</option>
                                {['PatientCancelled', 'DuplicatePayment', 'ServiceNotProvided', 'Overcharge', 'InsuranceAdjustment', 'SystemError', 'Other'].map((code) => (
                                    <option key={code} value={code}>{t(`billing.refundReasonCodes.${code}`)}</option>
                                ))}
                            </select>
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

const FinanceSnapshot = ({ icon: Icon, label, value, money = true, sub, tone = 'slate', onClick, active }) => {
    const tones = {
        slate: 'text-[var(--VIARA-ink)]',
        teal: 'text-teal-700 dark:text-teal-300',
        emerald: 'text-emerald-700 dark:text-emerald-300',
        amber: 'text-amber-700 dark:text-amber-300',
        rose: 'text-rose-700 dark:text-rose-300',
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={`min-w-0 bg-[var(--VIARA-surface)] px-3 py-2.5 text-start transition ${onClick ? 'hover:bg-[var(--VIARA-surface-muted)]' : 'cursor-default'} ${active ? 'shadow-[inset_0_-2px_0_rgba(13,148,136,.8)]' : ''}`}
        >
            <div className="flex items-center gap-1.5 text-[var(--VIARA-muted)]">
                <Icon size={12} className={tones[tone] || tones.slate} />
                <span className="truncate text-[9.5px] font-black uppercase tracking-[.06em]">{label}</span>
            </div>
            <div className="mt-1 flex min-w-0 items-baseline gap-1.5">
                <span className={`truncate font-mono text-base font-black tabular-nums sm:text-lg ${tones[tone] || tones.slate}`} dir="ltr">
                    {money ? Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Number(value || 0).toLocaleString()}
                </span>
                {money && <span className="text-[9px] font-bold text-[var(--VIARA-muted)]">EGP</span>}
            </div>
            {sub && <p className="mt-0.5 truncate text-[9.5px] font-semibold text-[var(--VIARA-muted)]">{sub}</p>}
        </button>
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

const ShiftMetric = ({ icon: Icon, label, value, money = true, sub, tone = 'slate' }) => {
    const toneClass = {
        slate: 'border-slate-200/80 bg-slate-50/50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
        emerald: 'border-emerald-200/80 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
        amber: 'border-amber-200/80 bg-amber-50/50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
        violet: 'border-cyan-200/80 bg-cyan-50/50 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:text-cyan-300',
        blue: 'border-sky-200/80 bg-sky-50/50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300',
    }[tone] || 'border-slate-200/80 bg-slate-50/50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300';

    return (
        <div className={`rounded-xl border p-3 shadow-xs backdrop-blur-xl transition-all ${toneClass}`}>
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/70 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                    <Icon size={13} />
                </span>
            </div>
            <p className="mt-1 text-base font-black tabular-nums text-slate-950 dark:text-white">
                {money ? Number(value || 0).toLocaleString() : Number(value || 0)}
                {money && <span className="ms-1 text-[10px] font-bold text-slate-400">EGP</span>}
            </p>
            {sub && <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{sub}</p>}
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
                                <>
                                    <button type="button" onClick={() => onReview(refund, 'Failed')} className="min-h-9 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">{t('billing.failRefund')}</button>
                                    <button type="button" onClick={() => onReview(refund, 'Processed')} disabled={!currentShift} title={!currentShift ? t('billing.openShiftRequired') : undefined} className="min-h-9 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{t('billing.processRefund')}</button>
                                </>
                            )}
                            {refund.status === 'Failed' && canApproveRefund && (
                                <button type="button" onClick={() => onReview(refund, 'Approved')} className="min-h-9 rounded-xl bg-teal-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700">{t('billing.reapproveRefund')}</button>
                            )}
                        </div>
                        {refund.status === 'Failed' && refund.failure_reason && (
                            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t('billing.failureReason')}: {refund.failure_reason}</p>
                        )}
                    </article>
                ))}
            </div>
        )}
    </section>
);

const InvoiceTable = ({ invoices, canCollect, isDownloading, onCollect, onPrint, onSelect, onSort, sortField, sortDirection, t }) => {
    const SortableHeader = ({ field, label, width, className = '' }) => {
        const isCurrent = sortField === field;
        return (
            <th className={`${width} px-3 py-2.5 text-start ${className}`}>
                <button
                    type="button"
                    onClick={() => onSort(field)}
                    className="group inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)] focus-visible:outline-none"
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
        <>
            {/* Mobile Cards View (lg:hidden) */}
            <div className="space-y-2.5 p-3 lg:hidden">
                {invoices.map((invoice) => (
                    <InvoiceCardMobile
                        key={invoice.invoice_id}
                        invoice={invoice}
                        canCollect={canCollect}
                        isDownloading={isDownloading}
                        onCollect={onCollect}
                        onPrint={onPrint}
                        onSelect={onSelect}
                        t={t}
                    />
                ))}
            </div>

            {/* Desktop Table View (hidden lg:block) */}
            <div className="hidden max-h-[620px] overflow-auto lg:block">
                <table className="w-full min-w-[1040px] table-fixed text-start text-sm">
                    <thead className="sticky top-0 z-10 border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/95 backdrop-blur">
                        <tr>
                            <SortableHeader field="number" label={t('billing.invoiceNo')} width="w-[120px]" className="ps-5" />
                            <th className="w-[28%] px-3 py-2.5 text-start text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]">
                                {t('billing.patient')}
                            </th>
                            <SortableHeader field="date" label={t('billing.date')} width="hidden w-[110px] md:table-cell" />
                            <SortableHeader field="total" label={t('billing.total')} width="hidden w-[110px] sm:table-cell" />
                            <SortableHeader field="paid" label={t('billing.paid')} width="hidden w-[110px] lg:table-cell" />
                            <SortableHeader field="balance" label={t('billing.balance')} width="w-[110px]" />
                            <SortableHeader field="status" label={t('billing.status')} width="hidden w-[116px] md:table-cell" />
                            <th className="w-[190px] px-4 py-2.5 pe-5 text-end text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]">
                                {t('billing.actions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--VIARA-line)]">
                        {invoices.map((invoice) => (
                            <InvoiceRow
                                key={invoice.invoice_id}
                                invoice={invoice}
                                canCollect={canCollect}
                                isDownloading={isDownloading}
                                onCollect={onCollect}
                                onPrint={onPrint}
                                onSelect={onSelect}
                                t={t}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
};

const InvoicePaymentBadge = ({ invoice, t }) => {
    const { i18n } = useTranslation('reception');
    const isAr = i18n?.language?.startsWith('ar');

    const payments = (invoice.payments || []).filter(
        (p) => p.payment_status === 'Completed' || !p.payment_status
    );
    const actualMethods = [...new Set(payments.map((p) => p.method).filter(Boolean))];
    const expected = invoice.expected_payment_method;

    const formatMethod = (m) => {
        if (!m) return '';
        const sm = String(m).trim();
        if (sm === 'Insurance') return t('billing.expectedInsurance', { defaultValue: isAr ? 'تأمين' : 'Insurance' });
        if (/card/i.test(sm)) return t('billing.methods.Card', { defaultValue: isAr ? 'بطاقة بنكية' : 'Card' });
        if (/wallet/i.test(sm)) return t('billing.methods.Wallet', { defaultValue: isAr ? 'محفظة' : 'Wallet' });
        if (/bank/i.test(sm)) return t('billing.methods.Bank Transfer', { defaultValue: isAr ? 'تحويل بنكي' : 'Bank Transfer' });
        if (/cash/i.test(sm)) return t('billing.methods.Cash', { defaultValue: isAr ? 'نقدي' : 'Cash' });
        return t(`billing.methods.${sm}`, { defaultValue: sm });
    };

    const getIcon = (method, className = 'shrink-0') => {
        const m = String(method || '').toLowerCase();
        if (m === 'cash') return <Banknote size={10} className={`text-emerald-600 dark:text-emerald-400 ${className}`} />;
        if (m.includes('card')) return <CreditCard size={10} className={`text-sky-600 dark:text-sky-400 ${className}`} />;
        if (m.includes('wallet')) return <Wallet size={10} className={`text-purple-600 dark:text-purple-400 ${className}`} />;
        if (m.includes('bank')) return <Landmark size={10} className={`text-indigo-600 dark:text-indigo-400 ${className}`} />;
        return <Banknote size={10} className={`text-slate-500 ${className}`} />;
    };

    if (actualMethods.length > 0) {
        if (actualMethods.length === 1) {
            const actual = actualMethods[0];
            const isMatch = !expected || (
                actual.toLowerCase() === expected.toLowerCase() ||
                (/card/i.test(actual) && /card/i.test(expected))
            );

            if (isMatch) {
                return (
                    <span
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/90 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                        title={isAr ? `وسيلة التحصيل: ${formatMethod(actual)} (مطابقة للحجز)` : `Collected: ${formatMethod(actual)} (matches booking)`}
                    >
                        {getIcon(actual)}
                        <span>{formatMethod(actual)}</span>
                    </span>
                );
            }

            return (
                <span
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 shadow-2xs"
                    title={isAr ? `التحصيل الفعلي: ${formatMethod(actual)} · المحدد عند الحجز: ${formatMethod(expected)}` : `Collected: ${formatMethod(actual)} · Booked: ${formatMethod(expected)}`}
                >
                    {getIcon(actual)}
                    <span>{formatMethod(actual)}</span>
                    <span className="text-[8.5px] font-medium text-amber-700 dark:text-amber-400 opacity-90">
                        {isAr ? `(الحجز: ${formatMethod(expected)})` : `(booked: ${formatMethod(expected)})`}
                    </span>
                </span>
            );
        }

        return (
            <span
                className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9.5px] font-bold text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                title={actualMethods.map(formatMethod).join(' + ')}
            >
                <Layers size={10} className="text-teal-600" />
                <span>{isAr ? 'دفع متعدد' : 'Split Payment'}</span>
                <span className="text-[8.5px] opacity-80">({actualMethods.map(formatMethod).join(' + ')})</span>
            </span>
        );
    }

    if (expected) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                title={isAr ? `الوسيلة المحددة عند الحجز (لم يُحصّل بعد): ${formatMethod(expected)}` : `Expected method at booking: ${formatMethod(expected)}`}
            >
                {getIcon(expected, 'opacity-60')}
                <span>{isAr ? `متوقع: ${formatMethod(expected)}` : `Expected: ${formatMethod(expected)}`}</span>
            </span>
        );
    }

    return null;
};

const InvoiceCardMobile = ({ invoice, canCollect, isDownloading, onCollect, onPrint, onSelect, t }) => {
    const { i18n } = useTranslation();
    const isAr = i18n?.language?.startsWith('ar');
    const total = Number(invoice.patient_payable_amount ?? invoice.total_amount ?? 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_amount || 0);
    const paidPct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
    const hasBalance = balance > 0 && invoice.invoice_status !== 'Voided';
    const dateValue = invoice.generated_at || invoice.created_at;
    const coverageCategory = getInvoiceCoverageCategory(invoice);

    return (
        <article
            onClick={() => onSelect(invoice)}
            className={`rounded-2xl border p-3.5 shadow-2xs transition-all active:scale-[0.99] ${hasBalance
                ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20'
                : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]'
                }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div>
                    <span className="font-mono text-xs font-black uppercase text-teal-700 dark:text-teal-400 ltr-embed" dir="ltr">
                        {invoice.invoice_number || '-'}
                    </span>
                    <p className="mt-1 truncate text-sm font-black text-slate-900 dark:text-white">
                        {invoice.patient_name || t('billing.unnamedPatient')}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] text-slate-400 ltr-embed" dir="ltr">{invoice.mrn || '-'}</span>
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
                                <User size={10} />
                                <span>{isAr ? 'حساب خاص' : 'Self-Pay'}</span>
                            </span>
                        )}
                        <InvoicePaymentBadge invoice={invoice} t={t} />
                    </div>
                </div>
                <StatusPill status={invoice.invoice_status} />
            </div>

            {/* Financial Details */}
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950/50">
                <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">{t('billing.total')}</span>
                    <p className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 ltr-embed" dir="ltr">{total.toFixed(2)}</p>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">{t('billing.paid')}</span>
                    <p className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 ltr-embed" dir="ltr">{paid.toFixed(2)}</p>
                </div>
                <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">{t('billing.balance')}</span>
                    <p className={`font-mono text-xs font-black ltr-embed ${balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`} dir="ltr">
                        {balance.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Mini Progress Bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                    className={`h-full transition-all ${balance <= 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${paidPct}%` }}
                />
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800/80">
                <span className="text-[11px] font-medium text-slate-400">
                    {dateValue ? new Date(dateValue).toLocaleDateString() : '-'}
                </span>
                <div className="flex items-center gap-1.5">
                    {canCollect && onCollect && hasBalance && <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onCollect(invoice); }}
                        className="inline-flex h-8 items-center gap-1 rounded-xl bg-emerald-600 px-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                        title={t('billing.collectPayment', { defaultValue: 'Collect payment' })}
                    >
                        <Banknote size={13} />
                        <span>{t('billing.collectPayment', { defaultValue: 'Collect payment' })}</span>
                    </button>}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPrint(invoice, 'receipt'); }}
                        className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title={t('billing.printReceipt')}
                    >
                        <Receipt size={13} />
                        <span>{t('billing.receipt', { defaultValue: 'إيصال' })}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onPrint(invoice, 'invoice'); }}
                        disabled={isDownloading === invoice.invoice_id}
                        className="inline-flex h-8 items-center gap-1 rounded-xl bg-teal-600 px-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50"
                        title={t('billing.downloadPdf')}
                    >
                        {isDownloading === invoice.invoice_id ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={13} />}
                        <span>{t('billing.invoice', { defaultValue: 'فاتورة' })}</span>
                    </button>
                </div>
            </div>
        </article>
    );
};

const InvoiceRow = ({ invoice, canCollect, isDownloading, onCollect, onPrint, onSelect, t }) => {
    const { i18n } = useTranslation();
    const isAr = i18n?.language?.startsWith('ar');
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
                                <User size={10} />
                                <span>{isAr ? 'حساب خاص' : 'Self-Pay'}</span>
                            </span>
                        )}
                        <InvoicePaymentBadge invoice={invoice} t={t} />
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
                <div className="flex items-center justify-end gap-1">
                    {canCollect && onCollect && hasBalance && <button
                        type="button"
                        onClick={() => onCollect(invoice)}
                        aria-label={t('billing.collectPayment', { defaultValue: 'Collect payment' })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
                        title={t('billing.collectPayment', { defaultValue: 'Collect payment' })}
                    >
                        <Banknote size={13} />
                    </button>}
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
    canCollect,
    canRequestRefund,
    invoice,
    invoiceDetail,
    isLoading,
    onClose,
    onCollect,
    onOpenRefund,
    onSetSupplyExamId,
    t,
    isRtl = false,
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
                                            <span>{category.labelAr || 'حساب خاص (سداد مباشر)'}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-500">
                                    <InvoiceMeta icon={User} value={activeInv.patient_name || t('billing.unnamedPatient', { defaultValue: 'مريض بدون اسم' })} suffix={activeInv.mrn ? `MRN: ${activeInv.mrn}` : null} />
                                    <InvoiceMeta icon={Calendar} value={issueDate} />
                                    {activeInv.order_number && <InvoiceMeta icon={Hash} value={`${t('billing.order', { defaultValue: 'Order' })}: ${activeInv.order_number}`} mono />}
                                    {category.policyNumber && <InvoiceMeta icon={ShieldCheck} value={`${t('billing.policyNo', { defaultValue: 'الوثيقة' })}: ${category.policyNumber}`} mono />}
                                    {activeInv.expected_payment_method && (
                                        <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            <span className="text-[10px] text-slate-400">وسيلة الحجز:</span>
                                            <span>{t(`billing.methods.${activeInv.expected_payment_method}`, { defaultValue: activeInv.expected_payment_method })}</span>
                                        </div>
                                    )}
                                    {activeInv.payments && activeInv.payments.length > 0 && (() => {
                                        const pMethods = [...new Set(activeInv.payments.filter((p) => p.payment_status === 'Completed' || !p.payment_status).map((p) => p.method).filter(Boolean))];
                                        if (pMethods.length === 0) return null;
                                        const expected = activeInv.expected_payment_method;
                                        const isSingle = pMethods.length === 1;
                                        const actual = pMethods[0];
                                        const isMatch = !expected || (
                                            actual.toLowerCase() === expected.toLowerCase() ||
                                            (/card/i.test(actual) && /card/i.test(expected))
                                        );

                                        return (
                                            <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold border ${isMatch
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                                : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                                }`}>
                                                <span className="text-[10px] opacity-75">وسيلة التحصيل:</span>
                                                <span>{isSingle ? t(`billing.methods.${actual}`, { defaultValue: actual }) : (isRtl ? 'دفع متعدد' : 'Split')}</span>
                                                {expected && (
                                                    isMatch ? (
                                                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">✓ مطابق للحجز</span>
                                                    ) : (
                                                        <span className="text-[9px] text-amber-700 dark:text-amber-400 font-semibold">⚠ مختلف عن الحجز</span>
                                                    )
                                                )}
                                            </div>
                                        );
                                    })()}
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
                            {canCollect && balanceAmount > 0 && invoice.invoice_status !== 'Voided' && onCollect && (
                                <button
                                    type="button"
                                    onClick={onCollect}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                                >
                                    <Banknote size={15} />
                                    <span>{t('billing.collectPayment', { defaultValue: 'Collect payment' })}</span>
                                    <span className="font-mono">{balanceAmount.toFixed(2)} EGP</span>
                                </button>
                            )}
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
                        label={t('billing.totalPaid', { defaultValue: 'إجمالي المدفوع' })}
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

const InvoicePaymentsPanel = ({ canRequestRefund, invoice, invoiceDetail, isLoading, onOpenRefund, t }) => {
    const expectedMethod = invoiceDetail?.expected_payment_method || invoice?.expected_payment_method;

    const isTenderMatched = (expected, actual) => {
        if (!expected) return true;
        const e = String(expected).trim().toLowerCase();
        const a = String(actual).trim().toLowerCase();
        if (e === a) return true;
        if ((e === 'card' || e === 'credit card') && (a === 'card' || a === 'credit card')) return true;
        return false;
    };

    const getPaymentMethodIcon = (method) => {
        const m = String(method || '').toLowerCase();
        if (m === 'cash') return <Banknote size={18} className="text-emerald-600" />;
        if (m.includes('card')) return <CreditCard size={18} className="text-sky-600" />;
        if (m.includes('wallet')) return <Wallet size={18} className="text-purple-600" />;
        if (m.includes('bank')) return <Landmark size={18} className="text-indigo-600" />;
        return <CreditCard size={18} className="text-slate-600" />;
    };

    return (
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
                                .filter((refund) => refund.payment_id === payment.payment_id && !['Rejected', 'Failed'].includes(refund.status))
                                .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
                            const refundable = Math.max(0, Number(payment.amount || 0) - reserved);
                            const canRefundPayment = canRequestRefund && payment.payment_status === 'Completed' && refundable > 0;
                            const matched = isTenderMatched(expectedMethod, payment.method);

                            return (
                                <div
                                    key={payment.payment_id}
                                    className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition hover:border-emerald-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-start gap-3.5">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                                            {getPaymentMethodIcon(payment.method)}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                                                    {t(`billing.methods.${payment.method}`, { defaultValue: payment.method === 'Cash' ? 'نقدي' : payment.method })}
                                                </p>
                                                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                    {payment.payment_status === 'Completed' ? 'مكتمل' : payment.payment_status}
                                                </span>
                                                {expectedMethod && (
                                                    matched ? (
                                                        <span className="rounded-md bg-teal-100/80 px-1.5 py-0.5 text-[9px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                                            مطابق لوسيلة الحجز ✓
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300" title={`وسيلة الحجز المسجلة: ${expectedMethod}`}>
                                                            مختلف عن الحجز (المحدد بالحجز: {t(`billing.methods.${expectedMethod}`, { defaultValue: expectedMethod })})
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-[11px] font-medium text-slate-500 ltr-embed" dir="ltr">
                                                {new Date(payment.transaction_date || payment.created_at).toLocaleString()}
                                            </p>
                                            {payment.payment_reference && (
                                                <p className="mt-1 font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-400 ltr-embed" dir="ltr">
                                                    {/card/i.test(payment.method) ? 'POS AUTH: ' : /wallet/i.test(payment.method) ? 'WALLET REF: ' : /bank/i.test(payment.method) ? 'BANK REF: ' : 'REF: '}
                                                    {payment.payment_reference}
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
};

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
                                <span>{category.labelAr || 'حساب خاص (سداد مباشر)'}</span>
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

const InvoiceCardsGrid = ({ invoices, canCollect, isDownloading, onCollect, onPrint, onSelect, t }) => {
    return (
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {invoices.map((invoice) => (
                <InvoiceCard
                    key={invoice.invoice_id}
                    invoice={invoice}
                    canCollect={canCollect}
                    isDownloading={isDownloading}
                    onCollect={onCollect}
                    onPrint={onPrint}
                    onSelect={onSelect}
                    t={t}
                />
            ))}
        </div>
    );
};

const InvoiceCard = ({ invoice, canCollect, isDownloading, onCollect, onPrint, onSelect, t }) => {
    const total = Number(invoice.patient_payable_amount ?? invoice.total_amount ?? 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_amount || 0);
    const paidPct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
    const hasBalance = balance > 0 && invoice.invoice_status !== 'Voided';
    const dateValue = invoice.generated_at || invoice.created_at;
    const coverageCategory = getInvoiceCoverageCategory(invoice);

    return (
        <article
            className={`group flex flex-col justify-between rounded-2xl border p-4 shadow-2xs transition-all hover:shadow-md ${hasBalance
                ? 'border-amber-200/90 bg-amber-50/20 dark:border-amber-900/40 dark:bg-amber-950/15'
                : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]'
                }`}
        >
            <div>
                {/* Card Top: Number, Date, Status */}
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <span className="font-mono text-xs font-black uppercase text-teal-700 dark:text-teal-400 ltr-embed" dir="ltr">
                            {invoice.invoice_number || '-'}
                        </span>
                        <p className="text-[11px] font-semibold text-slate-400">
                            {dateValue ? new Date(dateValue).toLocaleDateString() : '-'}
                        </p>
                    </div>
                    <StatusPill status={invoice.invoice_status} />
                </div>

                {/* Patient Information */}
                <div className="mt-3 flex items-center gap-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--VIARA-surface-muted)] font-bold text-teal-700 dark:text-teal-300">
                        <User size={16} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-white" title={invoice.patient_name}>
                            {invoice.patient_name || t('billing.unnamedPatient')}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400 ltr-embed" dir="ltr">{invoice.mrn || '-'}</p>
                    </div>
                </div>

                {/* Coverage & Contract Pill */}
                <div className="mt-2.5 flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black ${coverageCategory.type === 'contract'
                        ? 'border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : coverageCategory.type === 'insurance'
                            ? 'border border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
                            : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                        {coverageCategory.type === 'contract' ? (
                            <Building2 size={11} />
                        ) : coverageCategory.type === 'insurance' ? (
                            <ShieldCheck size={11} />
                        ) : (
                            <User size={11} />
                        )}
                        <span>
                            {coverageCategory.type === 'contract'
                                ? (invoice.insurance_provider || t('billing.contract', { defaultValue: 'تعاقد جهة' }))
                                : coverageCategory.type === 'insurance'
                                    ? (invoice.insurance_provider || t('billing.insurance', { defaultValue: 'تأمين صحي' }))
                                    : (coverageCategory.labelAr || t('billing.selfPay', { defaultValue: 'حساب خاص' }))}
                        </span>
                    </span>
                    {invoice.insurance_policy_number && (
                        <span className="truncate font-mono text-[10px] text-slate-400">#{invoice.insurance_policy_number}</span>
                    )}
                </div>

                {/* Financial Summary Box */}
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--VIARA-surface-muted)]/70 p-2.5">
                    <div>
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{t('billing.total')}</span>
                        <p className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 ltr-embed" dir="ltr">{total.toFixed(2)}</p>
                    </div>
                    <div>
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{t('billing.paid')}</span>
                        <p className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 ltr-embed" dir="ltr">{paid.toFixed(2)}</p>
                    </div>
                    <div>
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{t('billing.balance')}</span>
                        <p className={`font-mono text-xs font-black ltr-embed ${balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`} dir="ltr">
                            {balance.toFixed(2)}
                        </p>
                    </div>
                </div>

                {/* Paid Progress Bar */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                        className={`h-full transition-all ${balance <= 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${paidPct}%` }}
                    />
                </div>
            </div>

            {/* Action Bar */}
            <div className="mt-4 flex items-center justify-between gap-1.5 border-t border-[var(--VIARA-line)] pt-3">
                {canCollect && onCollect && hasBalance && <button
                    type="button"
                    onClick={() => onCollect(invoice)}
                    className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700"
                    title={t('billing.collectPayment', { defaultValue: 'Collect payment' })}
                >
                    <Banknote size={13} />
                    <span>{t('billing.collectPayment', { defaultValue: 'Collect payment' })}</span>
                </button>}
                <button
                    type="button"
                    onClick={() => onSelect(invoice)}
                    className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                    <FileText size={13} />
                    <span>{t('billing.viewDetails', { defaultValue: 'عرض التفاصيل' })}</span>
                </button>
                <button
                    type="button"
                    onClick={() => onPrint(invoice, 'invoice')}
                    disabled={isDownloading === invoice.invoice_id}
                    className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    title={t('billing.printPdf', { defaultValue: 'طباعة PDF' })}
                >
                    {isDownloading === invoice.invoice_id ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={13} />}
                </button>
            </div>
        </article>
    );
};

const InsuranceClaimsTable = ({ invoices, onSelect, t }) => {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                    <tr>
                        <th className="px-4 py-3 text-start">{t('billing.invoiceNo')}</th>
                        <th className="px-3 py-3 text-start">{t('billing.patient')}</th>
                        <th className="px-3 py-3 text-start">{t('billing.providerDetails')}</th>
                        <th className="px-3 py-3 text-start">{t('billing.preauthCode')}</th>
                        <th className="px-3 py-3 text-end">{t('billing.total')}</th>
                        <th className="px-3 py-3 text-end">{t('billing.patientCopay')}</th>
                        <th className="px-3 py-3 text-end">{t('billing.covered')}</th>
                        <th className="px-3 py-3 text-end">{t('billing.balance')}</th>
                        <th className="px-4 py-3 text-end">{t('billing.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {invoices.map((invoice) => {
                        const tot = Number(invoice.total_amount || 0);
                        const copay = Number(invoice.patient_payable_amount ?? tot);
                        const insuranceShare = Math.max(0, tot - copay);
                        const bal = Number(invoice.balance_amount || 0);
                        return (
                            <tr key={invoice.invoice_id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="px-4 py-3 font-mono font-black text-slate-800 dark:text-slate-200 ltr-embed" dir="ltr">
                                    {invoice.invoice_number || '-'}
                                </td>
                                <td className="px-3 py-3">
                                    <p className="font-bold text-slate-900 dark:text-white">{invoice.patient_name || '-'}</p>
                                    <p className="font-mono text-[10.5px] text-slate-400">{invoice.mrn || '-'}</p>
                                </td>
                                <td className="px-3 py-3">
                                    <p className="font-bold text-slate-800 dark:text-slate-200">{invoice.insurance_provider || invoice.insurance_name || (invoice.patient_payable_amount < invoice.total_amount ? 'Contract / Insurance' : '-')}</p>
                                    {invoice.insurance_policy_number && (
                                        <p className="font-mono text-[10.5px] text-slate-400">Pol: {invoice.insurance_policy_number}</p>
                                    )}
                                </td>
                                <td className="px-3 py-3 font-mono text-slate-700 dark:text-slate-300">
                                    {invoice.preauthorization_number || invoice.approval_code || '-'}
                                </td>
                                <td className="px-3 py-3 text-end font-mono font-bold text-slate-700 dark:text-slate-300">
                                    {tot.toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-end font-mono font-bold text-amber-700 dark:text-amber-400">
                                    {copay.toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-end font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                    {insuranceShare.toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-end font-mono font-bold">
                                    <span className={bal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                        {bal.toFixed(2)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-end">
                                    <button
                                        type="button"
                                        onClick={() => onSelect(invoice)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        <FileText size={12} />
                                        <span>{t('billing.viewDetails', { defaultValue: 'عرض' })}</span>
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default BillingTab;
