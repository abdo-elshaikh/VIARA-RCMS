import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Banknote,
    Bell,
    Calculator,
    CheckCircle2,
    ChevronDown,
    Clock3,
    CreditCard,
    FilePlus2,
    Filter,
    LayoutGrid,
    Landmark,
    List,
    LockKeyhole,
    PackagePlus,
    Printer,
    Receipt,
    RefreshCw,
    RotateCcw,
    Search,
    Shield,
    ShieldCheck,
    SlidersHorizontal,
    User,
    Wallet,
    WalletCards,
    X,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBroadcastPatientCallMutation } from '../../store/api';
import { playHospitalChime } from '../../utils/audioChime';
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
const PAGE_SIZE_OPTIONS = [10, 20, 40, 80];

const getPaymentState = (item) => {
    if (!item.invoice || item.invoice.invoice_status === 'Voided') return 'MissingInvoice';
    return Number(item.invoice.balance_amount || 0) > 0 ? 'PaymentDue' : 'Paid';
};
const matchesWorkstationSelection = (selection, candidates) => {
    const candidateKeys = new Set(candidates.filter(Boolean).map((value) => String(value).trim().toLocaleLowerCase()));
    return selection.some((value) => candidateKeys.has(String(value).trim().toLocaleLowerCase()));
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
    currentUserId = null,
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
    receptionScope = 'all',
    selectedRooms = [],
    selectedModalities = [],
    receptionShift,
    stockMovements = [],
    t
}) => {
    const isAr = locale?.startsWith('ar');
    const [activeSubTab, setActiveSubTab] = useState('queue');
    const [viewMode, setViewMode] = useState(() => {
        try { return localStorage.getItem('viara_cashier_view') || 'table'; } catch { return 'table'; }
    });
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const [readiness, setReadiness] = useState('All');
    const [exceptionFilter, setExceptionFilter] = useState('All');
    const [sortBy, setSortBy] = useState('urgency');
    const [showFilters, setShowFilters] = useState(false);
    const [supplyExamId, setSupplyExamId] = useState(null);
    const [consumedExamIds, setConsumedExamIds] = useState(() => new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const currency = useMemo(() => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
        style: 'currency', currency: 'EGP', maximumFractionDigits: 2
    }), [locale]);

    useEffect(() => {
        try { localStorage.setItem('viara_cashier_view', viewMode); } catch { /* ignore restricted storage */ }
    }, [viewMode]);

    const [broadcastPatientCall] = useBroadcastPatientCallMutation();
    const handleCallPatient = useCallback(async (item) => {
        const token = item.order_number || item.invoice?.invoice_number || '---';
        const patName = item.patient_name || item.invoice?.patient_name || '';
        try {
            await broadcastPatientCall({
                orderNumber: token,
                patientName: patName,
                queueNumber: item.queue_number || null,
                roomName: isAr ? 'الخزينة' : 'Cashier',
                deskIdentifier: 'الخزينة',
                modalityId: item.modality_id || null,
                callByName: Boolean(patName),
            }).unwrap();
            playHospitalChime();
            toast.success(isAr ? `تم نداء المريض ${patName || token} للتوجه إلى الخزينة` : `Patient ${patName || token} called to Cashier`);
        } catch (error) {
            toast.error(isAr ? '\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0646\u062f\u0627\u0621. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.' : (error?.data?.message || 'Could not send the patient call. Please try again.'));
        }
    }, [broadcastPatientCall, isAr]);

    // Pre-index invoice and stock data once. This avoids repeatedly scanning large arrays for every queue row.
    const invoiceIndex = useMemo(() => {
        const byExam = new Map();
        const byAppointment = new Map();
        invoices.forEach((invoice) => {
            if (invoice.exam_id) byExam.set(String(invoice.exam_id), invoice);
            if (invoice.appointment_id) byAppointment.set(String(invoice.appointment_id), invoice);
        });
        return { byExam, byAppointment };
    }, [invoices]);

    const movementIndex = useMemo(() => {
        const map = new Map();
        stockMovements.forEach((movement) => {
            if (movement.reference_type !== 'Exam' || !movement.reference_id) return;
            const key = String(movement.reference_id);
            const list = map.get(key) || [];
            list.push(movement);
            map.set(key, list);
        });
        return map;
    }, [stockMovements]);

    const queue = useMemo(() => items.map((item) => {
        const consumedSupplies = movementIndex.get(String(item.exam_id)) || [];
        const invoice = item.invoice
            || (item.exam_id ? invoiceIndex.byExam.get(String(item.exam_id)) : null)
            || (item.appointment_id ? invoiceIndex.byAppointment.get(String(item.appointment_id)) : null);
        const movementSupplyTotal = consumedSupplies.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0);
        const invoiceSupplyItems = (invoice?.items || []).filter(i => /مستلزم|supply|contrast|صبغة|سرنجة|قسطرة|شاش/i.test(i.description || ''));
        const invoiceSupplyTotal = invoiceSupplyItems.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
        const optimistic = consumedExamIds.has(item.exam_id);
        const hasExamSupplies = Boolean(item.has_supplies || item.hasSupplies) || (item.supplies && item.supplies.length > 0) || (item.consumed_supplies && item.consumed_supplies.length > 0);
        const supplyTotal = Math.max(movementSupplyTotal, invoiceSupplyTotal, optimistic ? 1 : 0);
        const supplyCount = Math.max(
            consumedSupplies.reduce((sum, movement) => sum + Math.abs(Number(movement.quantity_change || 0)), 0),
            invoiceSupplyItems.length,
            optimistic || hasExamSupplies ? 1 : 0
        );
        const hasNurse = Boolean(item.nurse_name || item.nurse_id);
        const exceptionTargetStage = hasNurse ? 'Prep Pending' : 'Ready for Exam';
        const paymentException = findPartialPaymentException(partialPaymentExceptions, invoice?.invoice_id, exceptionTargetStage);
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
    }), [consumedExamIds, invoiceIndex, items, movementIndex, partialPaymentExceptions]);

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
    }), [currentShift]);

    const filteredAndSorted = useMemo(() => {
        const tokens = deferredSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        let list = queue.filter((item) => {
            const searchable = [item.patient_name, item.mrn, item.exam_type_name, item.modality_name, item.invoice?.invoice_number, item.order_number]
                .filter(Boolean).join(' ').toLocaleLowerCase();
            return (readiness === 'All' || getPaymentState(item) === readiness)
                && (exceptionFilter === 'All' || item.paymentExceptionStatus === exceptionFilter)
                && tokens.every((token) => searchable.includes(token));
        });
        if (receptionScope === 'rooms' && selectedRooms.length === 0) list = [];
        if (receptionScope === 'modalities' && selectedModalities.length === 0) list = [];
        if (selectedRooms.length > 0) {
            list = list.filter((item) => matchesWorkstationSelection(selectedRooms, [
                item.room_id,
                item.room_number,
                item.room_name,
                item.appointment?.room_id,
                item.appointment?.room_number,
                item.appointment?.room_name,
            ]));
        }
        if (selectedModalities.length > 0) {
            list = list.filter((item) => matchesWorkstationSelection(selectedModalities, [
                item.modality_id,
                item.modality_name,
                item.modality_type,
                item.machine_name,
                item.appointment?.modality_id,
                item.appointment?.modality_name,
                item.appointment?.modality_type,
                item.appointment?.machine_name,
            ]));
        }
        if (receptionScope === 'mine') {
            list = list.filter((item) => {
                const assignedTo = item.receptionist_id ?? item.assigned_receptionist_id ?? item.assignee_id ?? item.appointment?.receptionist_id ?? item.appointment?.assigned_receptionist_id;
                return assignedTo !== null && assignedTo !== undefined && String(assignedTo) === String(currentUserId);
            });
        } else if (receptionScope === 'unclaimed') {
            list = list.filter((item) => {
                const assignedTo = item.receptionist_id ?? item.assigned_receptionist_id ?? item.assignee_id ?? item.appointment?.receptionist_id ?? item.appointment?.assigned_receptionist_id;
                return !assignedTo;
            });
        } else if (receptionScope === 'attention') {
            list = list.filter((item) => {
                const assignedTo = item.receptionist_id ?? item.assigned_receptionist_id ?? item.assignee_id ?? item.appointment?.receptionist_id ?? item.appointment?.assigned_receptionist_id;
                const unclaimed = !assignedTo && ['Scheduled', 'Arrived'].includes(item.queue_stage);
                return ['Emergency', 'Urgent'].includes(item.priority) || Boolean(item.is_overdue) || unclaimed;
            });
        } else if (receptionScope === 'emergency') {
            list = list.filter((item) => ['Emergency', 'Urgent'].includes(item.priority));
        } else if (receptionScope === 'inExam') {
            list = list.filter((item) => item.queue_stage === 'In Exam');
        }
        list.sort((first, second) => {
            if (sortBy === 'urgency') return (priorityRank[first.priority] ?? 3) - (priorityRank[second.priority] ?? 3) || Number(second.waiting_minutes || 0) - Number(first.waiting_minutes || 0);
            if (sortBy === 'wait') return Number(second.waiting_minutes || 0) - Number(first.waiting_minutes || 0);
            if (sortBy === 'balance') return Number(second.invoice?.balance_amount || 0) - Number(first.invoice?.balance_amount || 0);
            if (sortBy === 'name') return (first.patient_name || '').localeCompare(second.patient_name || '');
            return 0;
        });
        return list;
    }, [currentUserId, deferredSearch, exceptionFilter, queue, readiness, receptionScope, selectedModalities, selectedRooms, sortBy]);

    useEffect(() => { setCurrentPage(1); }, [exceptionFilter, deferredSearch, readiness, sortBy, pageSize]);
    const paginationState = useMemo(() => getPaginationState(filteredAndSorted.length, currentPage, pageSize), [filteredAndSorted.length, currentPage, pageSize]);
    const paginatedItems = useMemo(() => filteredAndSorted.slice(paginationState.startIndex, paginationState.endIndex), [filteredAndSorted, paginationState.endIndex, paginationState.startIndex]);

    const shiftReceipts = useMemo(() => {
        if (Array.isArray(currentShift?.payments) && currentShift.payments.length > 0) return currentShift.payments;
        const receipts = [];
        const seen = new Set();
        invoices.forEach((inv) => (inv.payments || []).forEach((pay) => {
            if (pay.payment_status !== 'Completed') return;
            if (pay.payment_id && seen.has(pay.payment_id)) return;
            if (pay.payment_id) seen.add(pay.payment_id);
            receipts.push({ ...pay, patient_name: inv.patient_name || pay.patient_name || t('table.patientFallback'), mrn: inv.mrn || pay.mrn || '-', invoice_number: inv.invoice_number || pay.invoice_number || '-', invoice_id: inv.invoice_id || pay.invoice_id });
        }));
        receipts.sort((a, b) => new Date(b.transaction_date || b.created_at) - new Date(a.transaction_date || a.created_at));
        return receipts;
    }, [currentShift, invoices, t]);

    const paymentMethodTotals = useMemo(() => shiftReceipts.reduce((acc, rec) => {
        const raw = String(rec.method || 'Cash');
        const key = /cash/i.test(raw) ? 'Cash'
            : /card|credit/i.test(raw) ? 'Card'
                : /wallet/i.test(raw) ? 'Wallet'
                    : /bank/i.test(raw) ? 'Bank Transfer'
                        : 'Other';
        acc[key] = (acc[key] || 0) + Number(rec.amount || 0);
        return acc;
    }, { Cash: 0, Card: 0, Wallet: 0, 'Bank Transfer': 0, Other: 0 }), [shiftReceipts]);

    const activeFilterCount = Number(readiness !== 'All') + Number(exceptionFilter !== 'All') + Number(sortBy !== 'urgency');

    const chooseReadiness = (value) => {
        setReadiness(value);
        setActiveSubTab('queue');
    };

    const readinessChips = [
        { id: 'All', label: isAr ? 'الكل' : 'All', count: queue.length, tone: 'teal' },
        { id: 'PaymentDue', label: isAr ? 'مطلوب تحصيل' : 'Payment due', count: summary.due, tone: 'amber' },
        { id: 'MissingInvoice', label: isAr ? 'بدون فاتورة' : 'No invoice', count: summary.missing, tone: 'rose' },
        { id: 'Paid', label: isAr ? 'تم السداد' : 'Paid', count: summary.paid, tone: 'emerald' },
    ];

    const subTabs = [
        { id: 'queue', icon: CreditCard, label: isAr ? 'التحصيل' : 'Collection', count: queue.length },
        { id: 'ledger', icon: Receipt, label: isAr ? 'الإيصالات' : 'Receipts', count: shiftSummary.payments },
        ...(canCloseShift ? [{ id: 'reconciliation', icon: Calculator, label: isAr ? 'جرد الدرج' : 'Drawer count' }] : []),
        ...(canReviewShiftVariance ? [{ id: 'supervisor', icon: ShieldCheck, label: isAr ? 'الإشراف' : 'Supervisor' }] : []),
    ];

    return (
        <div className="space-y-3">
            {/* Compact finance command deck */}
            <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.45)]">
                <header className="border-b border-[var(--VIARA-line)] bg-gradient-to-br from-teal-500/[0.07] via-[var(--VIARA-surface)] to-emerald-500/[0.03] px-4 py-3.5 sm:px-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm shadow-teal-600/20">
                                <WalletCards size={19} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-black text-[var(--VIARA-ink)] sm:text-lg">{isAr ? 'الخزينة والتحصيل' : 'Cashier & Collection'}</h2>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black ${currentShift ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${currentShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        {currentShift ? (isAr ? 'الوردية مفتوحة' : 'Shift open') : (isAr ? 'الوردية مغلقة' : 'Shift closed')}
                                    </span>
                                    {summary.urgent > 0 && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                                            <AlertTriangle size={10} /> {summary.urgent} {isAr ? 'عاجل' : 'urgent'}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-0.5 truncate text-xs font-medium text-[var(--VIARA-muted)]">{isAr ? 'تحصيل أسرع، متابعة الرصيد، الإيصالات، وجرد الوردية من شاشة واحدة.' : 'Collect payments, track balances, receipts and drawer reconciliation from one workspace.'}</p>
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <div className="hidden rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 text-[10.5px] font-bold text-[var(--VIARA-muted)] md:block">
                                <span>{isAr ? 'العهدة' : 'Float'} </span>
                                <strong className="font-mono text-[var(--VIARA-ink)]">{currency.format(shiftSummary.opening)}</strong>
                            </div>
                            {currentShift && canCloseShift ? (
                                <button type="button" onClick={() => onShiftAction?.('close')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[11px] font-black text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                                    <LockKeyhole size={13} /> {isAr ? 'تقفيل الوردية' : 'Close shift'}
                                </button>
                            ) : !currentShift && canOpenShift ? (
                                <button type="button" onClick={() => onShiftAction?.('open')} disabled={isLoadingShift} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-[11px] font-black text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-50">
                                    <WalletCards size={13} /> {isAr ? 'فتح وردية' : 'Open shift'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </header>

                {/* High-value operational metrics; clicking takes the operator straight to work. */}
                <div className="grid grid-cols-2 border-b border-[var(--VIARA-line)] lg:grid-cols-4">
                    <button type="button" onClick={() => setActiveSubTab('ledger')} className="group border-e border-b border-[var(--VIARA-line)] p-3 text-start transition hover:bg-emerald-50/40 dark:hover:bg-emerald-950/15 lg:border-b-0">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]"><span>{isAr ? 'متحصل الوردية' : 'Shift collected'}</span><Receipt size={13} className="text-emerald-600" /></span>
                        <strong className="mt-1 block font-mono text-lg font-black text-emerald-700 dark:text-emerald-300">{currency.format(shiftSummary.collected)}</strong>
                        <span className="text-[10px] font-semibold text-[var(--VIARA-muted)]">{shiftSummary.payments} {isAr ? 'عملية' : 'payments'}</span>
                    </button>
                    <button type="button" onClick={() => chooseReadiness('PaymentDue')} className="group border-b border-[var(--VIARA-line)] p-3 text-start transition hover:bg-amber-50/50 dark:hover:bg-amber-950/15 lg:border-e lg:border-b-0">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]"><span>{isAr ? 'مطلوب تحصيله' : 'Outstanding'}</span><CreditCard size={13} className="text-amber-600" /></span>
                        <strong className="mt-1 block font-mono text-lg font-black text-amber-700 dark:text-amber-300">{currency.format(summary.outstanding)}</strong>
                        <span className="text-[10px] font-semibold text-[var(--VIARA-muted)]">{summary.due} {isAr ? 'حالة' : 'cases'}</span>
                    </button>
                    <button type="button" onClick={() => chooseReadiness('MissingInvoice')} className="group border-e border-[var(--VIARA-line)] p-3 text-start transition hover:bg-rose-50/40 dark:hover:bg-rose-950/15">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]"><span>{isAr ? 'تحتاج فاتورة' : 'Need invoice'}</span><FilePlus2 size={13} className="text-rose-600" /></span>
                        <strong className="mt-1 block font-mono text-lg font-black text-[var(--VIARA-ink)]">{summary.missing}</strong>
                        <span className="text-[10px] font-semibold text-[var(--VIARA-muted)]">{isAr ? 'جاهزة للإنشاء' : 'ready to create'}</span>
                    </button>
                    <button type="button" onClick={() => chooseReadiness('All')} className="group p-3 text-start transition hover:bg-teal-50/40 dark:hover:bg-teal-950/15">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]"><span>{isAr ? 'طابور الخزينة' : 'Cashier queue'}</span><User size={13} className="text-teal-600" /></span>
                        <strong className="mt-1 block font-mono text-lg font-black text-[var(--VIARA-ink)]">{queue.length}</strong>
                        <span className="text-[10px] font-semibold text-[var(--VIARA-muted)]">{summary.paid} {isAr ? 'مسدد' : 'paid'}</span>
                    </button>
                </div>

                {/* Secondary navigation kept inside the same surface to save vertical space. */}
                <nav className="flex items-center gap-1 overflow-x-auto px-2 py-2" aria-label={isAr ? 'أقسام الخزينة' : 'Cashier sections'}>
                    {subTabs.map(({ id, icon: Icon, label, count }) => {
                        const active = activeSubTab === id;
                        return (
                            <button key={id} type="button" onClick={() => setActiveSubTab(id)} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black transition ${active ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/15' : 'text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)]'}`}>
                                <Icon size={13} /> <span>{label}</span>
                                {count !== undefined && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] ${active ? 'bg-white/20 text-white' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'}`}>{count}</span>}
                            </button>
                        );
                    })}
                </nav>
            </section>

            {activeSubTab === 'queue' && (
                <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.42)]">
                    <div className="border-b border-[var(--VIARA-line)] px-4 py-3 sm:px-5">
                        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
                            <label className="relative min-w-0 flex-1 xl:max-w-xl">
                                <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400" />
                                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isAr ? 'ابحث بالاسم، MRN، الفحص، رقم الفاتورة أو الطلب...' : 'Search patient, MRN, exam, invoice or order...'} className="h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] ps-10 pe-10 text-sm font-bold text-[var(--VIARA-ink)] outline-none transition placeholder:font-medium placeholder:text-[var(--VIARA-muted)] focus:border-teal-500 focus:bg-[var(--VIARA-surface)] focus:ring-4 focus:ring-teal-500/10" />
                                {search && <button type="button" onClick={() => setSearch('')} className="absolute end-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface)]"><X size={13} /></button>}
                            </label>

                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 xl:justify-end">
                                <select
                                    aria-label={t('cashier.readinessFilter')}
                                    value={readiness}
                                    onChange={(e) => setReadiness(e.target.value)}
                                    className="sr-only"
                                >
                                    <option value="All">{t('cashier.filters.All', { defaultValue: 'All' })}</option>
                                    <option value="MissingInvoice">{t('cashier.filters.MissingInvoice', { defaultValue: 'MissingInvoice' })}</option>
                                    <option value="PaymentDue">{t('cashier.filters.PaymentDue', { defaultValue: 'PaymentDue' })}</option>
                                    <option value="Paid">{t('cashier.filters.Paid', { defaultValue: 'Paid' })}</option>
                                </select>
                                <select
                                    aria-label={t('cashier.exceptionFilter', { defaultValue: 'Filter by exception request status' })}
                                    value={exceptionFilter}
                                    onChange={(e) => setExceptionFilter(e.target.value)}
                                    className="sr-only"
                                >
                                    <option value="All">{t('cashier.exceptionFilters.All', { defaultValue: 'All' })}</option>
                                    <option value="Pending">{t('cashier.exceptionFilters.Pending', { defaultValue: 'Pending' })}</option>
                                    <option value="Approved">{t('cashier.exceptionFilters.Approved', { defaultValue: 'Approved' })}</option>
                                    <option value="Rejected">{t('cashier.exceptionFilters.Rejected', { defaultValue: 'Rejected' })}</option>
                                </select>
                                {readinessChips.map((chip) => {
                                    const active = readiness === chip.id;
                                    return <button key={chip.id} type="button" onClick={() => setReadiness(chip.id)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-black transition ${active ? 'border-teal-600 bg-teal-600 text-white shadow-sm' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}><span>{chip.label}</span><span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] ${active ? 'bg-white/20' : 'bg-[var(--VIARA-surface-muted)]'}`}>{chip.count}</span></button>;
                                })}
                                <button type="button" onClick={() => setShowFilters(v => !v)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-black transition ${showFilters || activeFilterCount ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300' : 'border-[var(--VIARA-line)] text-[var(--VIARA-muted)]'}`}><Filter size={13} />{isAr ? 'فلاتر' : 'Filters'}{activeFilterCount > 0 && <span className="rounded-full bg-teal-600 px-1.5 py-0.5 font-mono text-[9px] text-white">{activeFilterCount}</span>}<ChevronDown size={11} className={showFilters ? 'rotate-180' : ''} /></button>
                                <div className="inline-flex rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-0.5">
                                    <button type="button" onClick={() => setViewMode('table')} className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'table' ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm' : 'text-[var(--VIARA-muted)]'}`} title={isAr ? 'جدول' : 'Table'}><List size={14} /></button>
                                    <button type="button" onClick={() => setViewMode('grid')} className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'grid' ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm' : 'text-[var(--VIARA-muted)]'}`} title={isAr ? 'بطاقات' : 'Cards'}><LayoutGrid size={14} /></button>
                                </div>
                                {onRefresh && <button type="button" onClick={onRefresh} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--VIARA-line)] text-[var(--VIARA-muted)] transition hover:text-teal-700" title={isAr ? 'تحديث' : 'Refresh'}><RefreshCw size={13} /></button>}
                            </div>
                        </div>

                        {showFilters && (
                            <div className="mt-2.5 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-[#091222] sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                                <select aria-label={t('cashier.exceptionFilter', { defaultValue: 'Filter by exception request status' })} value={exceptionFilter} onChange={(e) => setExceptionFilter(e.target.value)} className="h-9 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-bold text-[var(--VIARA-ink)] outline-none focus:border-teal-500">
                                    <option value="All">{isAr ? 'كل الاستثناءات' : 'All exceptions'}</option><option value="Pending">{isAr ? 'استثناء قيد المراجعة' : 'Pending exception'}</option><option value="Approved">{isAr ? 'استثناء معتمد' : 'Approved exception'}</option><option value="Rejected">{isAr ? 'استثناء مرفوض' : 'Rejected exception'}</option>
                                </select>
                                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-9 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-bold text-[var(--VIARA-ink)] outline-none focus:border-teal-500">
                                    <option value="urgency">{isAr ? 'الأولوية ثم الانتظار' : 'Urgency then wait'}</option><option value="wait">{isAr ? 'الأطول انتظاراً' : 'Longest wait'}</option><option value="balance">{isAr ? 'أعلى رصيد' : 'Highest balance'}</option><option value="name">{isAr ? 'اسم المريض' : 'Patient name'}</option>
                                </select>
                                <button type="button" onClick={() => { setExceptionFilter('All'); setSortBy('urgency'); }} className="h-9 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-[11px] font-black text-[var(--VIARA-muted)] hover:text-rose-600">{isAr ? 'إعادة ضبط' : 'Reset'}</button>
                            </div>
                        )}

                        {(summary.pendingExceptions > 0 || summary.approvedExceptions > 0) && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] font-bold text-[var(--VIARA-muted)]">
                                {summary.pendingExceptions > 0 && <button type="button" onClick={() => { setExceptionFilter('Pending'); setShowFilters(true); }} className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300"><ShieldCheck size={11} />{summary.pendingExceptions} {isAr ? 'طلبات استثناء تنتظر المراجعة' : 'exception requests pending'}</button>}
                                {summary.approvedExceptions > 0 && <button type="button" onClick={() => { setExceptionFilter('Approved'); setShowFilters(true); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={11} />{summary.approvedExceptions} {isAr ? 'استثناءات معتمدة جاهزة للاستكمال' : 'approved exceptions ready'}</button>}
                            </div>
                        )}
                    </div>

                    {filteredAndSorted.length === 0 ? (
                        <div className="p-8"><EmptyState icon={CreditCard} title={t('cashier.empty')} description={search || readiness !== 'All' || exceptionFilter !== 'All' ? t('cashier.noFilterResults') : t('cashier.emptySubtitle')} /></div>
                    ) : viewMode === 'table' ? (
                        <div className="max-h-[62vh] overflow-auto">
                            <table className="w-full min-w-[920px] text-start text-xs">
                                <thead className="sticky top-0 z-10 border-b-2 border-slate-300 bg-slate-100 text-[10px] font-black uppercase tracking-[.07em] text-slate-700 dark:border-slate-700 dark:bg-[#091222] dark:text-slate-300">
                                    <tr><th className="px-4 py-2.5 text-start">{t('table.patient')}</th><th className="px-3 py-2.5 text-start">{t('table.machineExam')}</th><th className="px-3 py-2.5 text-center">{t('cashier.waiting')}</th><th className="px-3 py-2.5 text-start">{t('table.financialStatus')}</th><th className="px-3 py-2.5 text-end">{t('cashier.balance')}</th><th className="px-4 py-2.5 text-end">{t('table.actions')}</th></tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--VIARA-line)]">{paginatedItems.map((item) => <QueueTableRow key={item.work_item_id || item.appointment_id || item.exam_id} currency={currency} currentShift={currentShift} consumedExamIds={consumedExamIds} item={item} locale={locale} canAppendSupplies={canAppendSupplies} onCreateInvoice={onCreateInvoice} onMoveQueue={onMoveQueue} onOpenPayment={onOpenPayment} onRequestPartialPaymentException={onRequestPartialPaymentException} onSetSupplyExamId={setSupplyExamId} onCallPatient={handleCallPatient} t={t} />)}</tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">{paginatedItems.map((item) => <QueueCard key={item.work_item_id || item.appointment_id || item.exam_id} currency={currency} currentShift={currentShift} consumedExamIds={consumedExamIds} item={item} locale={locale} canAppendSupplies={canAppendSupplies} onCreateInvoice={onCreateInvoice} onMoveQueue={onMoveQueue} onOpenPayment={onOpenPayment} onRequestPartialPaymentException={onRequestPartialPaymentException} onSetSupplyExamId={setSupplyExamId} onCallPatient={handleCallPatient} t={t} />)}</div>
                    )}

                    {filteredAndSorted.length > 0 && <div className="border-t border-[var(--VIARA-line)] p-3"><Pagination currentPage={paginationState.currentPage} totalPages={paginationState.totalPages} totalItems={filteredAndSorted.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} pageSizeOptions={PAGE_SIZE_OPTIONS} /></div>}
                </section>
            )}

            {activeSubTab === 'reconciliation' && <CashDrawerReconciliation currentShift={currentShift} reconciliationData={currentShift} onReconcile={onReconcile} isLoading={isLoadingShift} t={t} />}

            {activeSubTab === 'ledger' && (
                <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.42)]">
                    <header className="flex flex-col gap-3 border-b border-[var(--VIARA-line)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Receipt size={17} /></span><div><h3 className="text-sm font-black text-[var(--VIARA-ink)]">{isAr ? 'سجل متحصلات الوردية' : 'Shift receipts ledger'}</h3><p className="text-[10.5px] font-medium text-[var(--VIARA-muted)]">{isAr ? 'كل عمليات الدفع المكتملة مع إعادة طباعة الإيصال.' : 'Completed payments with instant receipt reprint.'}</p></div></div>
                        <strong className="font-mono text-base font-black text-emerald-700 dark:text-emerald-300">{currency.format(shiftSummary.collected)}</strong>
                    </header>
                    <div className="grid grid-cols-2 border-b border-[var(--VIARA-line)] sm:grid-cols-5">
                        {[
                            ['Cash', Banknote, paymentMethodTotals.Cash],
                            ['Card', CreditCard, paymentMethodTotals.Card],
                            ['Wallet', Wallet, paymentMethodTotals.Wallet],
                            ['Bank Transfer', Landmark, paymentMethodTotals['Bank Transfer']],
                            ['Other', Receipt, paymentMethodTotals.Other]
                        ].map(([key, Icon, amount], idx) => <div key={key} className={`p-3 ${idx < 4 ? 'border-e border-[var(--VIARA-line)]' : ''}`}><span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]"><Icon size={12} className="text-teal-600" />{key === 'Other' ? (isAr ? 'أخرى' : 'Other') : t(`billing.methods.${key}`, { defaultValue: key })}</span><strong className="mt-1 block font-mono text-sm font-black text-[var(--VIARA-ink)]">{currency.format(amount)}</strong></div>)}
                    </div>
                    {shiftReceipts.length === 0 ? <div className="p-8"><EmptyState icon={Receipt} title={isAr ? 'لا توجد متحصلات في هذه الوردية' : 'No payments in this shift'} description={isAr ? 'ستظهر الإيصالات هنا فور إتمام التحصيل.' : 'Receipts appear here immediately after collection.'} /></div> : <div className="max-h-[60vh] overflow-auto"><table className="w-full min-w-[760px] text-start text-xs"><thead className="sticky top-0 z-10 border-b border-[var(--VIARA-line-strong)] bg-[var(--VIARA-surface-muted)] text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]"><tr><th className="px-4 py-2.5 text-start">{isAr ? 'الوقت' : 'Time'}</th><th className="px-3 py-2.5 text-start">{isAr ? 'المريض' : 'Patient'}</th><th className="px-3 py-2.5 text-start">{isAr ? 'الفاتورة' : 'Invoice'}</th><th className="px-3 py-2.5 text-start">{isAr ? 'الوسيلة' : 'Method'}</th><th className="px-3 py-2.5 text-end">{isAr ? 'المبلغ' : 'Amount'}</th><th className="px-4 py-2.5 text-end">{isAr ? 'الإجراء' : 'Action'}</th></tr></thead><tbody className="divide-y divide-[var(--VIARA-line)]">{shiftReceipts.map((rec) => <tr key={rec.payment_id} className="transition hover:bg-[var(--VIARA-surface-muted)]/60"><td className="px-4 py-3 font-mono text-[11px] font-bold text-[var(--VIARA-muted)]">{new Date(rec.transaction_date || rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-3"><strong className="block text-[var(--VIARA-ink)]">{rec.patient_name}</strong><span className="font-mono text-[10px] text-[var(--VIARA-muted)]">{rec.mrn}</span></td><td className="px-3 py-3 font-mono font-bold text-[var(--VIARA-accent-text)]">{rec.invoice_number || '-'}</td><td className="px-3 py-3"><span className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-2 py-1 text-[10px] font-black text-[var(--VIARA-ink)]">{rec.method || 'Cash'}</span></td><td className="px-3 py-3 text-end font-mono text-sm font-black text-[var(--VIARA-success)]">{currency.format(Number(rec.amount || 0))}</td><td className="px-4 py-3 text-end"><button type="button" onClick={() => window.open(`/print/receipt/${rec.payment_id}`, '_blank')} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] px-2.5 text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-accent-text)] hover:border-[var(--VIARA-accent)]"><Printer size={12} />{isAr ? 'طباعة' : 'Print'}</button></td></tr>)}</tbody></table></div>}
                </section>
            )}

            {activeSubTab === 'supervisor' && canReviewShiftVariance && <ShiftSupervisorPanel currentShift={currentShift} onOpenShift={() => onShiftAction?.('open')} onCloseShift={() => onShiftAction?.('close')} onReviewClosure={onReviewClosure} t={t} />}

            {supplyExamId && <ConsumeItemModal isOpen={Boolean(supplyExamId)} examId={supplyExamId} referenceId={supplyExamId} referenceType="Exam" onClose={() => setSupplyExamId(null)} onSuccess={({ examId }) => { setSupplyExamId(null); if (examId) setConsumedExamIds((prev) => new Set([...prev, examId])); onSupplyConsumed?.(examId); }} />}
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
    onCallPatient,
    t
}) => {
    const state = getPaymentState(item);
    const balance = Number(item.invoice?.balance_amount || 0);
    const waiting = Number(item.waiting_minutes || 0);
    const paymentException = item.paymentException;
    const exceptionStatus = item.paymentExceptionStatus;
    const exceptionTargetStage = item.exceptionTargetStage;
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
                    <div>
                        <span className="text-amber-700 dark:text-amber-400">{currency.format(balance)}</span>
                        <div className="mt-1 flex justify-end">
                            <PaymentMethodBadge
                                method={item.invoice?.expected_payment_method || item.payment_method}
                                isInsurance={Boolean(item.invoice?.insurance_covered_amount > 0 || item.invoice?.expected_payment_method === 'Insurance')}
                                providerName={item.invoice?.provider_name}
                                isAr={locale?.startsWith('ar')}
                            />
                        </div>
                    </div>
                ) : (
                    <div>
                        <span className="text-emerald-700 dark:text-emerald-400">{isPaymentZeroOrCovered(item) ? (locale?.startsWith('ar') ? 'خالص' : 'Fully Paid') : '-'}</span>
                        {Boolean(item.invoice?.insurance_covered_amount > 0) && (
                            <div className="mt-1 flex justify-end">
                                <PaymentMethodBadge
                                    method="Insurance"
                                    isInsurance
                                    providerName={item.invoice?.provider_name}
                                    isAr={locale?.startsWith('ar')}
                                />
                            </div>
                        )}
                    </div>
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

                    {canAdvanceWithException && (
                        <button
                            type="button"
                            onClick={() => onMoveQueue(item, exceptionTargetStage)}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                        >
                            <CheckCircle2 size={12} />
                            <span>{exceptionTargetStage === 'Prep Pending' ? t('cashier.paidNurse') : t('cashier.paidTech')}</span>
                        </button>
                    )}

                    {canRequestException && (!paymentException || canRetryException) && (
                        <button
                            type="button"
                            onClick={requestException}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                            {canRetryException ? <RotateCcw size={12} /> : <ShieldCheck size={12} />}
                            <span>{canRetryException ? t('billing.retryException', { defaultValue: 'Request again' }) : t('billing.requestException', { defaultValue: 'Request exception' })}</span>
                        </button>
                    )}

                    {state === 'Paid' && (
                        <>
                            <button
                                type="button"
                                onClick={() => onMoveQueue(item, 'Prep Pending')}
                                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700 transition hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300"
                            >
                                <CheckCircle2 size={12} />
                                <span>{t('cashier.paidNurse')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onMoveQueue(item, 'Ready for Exam')}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                            >
                                <CheckCircle2 size={12} />
                                <span>{t('cashier.paidTech')}</span>
                            </button>
                        </>
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

                    {onCallPatient && (
                        <button
                            type="button"
                            onClick={() => onCallPatient(item)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 transition active:scale-95 shadow-2xs"
                            title={locale?.startsWith('ar') ? 'نداء المريض إلى الخزينة على شاشات العرض' : 'Call patient to Cashier on display board'}
                            aria-label={locale?.startsWith('ar') ? 'نداء المريض إلى الخزينة' : 'Call patient to Cashier'}
                        >
                            <Bell size={12} />
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
    onCallPatient,
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('cashier.balance')}</span>
                            <PaymentMethodBadge
                                method={item.invoice?.expected_payment_method || item.payment_method}
                                isInsurance={Boolean(item.invoice?.insurance_covered_amount > 0 || item.invoice?.expected_payment_method === 'Insurance')}
                                providerName={item.invoice?.provider_name}
                                isAr={locale?.startsWith('ar')}
                            />
                        </div>
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

                {onCallPatient && (
                    <button
                        type="button"
                        onClick={() => onCallPatient(item)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 transition active:scale-95 shadow-2xs"
                        title={locale?.startsWith('ar') ? 'نداء المريض إلى الخزينة على شاشات العرض' : 'Call patient to Cashier on display board'}
                        aria-label={locale?.startsWith('ar') ? 'نداء المريض إلى الخزينة' : 'Call patient to Cashier'}
                    >
                        <Bell size={13} />
                    </button>
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

const PaymentMethodBadge = ({ method, isInsurance, providerName, isAr }) => {
    if (!method && !isInsurance) return null;
    const isCard = method === 'Card' || method === 'Credit Card';
    const isWallet = method === 'Wallet';
    const isBank = method === 'Bank Transfer';
    const isCash = method === 'Cash';

    let text = method || 'Cash';
    let colorClass = 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
    let Icon = Banknote;

    if (isInsurance || method === 'Insurance') {
        text = providerName ? `${isAr ? 'تأمين' : 'Insurance'} · ${providerName}` : (isAr ? 'تأمين / تعاقد' : 'Insurance');
        colorClass = 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300';
        Icon = Shield;
    } else if (isCard) {
        text = isAr ? 'بطاقة / فيزا' : 'Card';
        colorClass = 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300';
        Icon = CreditCard;
    } else if (isWallet) {
        text = isAr ? 'محفظة إلكترونية' : 'Wallet';
        colorClass = 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
        Icon = Wallet;
    } else if (isBank) {
        text = isAr ? 'تحويل بنكي' : 'Bank Transfer';
        colorClass = 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300';
        Icon = Landmark;
    } else if (isCash) {
        text = isAr ? 'نقدي' : 'Cash';
        colorClass = 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
        Icon = Banknote;
    }

    return (
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold ${colorClass}`}>
            <Icon size={10} className="shrink-0" />
            <span className="truncate max-w-[130px]">{text}</span>
        </span>
    );
};

export default CashierQueueTab;
