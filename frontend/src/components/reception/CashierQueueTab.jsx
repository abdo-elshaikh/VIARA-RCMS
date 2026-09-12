import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Banknote,
    Calculator,
    CheckCircle2,
    Clock3,
    CreditCard,
    FilePlus2,
    LayoutGrid,
    List,
    LockKeyhole,
    PackagePlus,
    Printer,
    Receipt,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    User,
    Wallet,
    WalletCards,
    X,
    Zap
} from 'lucide-react';
import { formatDuration } from '../../utils/dateFormat';
import ConsumeItemModal from '../inventory/ConsumeItemModal';
import PriorityBadge from '../ui/PriorityBadge';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import { getPaginationState } from '../../utils/pagination';
import {
    findPartialPaymentException,
    getEffectivePartialPaymentExceptionStatus,
} from './partialPaymentExceptionStatus';
import CashDrawerReconciliation from './CashDrawerReconciliation';
import ShiftSupervisorPanel from './ShiftSupervisorPanel';

const priorityRank = { Emergency: 0, Urgent: 1, Routine: 2 };
const PAGE_SIZE_OPTIONS = [6, 12, 24, 48];

const getPaymentState = (item) => {
    if (!item.invoice || item.invoice.invoice_status === 'Voided') return 'MissingInvoice';
    return Number(item.invoice.balance_amount || 0) > 0 ? 'PaymentDue' : 'Paid';
};

const stateStyles = {
    MissingInvoice: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
    PaymentDue: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
};

const CashierQueueTab = ({
    canAppendSupplies = false,
    canCloseShift,
    canOpenShift,
    canReconcileShifts = false,
    canReviewShiftVariance = false,
    currentShift,
    invoices = [],
    isLoadingShift = false,
    items = [],
    locale,
    onCreateInvoice,
    onMoveQueue,
    onOpenPayment,
    onReconcile,
    onRefresh,
    onReviewClosure,
    onSupplyConsumed,
    partialPaymentExceptions = [],
    onRequestPartialPaymentException,
    onShiftAction,
    receptionShift,
    stockMovements = [],
    t
}) => {
    const isAr = locale?.startsWith('ar');

    // Sub-Navigation Tabs: 'queue' | 'reconciliation' | 'ledger' | 'supervisor'
    const [activeSubTab, setActiveSubTab] = useState('queue');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

    const [search, setSearch] = useState('');
    const [readiness, setReadiness] = useState('All');
    const [exceptionFilter, setExceptionFilter] = useState('All');
    const [sortBy, setSortBy] = useState('urgency');
    const [supplyExamId, setSupplyExamId] = useState(null);
    const [consumedExamIds, setConsumedExamIds] = useState(() => new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);

    const currency = useMemo(() => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 2
    }), [locale]);

    // Derived queue with computed financial & supply state
    const queue = useMemo(() => items.map(item => {
        const consumedSupplies = stockMovements.filter((movement) => movement.reference_type === 'Exam' && movement.reference_id === item.exam_id);
        const invoice = item.invoice || invoices.find((inv) => (item.exam_id && inv.exam_id === item.exam_id) || (item.appointment_id && inv.appointment_id === item.appointment_id));
        const movementSupplyTotal = consumedSupplies.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0);
        const invoiceSupplyItems = (invoice?.items || []).filter(i => /مستلزم|supply|contrast|صبغة|سرنجة|قسطرة|شاش/i.test(i.description || ''));
        const invoiceSupplyTotal = invoiceSupplyItems.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
        const isOptimisticallyConsumed = consumedExamIds.has(item.exam_id);
        const hasExamSupplies = Boolean(item.has_supplies || item.hasSupplies) || (item.supplies && item.supplies.length > 0) || (item.consumed_supplies && item.consumed_supplies.length > 0);
        const supplyTotal = Math.max(movementSupplyTotal, invoiceSupplyTotal, isOptimisticallyConsumed ? 1 : 0);
        const supplyCount = Math.max(
            consumedSupplies.reduce((sum, movement) => sum + Math.abs(Number(movement.quantity_change || 0)), 0),
            invoiceSupplyItems.length,
            isOptimisticallyConsumed || hasExamSupplies ? 1 : 0
        );
        const hasNurse = Boolean(item.nurse_name || item.nurse_id);
        const exceptionTargetStage = hasNurse ? 'Prep Pending' : 'Ready for Exam';
        const paymentException = findPartialPaymentException(
            partialPaymentExceptions,
            invoice?.invoice_id,
            exceptionTargetStage
        );

        return {
            ...item,
            sourceItem: item,
            invoice,
            supplyTotal,
            supplyCount,
            exceptionTargetStage,
            paymentException,
            paymentExceptionStatus: getEffectivePartialPaymentExceptionStatus(paymentException),
        };
    }), [consumedExamIds, invoices, items, partialPaymentExceptions, stockMovements]);

    // Filter and Sort queue items
    const filteredAndSorted = useMemo(() => {
        const tokens = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        let list = queue.filter((item) => {
            const searchable = [item.patient_name, item.mrn, item.exam_type_name, item.modality_name, item.invoice?.invoice_number]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase();
            return (readiness === 'All' || getPaymentState(item) === readiness)
                && (exceptionFilter === 'All' || item.paymentExceptionStatus === exceptionFilter)
                && tokens.every((token) => searchable.includes(token));
        });

        list.sort((first, second) => {
            if (sortBy === 'urgency') {
                return (priorityRank[first.priority] ?? 3) - (priorityRank[second.priority] ?? 3)
                    || Number(second.waiting_minutes || 0) - Number(first.waiting_minutes || 0);
            }
            if (sortBy === 'wait') {
                return Number(second.waiting_minutes || 0) - Number(first.waiting_minutes || 0);
            }
            if (sortBy === 'balance') {
                return Number(second.invoice?.balance_amount || 0) - Number(first.invoice?.balance_amount || 0);
            }
            if (sortBy === 'name') {
                return (first.patient_name || '').localeCompare(second.patient_name || '');
            }
            return 0;
        });

        return list;
    }, [exceptionFilter, queue, readiness, search, sortBy]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [exceptionFilter, search, readiness, sortBy, pageSize]);

    const paginationState = useMemo(() => {
        return getPaginationState(filteredAndSorted.length, currentPage, pageSize);
    }, [filteredAndSorted.length, currentPage, pageSize]);

    const paginatedItems = useMemo(() => {
        return filteredAndSorted.slice(paginationState.startIndex, paginationState.endIndex);
    }, [filteredAndSorted, paginationState.startIndex, paginationState.endIndex]);

    const summary = useMemo(() => ({
        urgent: queue.filter((item) => ['Emergency', 'Urgent'].includes(item.priority)).length,
        missing: queue.filter((item) => getPaymentState(item) === 'MissingInvoice').length,
        due: queue.filter((item) => getPaymentState(item) === 'PaymentDue').length,
        paid: queue.filter((item) => getPaymentState(item) === 'Paid').length,
        pendingExceptions: queue.filter((item) => item.paymentExceptionStatus === 'Pending').length,
        approvedExceptions: queue.filter((item) => item.paymentExceptionStatus === 'Approved').length,
        outstanding: queue.reduce((sum, item) => sum + Math.max(0, Number(item.invoice?.balance_amount || 0)), 0)
    }), [queue]);

    const shiftSummary = useMemo(() => ({
        opening: Number(currentShift?.opening_balance || 0),
        collected: Number(currentShift?.collected_amount || 0),
        payments: Number(currentShift?.payment_count || 0),
        queueBalance: summary.outstanding,
    }), [currentShift, summary.outstanding]);

    // Collect all completed shift receipts from available shift data or invoices
    const shiftReceipts = useMemo(() => {
        if (Array.isArray(currentShift?.payments) && currentShift.payments.length > 0) {
            return currentShift.payments;
        }
        const receipts = [];
        const seenPaymentIds = new Set();
        invoices.forEach((inv) => {
            (inv.payments || []).forEach((pay) => {
                if (pay.payment_status === 'Completed') {
                    if (pay.payment_id && seenPaymentIds.has(pay.payment_id)) return;
                    if (pay.payment_id) seenPaymentIds.add(pay.payment_id);
                    receipts.push({
                        ...pay,
                        patient_name: inv.patient_name || pay.patient_name || t('table.patientFallback'),
                        mrn: inv.mrn || pay.mrn || '-',
                        invoice_number: inv.invoice_number || pay.invoice_number || '-',
                        invoice_id: inv.invoice_id || pay.invoice_id,
                    });
                }
            });
        });
        receipts.sort((a, b) => new Date(b.transaction_date || b.created_at) - new Date(a.transaction_date || a.created_at));
        return receipts;
    }, [currentShift, invoices, t]);

    const isSupervisorOrAdmin = Boolean(canReviewShiftVariance || canReconcileShifts);

    return (
        <div className="space-y-5">
            {/* Header Telemetry HUD */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <Zap size={11} />
                                <span>{t('cashier.commandCenter', { defaultValue: 'عمليات الدفع والخزينة' })}</span>
                            </span>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                                currentShift
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            }`}>
                                <span className="relative flex h-2 w-2">
                                    {currentShift && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                                    <span className={`relative inline-flex h-2 w-2 rounded-full ${currentShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                </span>
                                <span>{currentShift ? (isAr ? 'الوردية مفتوحة ونشطة' : 'Shift Active') : (isAr ? 'الوردية مغلقة حالياً' : 'Shift Closed')}</span>
                            </span>
                        </div>
                        <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                            {t('cashier.title', { defaultValue: 'الخزينة والتحصيل المالي' })}
                        </h2>
                        <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                            {t('cashier.subtitle', { defaultValue: 'تحصيل مدفوعات المرضى، معالجة الاستثناءات، ومطابقة وجرد عهدة الخزينة اليومية.' })}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {currentShift && canCloseShift ? (
                            <button
                                type="button"
                                onClick={() => onShiftAction?.('close')}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 shadow-xs transition hover:bg-rose-100 active:scale-95 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                            >
                                <LockKeyhole size={14} />
                                <span>{t('billing.closeShift', { defaultValue: 'إغلاق الوردية وجرد الدرج' })}</span>
                            </button>
                        ) : !currentShift && canOpenShift ? (
                            <button
                                type="button"
                                onClick={() => onShiftAction?.('open')}
                                disabled={isLoadingShift}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-teal-600/20 shadow-md transition hover:bg-teal-500 disabled:opacity-50 active:scale-95"
                            >
                                <WalletCards size={14} />
                                <span>{t('billing.openShift', { defaultValue: 'فتح وردية جديدة' })}</span>
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* 4 Telemetry Metrics */}
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('billing.openingBalance', { defaultValue: 'الرصيد الافتتاحي' })}
                            </span>
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <Banknote size={15} />
                            </span>
                        </div>
                        <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
                            {currency.format(shiftSummary.opening)}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                            {isAr ? 'العهدة النقدية ببدء الوردية' : 'Initial drawer float'}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                {t('billing.netCollected', { defaultValue: 'المتحصل بالوردية' })}
                            </span>
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                <Receipt size={15} />
                            </span>
                        </div>
                        <p className="mt-1 text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                            {currency.format(shiftSummary.collected)}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-emerald-600/90 dark:text-emerald-400/80">
                            {isAr ? `${shiftSummary.payments} عملية دفع مكتملة` : `${shiftSummary.payments} completed payments`}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                {t('cashier.metrics.outstanding', { defaultValue: 'المتبقي في الطابور' })}
                            </span>
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                <CreditCard size={15} />
                            </span>
                        </div>
                        <p className="mt-1 text-xl font-black tabular-nums text-amber-800 dark:text-amber-300">
                            {currency.format(summary.outstanding)}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-amber-700/90 dark:text-amber-400/80">
                            {isAr ? `${summary.due} حالة بانتظار السداد` : `${summary.due} cases pending payment`}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-teal-200/80 bg-teal-50/50 p-3.5 dark:border-teal-900/40 dark:bg-teal-950/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                {t('cashier.metrics.waiting', { defaultValue: 'حالات الطابور' })}
                            </span>
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                                <CheckCircle2 size={15} />
                            </span>
                        </div>
                        <p className="mt-1 text-xl font-black tabular-nums text-teal-900 dark:text-teal-200">
                            {queue.length} <span className="text-xs font-semibold text-slate-400">({summary.paid} {isAr ? 'مسدد' : 'paid'})</span>
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-teal-700 dark:text-teal-400">
                            {summary.urgent > 0 ? (
                                <span className="text-rose-600 font-bold">{summary.urgent} {isAr ? 'حالات عاجلة' : 'urgent cases'}</span>
                            ) : (
                                isAr ? 'جميع الحالات في المسار الطبيعي' : 'All routine cases'
                            )}
                        </p>
                    </div>
                </div>

                {/* Sub-Navigation Tabs */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-slate-950/80">
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('queue')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
                                activeSubTab === 'queue'
                                    ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <CreditCard size={14} />
                            <span>{t('cashier.subTabs.queue', { defaultValue: 'طابور التحصيل والمطالبات' })}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-0.2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                {queue.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveSubTab('reconciliation')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
                                activeSubTab === 'reconciliation'
                                    ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Calculator size={14} />
                            <span>{t('cashier.subTabs.reconciliation', { defaultValue: 'جرد ومطابقة الدرج' })}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveSubTab('ledger')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
                                activeSubTab === 'ledger'
                                    ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Receipt size={14} />
                            <span>{t('cashier.subTabs.ledger', { defaultValue: 'سجل متحصلات الوردية' })}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-0.2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                {shiftSummary.payments}
                            </span>
                        </button>

                        {isSupervisorOrAdmin && (
                            <button
                                type="button"
                                onClick={() => setActiveSubTab('supervisor')}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
                                    activeSubTab === 'supervisor'
                                        ? 'bg-white text-teal-800 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                                }`}
                            >
                                <ShieldCheck size={14} />
                                <span>{t('cashier.subTabs.supervisor', { defaultValue: 'لوحة الإشراف المالي' })}</span>
                            </button>
                        )}
                    </div>

                    {activeSubTab === 'queue' && (
                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`rounded-lg p-1.5 transition ${viewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'}`}
                                title={t('cashier.viewModes.grid', { defaultValue: 'عرض البطاقات' })}
                            >
                                <LayoutGrid size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`rounded-lg p-1.5 transition ${viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'}`}
                                title={t('cashier.viewModes.table', { defaultValue: 'عرض الجدول السريع' })}
                            >
                                <List size={15} />
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* TAB 1: Collection Queue */}
            {activeSubTab === 'queue' && (
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    {/* Search & Filter Toolbar */}
                    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                        <label className="relative w-full lg:max-w-md">
                            <span className="sr-only">{t('cashier.search')}</span>
                            <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={t('cashier.searchPlaceholder')}
                                className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 ps-10 pe-10 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                aria-label={t('cashier.readinessFilter')}
                                value={readiness}
                                onChange={(event) => setReadiness(event.target.value)}
                                className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="All">{t('cashier.filters.All')}</option>
                                <option value="PaymentDue">{t('cashier.filters.PaymentDue')}</option>
                                <option value="Paid">{t('cashier.filters.Paid')}</option>
                                <option value="MissingInvoice">{t('cashier.filters.MissingInvoice')}</option>
                            </select>

                            <select
                                aria-label={t('cashier.exceptionFilter', { defaultValue: 'Filter by exception request status' })}
                                value={exceptionFilter}
                                onChange={(event) => setExceptionFilter(event.target.value)}
                                className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="All">{t('cashier.exceptionFilters.All')}</option>
                                <option value="Pending">{t('cashier.exceptionFilters.Pending')}</option>
                                <option value="Approved">{t('cashier.exceptionFilters.Approved')}</option>
                                <option value="Rejected">{t('cashier.exceptionFilters.Rejected')}</option>
                            </select>

                            <select
                                aria-label="Sort queue"
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value)}
                                className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            >
                                <option value="urgency">{t('cashier.sorted', { defaultValue: 'الأولوية ثم الأطول انتظاراً' })}</option>
                                <option value="wait">{isAr ? 'أطول فترة انتظار' : 'Longest Wait'}</option>
                                <option value="balance">{isAr ? 'أعلى متبقي مالي' : 'Highest Balance'}</option>
                                <option value="name">{isAr ? 'اسم المريض' : 'Patient Name'}</option>
                            </select>

                            {onRefresh && (
                                <button
                                    type="button"
                                    onClick={onRefresh}
                                    title={t('command.refresh', { defaultValue: 'تحديث' })}
                                    className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-slate-50/50 text-slate-600 transition hover:bg-white hover:text-teal-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Content View: Table vs Grid */}
                    {filteredAndSorted.length === 0 ? (
                        <div className="p-8">
                            <EmptyState
                                icon={CreditCard}
                                title={t('cashier.empty')}
                                description={search || readiness !== 'All' ? t('cashier.noFilterResults') : t('cashier.emptySubtitle')}
                            />
                        </div>
                    ) : viewMode === 'table' ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-start text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 text-start">{t('table.patient')}</th>
                                        <th className="px-3 py-3 text-start">{t('table.machineExam')}</th>
                                        <th className="px-3 py-3 text-center">{t('cashier.waiting')}</th>
                                        <th className="px-3 py-3 text-start">{t('table.financialStatus')}</th>
                                        <th className="px-3 py-3 text-end">{t('cashier.balance')}</th>
                                        <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                    {paginatedItems.map((item) => (
                                        <QueueTableRow
                                            key={item.work_item_id || item.appointment_id || item.exam_id}
                                            currency={currency}
                                            currentShift={currentShift}
                                            consumedExamIds={consumedExamIds}
                                            item={item}
                                            locale={locale}
                                            canAppendSupplies={canAppendSupplies}
                                            onCreateInvoice={onCreateInvoice}
                                            onMoveQueue={onMoveQueue}
                                            onOpenPayment={onOpenPayment}
                                            onRequestPartialPaymentException={onRequestPartialPaymentException}
                                            onSetSupplyExamId={setSupplyExamId}
                                            t={t}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                            {paginatedItems.map((item) => (
                                <QueueCard
                                    key={item.work_item_id || item.appointment_id || item.exam_id}
                                    currency={currency}
                                    currentShift={currentShift}
                                    consumedExamIds={consumedExamIds}
                                    item={item}
                                    locale={locale}
                                    canAppendSupplies={canAppendSupplies}
                                    onCreateInvoice={onCreateInvoice}
                                    onMoveQueue={onMoveQueue}
                                    onOpenPayment={onOpenPayment}
                                    onRequestPartialPaymentException={onRequestPartialPaymentException}
                                    onSetSupplyExamId={setSupplyExamId}
                                    t={t}
                                />
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {filteredAndSorted.length > 0 && (
                        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                            <Pagination
                                currentPage={paginationState.currentPage}
                                totalPages={paginationState.totalPages}
                                totalItems={filteredAndSorted.length}
                                pageSize={pageSize}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={setPageSize}
                                pageSizeOptions={PAGE_SIZE_OPTIONS}
                            />
                        </div>
                    )}
                </section>
            )}

            {/* TAB 2: Cash Drawer Reconciliation */}
            {activeSubTab === 'reconciliation' && (
                <CashDrawerReconciliation
                    currentShift={currentShift}
                    reconciliationData={currentShift}
                    onReconcile={onReconcile}
                    isLoading={isLoadingShift}
                    t={t}
                />
            )}

            {/* TAB 3: Shift Receipts Ledger */}
            {activeSubTab === 'ledger' && (
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-5">
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {t('cashier.ledger.title', { defaultValue: 'سجل عمليات التحصيل للوردية الحالية' })}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('cashier.ledger.subtitle', { defaultValue: 'استعراض تفصيلي للمقبوضات مصنفة بوسيلة الدفع وإعادة طباعة الإيصالات' })}
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-2xl bg-teal-50 px-4 py-2 text-xs font-black text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                            <span>{t('cashier.ledger.totalShiftReceipts', { defaultValue: 'إجمالي المقبوضات' })}:</span>
                            <span className="text-sm font-black tabular-nums">{currency.format(shiftSummary.collected)}</span>
                        </div>
                    </div>

                    {shiftReceipts.length === 0 ? (
                        <div className="p-8">
                            <EmptyState
                                icon={Receipt}
                                title={t('cashier.ledger.empty', { defaultValue: 'لا توجد متحصلات مسجلة في هذه الوردية حتى الآن' })}
                                description={isAr ? 'سيظهر هنا كل إيصال دفع يتم تحصيله فور إتمام العملية.' : 'Every payment collected during this shift will appear here with instant receipt reprint actions.'}
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                            <table className="w-full text-start text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 text-start">{t('cashier.ledger.paymentTime', { defaultValue: 'وقت العملية' })}</th>
                                        <th className="px-3 py-3 text-start">{t('cashier.ledger.patient', { defaultValue: 'المريض' })}</th>
                                        <th className="px-3 py-3 text-start">{t('cashier.ledger.invoiceNumber', { defaultValue: 'رقم الفاتورة' })}</th>
                                        <th className="px-3 py-3 text-start">{t('cashier.ledger.method', { defaultValue: 'وسيلة الدفع' })}</th>
                                        <th className="px-3 py-3 text-end">{t('cashier.ledger.amount', { defaultValue: 'المبلغ المحصل' })}</th>
                                        <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                    {shiftReceipts.map((rec) => (
                                        <tr key={rec.payment_id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                            <td className="px-4 py-3 font-mono text-[11px] font-bold text-slate-500">
                                                {new Date(rec.transaction_date || rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-3 py-3 font-black text-slate-900 dark:text-white">
                                                <div>{rec.patient_name}</div>
                                                <div className="font-mono text-[10px] text-slate-400">{rec.mrn}</div>
                                            </td>
                                            <td className="px-3 py-3 font-mono font-bold text-teal-700 dark:text-teal-400">
                                                {rec.invoice_number || '-'}
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10.5px] font-bold dark:border-slate-700 dark:bg-slate-800">
                                                    {rec.method === 'Cash' && <Banknote size={12} className="text-emerald-600" />}
                                                    {rec.method === 'Card' && <CreditCard size={12} className="text-blue-600" />}
                                                    {rec.method === 'Wallet' && <Wallet size={12} className="text-purple-600" />}
                                                    <span>{rec.method || 'Cash'}</span>
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-end font-mono text-sm font-black text-emerald-700 dark:text-emerald-400">
                                                {currency.format(Number(rec.amount || 0))}
                                            </td>
                                            <td className="px-4 py-3 text-end">
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(`/print/receipt/${rec.payment_id}`, '_blank')}
                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                                >
                                                    <Printer size={13} />
                                                    <span>{t('cashier.ledger.reprintReceipt', { defaultValue: 'طباعة الإيصال' })}</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {/* TAB 4: Supervisor Panel */}
            {activeSubTab === 'supervisor' && isSupervisorOrAdmin && (
                <ShiftSupervisorPanel
                    currentShift={currentShift}
                    onOpenShift={() => onShiftAction?.('open')}
                    onCloseShift={() => onShiftAction?.('close')}
                    onReviewClosure={onReviewClosure}
                    t={t}
                />
            )}

            {/* Consume Item Modal */}
            {supplyExamId && (
                <ConsumeItemModal
                    isOpen={Boolean(supplyExamId)}
                    examId={supplyExamId}
                    referenceId={supplyExamId}
                    referenceType="Exam"
                    onClose={() => setSupplyExamId(null)}
                    onSuccess={({ examId }) => {
                        setSupplyExamId(null);
                        if (examId) {
                            setConsumedExamIds((prev) => new Set([...prev, examId]));
                        }
                        onSupplyConsumed?.(examId);
                    }}
                />
            )}
        </div>
    );
};

// Queue Table Row Component
const QueueTableRow = ({
    currency,
    currentShift,
    consumedExamIds,
    item,
    locale,
    canAppendSupplies,
    onCreateInvoice,
    onMoveQueue,
    onOpenPayment,
    onRequestPartialPaymentException,
    onSetSupplyExamId,
    t
}) => {
    const state = getPaymentState(item);
    const balance = Number(item.invoice?.balance_amount || 0);
    const waiting = Number(item.waiting_minutes || 0);
    const exceptionStatus = item.paymentExceptionStatus;
    const isOngoingExam = ['Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting', 'Finalized'].includes(item.queue_stage);
    const isContrastRequired = Boolean(
        item.contrast_required ||
        item.exam_contrast_required ||
        item.exam_type_contrast_required ||
        item.invoice?.contrast_required ||
        (item.exam_type_name && /صبغة|contrast/i.test(item.exam_type_name))
    );
    const hasSupplies = (consumedExamIds && consumedExamIds.has(item.exam_id))
        || Number(item.supplyCount || 0) > 0
        || Boolean(item.has_supplies || item.hasSupplies)
        || (item.supplies && item.supplies.length > 0)
        || (item.consumed_supplies && item.consumed_supplies.length > 0)
        || (item.invoice?.items || []).some(i => /صبغة|contrast|dye/i.test(i.description || ''));

    return (
        <tr className={`transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${state === 'PaymentDue' ? 'bg-amber-50/20' : ''}`}>
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <PriorityBadge priority={item.priority} />
                    <div>
                        <p className="font-black text-slate-900 dark:text-white text-xs">{item.patient_name || t('table.patientFallback')}</p>
                        <p className="font-mono text-[10px] text-slate-400">{item.mrn || '-'}</p>
                    </div>
                </div>
            </td>
            <td className="px-3 py-3">
                <p className="font-bold text-slate-800 dark:text-slate-200">{item.exam_type_name || item.modality_name || '-'}</p>
                <p className="text-[10px] text-slate-500">{item.modality_name} · {item.room_name || item.room_number || '-'}</p>
            </td>
            <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-500">
                    <Clock3 size={12} className="text-slate-400" />
                    <span>{formatDuration(waiting, locale)}</span>
                </span>
            </td>
            <td className="px-3 py-3">
                <StateBadge state={state} t={t} />
                {exceptionStatus && (
                    <div className="mt-1">
                        <ExceptionStatusBadge status={exceptionStatus} t={t} />
                    </div>
                )}
            </td>
            <td className="px-3 py-3 text-end font-mono text-xs font-black">
                {balance > 0 ? (
                    <span className="text-amber-700 dark:text-amber-400">{currency.format(balance)}</span>
                ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">{isPaymentZeroOrCovered(item) ? (locale?.startsWith('ar') ? 'خالص' : 'Fully Paid') : '-'}</span>
                )}
            </td>
            <td className="px-4 py-3 text-end">
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    {state === 'MissingInvoice' && (
                        <button
                            type="button"
                            onClick={() => onCreateInvoice(item.sourceItem || item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition hover:bg-teal-500"
                        >
                            <FilePlus2 size={12} />
                            <span>{t('table.createInvoice')}</span>
                        </button>
                    )}

                    {state === 'PaymentDue' && (
                        isContrastRequired && !hasSupplies ? (
                            <button
                                type="button"
                                onClick={() => onSetSupplyExamId(item.exam_id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition hover:bg-amber-500"
                                title={locale?.startsWith('ar') ? 'يلزم إضافة صبغة الفحص أولاً قبل التحصيل' : 'Must add contrast supply before payment'}
                            >
                                <PackagePlus size={12} />
                                <span>{locale?.startsWith('ar') ? 'إضافة الصبغة أولاً' : 'Add Contrast'}</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onOpenPayment(item.invoice)}
                                disabled={!currentShift}
                                title={!currentShift ? t('billing.openShiftRequired') : undefined}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <CreditCard size={12} />
                                <span>{t('billing.collectPayment')}</span>
                            </button>
                        )
                    )}

                    {state === 'Paid' && (
                        <button
                            type="button"
                            onClick={() => onMoveQueue(item, item.nurse_id ? 'Prep Pending' : 'Ready for Exam')}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                            <CheckCircle2 size={12} />
                            <span>{item.nurse_id ? t('cashier.paidNurse') : t('cashier.paidTech')}</span>
                        </button>
                    )}

                    {canAppendSupplies && item.exam_id && (
                        <button
                            type="button"
                            onClick={() => onSetSupplyExamId(item.exam_id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            title={t('cashier.addSupply')}
                        >
                            <PackagePlus size={13} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
};

const isPaymentZeroOrCovered = (item) => {
    return Number(item.invoice?.balance_amount || 0) <= 0 && Boolean(item.invoice);
};

// Queue Card Component
const QueueCard = ({
    currency,
    currentShift,
    consumedExamIds,
    item,
    locale,
    canAppendSupplies,
    onCreateInvoice,
    onMoveQueue,
    onOpenPayment,
    onRequestPartialPaymentException,
    onSetSupplyExamId,
    t
}) => {
    const state = getPaymentState(item);
    const balance = Number(item.invoice?.balance_amount || 0);
    const waiting = Number(item.waiting_minutes || 0);
    const paymentException = item.paymentException;
    const exceptionStatus = item.paymentExceptionStatus;
    const exceptionTargetStage = item.exceptionTargetStage;

    const isContrastRequired = Boolean(
        item.contrast_required ||
        item.exam_contrast_required ||
        item.exam_type_contrast_required ||
        item.invoice?.contrast_required ||
        (item.exam_type_name && /صبغة|contrast/i.test(item.exam_type_name))
    );
    const hasSupplies = (consumedExamIds && consumedExamIds.has(item.exam_id))
        || Number(item.supplyCount || 0) > 0
        || Boolean(item.has_supplies || item.hasSupplies)
        || (item.supplies && item.supplies.length > 0)
        || (item.consumed_supplies && item.consumed_supplies.length > 0)
        || (item.invoice?.items || []).some(i => /صبغة|contrast|dye/i.test(i.description || ''));
    const isOngoingExam = ['Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting', 'Finalized'].includes(item.queue_stage);
    const isPartialInvoice = item.invoice?.invoice_status === 'Partial' && balance > 0;
    const canRequestException = isPartialInvoice
        && ['Arrived', 'Payment Pending'].includes(item.queue_stage)
        && Boolean(onRequestPartialPaymentException);
    const canRetryException = canRequestException && ['Rejected', 'Expired', 'Used'].includes(exceptionStatus);
    const canAdvanceWithException = exceptionStatus === 'Approved'
        && item.queue_stage === 'Payment Pending'
        && (!isContrastRequired || hasSupplies);
    const requestException = () => onRequestPartialPaymentException({
        invoice: item.invoice,
        transactionType: 'ClinicalQueueTransition',
        amount: balance,
        targetStage: exceptionTargetStage,
        notes: `Requested queue exception to move case into ${exceptionTargetStage}`,
    });

    return (
        <article className={`flex flex-col justify-between min-w-0 rounded-2xl border p-4 transition-all hover:border-slate-300 hover:shadow-sm dark:hover:border-slate-700 ${
            state === 'PaymentDue'
                ? 'border-amber-200 bg-amber-50/40 dark:border-amber-500/20 dark:bg-amber-950/15'
                : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900'
        }`}>
            <div>
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate font-black text-slate-950 dark:text-white text-sm">
                            {item.patient_name || t('table.patientFallback')}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-400 ltr-embed">
                            {item.mrn || '-'}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isOngoingExam && (
                            <span className="inline-flex rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[9.5px] font-bold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
                                {t(`queue.stages.${item.queue_stage}`, { defaultValue: item.queue_stage })}
                            </span>
                        )}
                        <StateBadge state={state} t={t} />
                    </div>
                </div>

                {state === 'PaymentDue' && isOngoingExam && item.supplyTotal > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-amber-300/90 bg-amber-100/60 px-2.5 py-1.5 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <PackagePlus size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="text-[10.5px]">
                            {locale?.startsWith('ar')
                                ? 'تمت إضافة مستلزمات جديدة للفحص يلزم تحصيلها'
                                : 'New supplies added to ongoing exam — balance due'}
                        </span>
                    </div>
                )}

                {paymentException && (
                    <div className="mt-2.5 flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-2.5 py-2 shadow-2xs dark:border-slate-700 dark:bg-slate-900/70">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black text-slate-700 dark:text-slate-200">
                                {t('cashier.exceptionRequest', { defaultValue: 'Partial-payment exception request' })}
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[9.5px] font-semibold text-slate-400" title={paymentException.review_notes || paymentException.reason || ''}>
                                {paymentException.review_notes
                                    || paymentException.reason
                                    || (exceptionStatus === 'Approved'
                                        ? (locale?.startsWith('ar')
                                            ? 'يسري للاستكمال الطبي حتى صدور التقرير؛ التسليم مشروط بالسداد الكامل'
                                            : 'Valid for clinical workflow through reporting; delivery requires full payment')
                                        : t(`queue.stages.${exceptionTargetStage}`, { defaultValue: exceptionTargetStage }))}
                            </p>
                        </div>
                        <ExceptionStatusBadge status={exceptionStatus} t={t} />
                    </div>
                )}

                {isContrastRequired && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                            {hasSupplies ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-teal-700 dark:text-teal-300">
                                    <CheckCircle2 size={12} className="text-teal-600" />
                                    <span>{locale?.startsWith('ar') ? 'تمت إضافة صبغة الفحص' : 'Contrast Added'}</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 dark:text-amber-300">
                                    <AlertTriangle size={12} className="text-amber-600" />
                                    <span>{locale?.startsWith('ar') ? 'فحص بالصبغة — يلزم إضافة المستلزم' : 'Contrast required — add supply'}</span>
                                </span>
                            )}
                        </div>
                        {canAppendSupplies && item.exam_id && (
                            <button
                                type="button"
                                onClick={() => onSetSupplyExamId(item.exam_id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-black text-amber-800 shadow-2xs hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                            >
                                <PackagePlus size={11} />
                                <span>{t('cashier.addSupply')}</span>
                            </button>
                        )}
                    </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800/80 text-xs">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('cashier.exam')}</p>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{item.exam_type_name || item.modality_name || '-'}</p>
                    </div>
                    <div className="text-end">
                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('cashier.waiting')}</p>
                        <p className="font-mono font-bold text-slate-600 dark:text-slate-300">{formatDuration(waiting, locale)}</p>
                    </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-50/80 p-2.5 dark:bg-slate-950/60">
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('cashier.balance')}</span>
                        <p className="font-mono text-base font-black text-slate-900 dark:text-white">
                            {currency.format(balance)}
                        </p>
                    </div>
                    <PriorityBadge priority={item.priority} />
                </div>
            </div>

            {/* Action Bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                {state === 'MissingInvoice' && (
                    <button
                        type="button"
                        onClick={() => onCreateInvoice(item.sourceItem || item)}
                        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                    >
                        <FilePlus2 size={13} />
                        {t('table.createInvoice')}
                    </button>
                )}

                {state === 'PaymentDue' && (
                    isContrastRequired && !hasSupplies ? (
                        <button
                            type="button"
                            onClick={() => onSetSupplyExamId(item.exam_id)}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-black text-white shadow-sm shadow-amber-600/20 transition hover:bg-amber-700 active:scale-95 sm:flex-none"
                            title={locale?.startsWith('ar') ? 'يلزم إضافة صبغة الفحص أولاً قبل التحصيل' : 'Must add contrast supply before payment'}
                        >
                            <PackagePlus size={13} />
                            {locale?.startsWith('ar') ? 'إضافة الصبغة أولاً' : 'Add Contrast First'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onOpenPayment(item.invoice)}
                            disabled={!currentShift}
                            title={!currentShift ? t('billing.openShiftRequired') : undefined}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 sm:flex-none"
                        >
                            <CreditCard size={13} />
                            {t('billing.collectPayment')}
                        </button>
                    )
                )}

                {canAdvanceWithException && (
                    <button
                        type="button"
                        onClick={() => onMoveQueue(item, exceptionTargetStage)}
                        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-black text-white shadow-xs transition hover:bg-slate-800 active:scale-95 dark:bg-teal-600 dark:hover:bg-teal-500"
                    >
                        <CheckCircle2 size={13} />
                        {exceptionTargetStage === 'Prep Pending' ? t('cashier.paidNurse') : t('cashier.paidTech')}
                    </button>
                )}

                {canRequestException && (!paymentException || canRetryException) && (
                    <button
                        type="button"
                        onClick={requestException}
                        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100 active:scale-95 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 sm:flex-none"
                    >
                        {canRetryException ? <RotateCcw size={13} /> : <ShieldCheck size={13} />}
                        {canRetryException
                            ? t('billing.retryException', { defaultValue: 'Request again' })
                            : t('billing.requestException', { defaultValue: 'Request exception' })}
                    </button>
                )}

                {state === 'Paid' && (
                    <>
                        <button
                            type="button"
                            onClick={() => onMoveQueue(item, 'Prep Pending')}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-2.5 text-xs font-black text-teal-700 transition hover:bg-teal-100 active:scale-95 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300 sm:flex-none"
                        >
                            <CheckCircle2 size={13} />
                            {t('cashier.paidNurse')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onMoveQueue(item, 'Ready for Exam')}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 sm:flex-none"
                        >
                            <CheckCircle2 size={13} />
                            {t('cashier.paidTech')}
                        </button>
                    </>
                )}
            </div>
        </article>
    );
};

const StateBadge = ({ state, t }) => (
    <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider ${stateStyles[state]}`}>
        {t(`cashier.filters.${state}`, { defaultValue: state })}
    </span>
);

const ExceptionStatusBadge = ({ status, t }) => {
    const config = {
        Pending: {
            className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
            label: t('billing.exceptionPending', { defaultValue: 'Pending review' }),
        },
        Approved: {
            className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
            label: t('billing.exceptionApproved', { defaultValue: 'Exception approved' }),
        },
        Rejected: {
            className: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
            label: t('billing.exceptionRejected', { defaultValue: 'Request rejected' }),
        },
        Expired: {
            className: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            label: t('billing.exceptionExpired', { defaultValue: 'Approval expired' }),
        },
        Used: {
            className: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
            label: t('billing.exceptionUsed', { defaultValue: 'Exception used' }),
        },
    };
    const item = config[status] || {
        className: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        label: t(`cashier.exceptionFilters.${status}`, { defaultValue: status }),
    };
    return (
        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[9.5px] font-black ${item.className}`}>
            {item.label}
        </span>
    );
};

export default CashierQueueTab;
