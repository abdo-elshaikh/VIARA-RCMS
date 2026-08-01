import React, { useMemo, useState } from 'react';
import {
    AlertCircle,
    Banknote,
    CheckCircle2,
    Clock3,
    CreditCard,
    FilePlus2,
    PackagePlus,
    Receipt,
    Search,
    WalletCards
} from 'lucide-react';
import { formatDuration } from '../../utils/dateFormat';
import ConsumeItemModal from '../inventory/ConsumeItemModal';
import PriorityBadge from '../ui/PriorityBadge';
import EmptyState from '../ui/EmptyState';

const priorityRank = { Emergency: 0, Urgent: 1, Routine: 2 };

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
    currentShift,
    invoices,
    isLoadingShift,
    items,
    locale,
    onCreateInvoice,
    onMoveQueue,
    onOpenPayment,
    onShiftAction,
    stockMovements = [],
    t
}) => {
    const [search, setSearch] = useState('');
    const [readiness, setReadiness] = useState('All');
    const [supplyExamId, setSupplyExamId] = useState(null);

    const currency = useMemo(() => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 2
    }), [locale]);

    const queue = useMemo(() => items.map(item => {
        const consumedSupplies = stockMovements.filter((movement) => movement.reference_type === 'Exam' && movement.reference_id === item.exam_id);
        return {
            ...item,
            sourceItem: item,
            invoice: invoices.find((invoice) => invoice.appointment_id === item.appointment_id || invoice.exam_id === item.exam_id),
            supplyTotal: consumedSupplies.reduce((sum, movement) => sum + Number(movement.total_amount || (Math.abs(Number(movement.quantity_change || 0)) * Number(movement.unit_price || 0))), 0),
            supplyCount: consumedSupplies.reduce((sum, movement) => sum + Math.abs(Number(movement.quantity_change || 0)), 0)
        };
    }), [invoices, items, stockMovements]);

    const filtered = useMemo(() => {
        const tokens = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return queue.filter((item) => {
            const searchable = [item.patient_name, item.mrn, item.exam_type_name, item.modality_name, item.invoice?.invoice_number]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase();
            return (readiness === 'All' || getPaymentState(item) === readiness)
                && tokens.every((token) => searchable.includes(token));
        }).sort((first, second) =>
            (priorityRank[first.priority] ?? 3) - (priorityRank[second.priority] ?? 3)
            || Number(second.waiting_minutes || 0) - Number(first.waiting_minutes || 0)
        );
    }, [queue, readiness, search]);

    const summary = useMemo(() => ({
        urgent: queue.filter((item) => ['Emergency', 'Urgent'].includes(item.priority)).length,
        missing: queue.filter((item) => getPaymentState(item) === 'MissingInvoice').length,
        due: queue.filter((item) => getPaymentState(item) === 'PaymentDue').length,
        paid: queue.filter((item) => getPaymentState(item) === 'Paid').length,
        outstanding: queue.reduce((sum, item) => sum + Math.max(0, Number(item.invoice?.balance_amount || 0)), 0)
    }), [queue]);

    const shiftSummary = useMemo(() => ({
        opening: Number(currentShift?.opening_balance || 0),
        collected: Number(currentShift?.collected_amount || 0),
        payments: Number(currentShift?.payment_count || 0),
        queueBalance: summary.outstanding,
    }), [currentShift, summary.outstanding]);

    return (
        <div className="space-y-5">
            <section className="rounded-none border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[.18em] text-teal-700 dark:text-teal-400">
                            {t('cashier.eyebrow')}
                        </p>
                        <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                            {t('cashier.title')}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            {t('cashier.subtitle')}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[460px]">
                        <MiniMetric label={t('cashier.metrics.waiting')} value={queue.length} />
                        <MiniMetric label={t('cashier.metrics.priority')} value={summary.urgent} tone={summary.urgent ? 'rose' : 'slate'} />
                        <MiniMetric label={t('cashier.filters.PaymentDue')} value={summary.due} tone={summary.due ? 'amber' : 'slate'} />
                        <MiniMetric label={t('cashier.filters.Paid')} value={summary.paid} tone="emerald" />
                    </div>
                </div>
            </section>

            <section className="rounded-none border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-none ring-1 ${
                            currentShift
                                ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
                                : 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
                        }`}>
                            <WalletCards size={20} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('billing.shiftDashboardTitle', { defaultValue: 'Cashier shift summary' })}
                                </h3>
                                <ShiftBadge currentShift={currentShift} t={t} />
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {isLoadingShift
                                    ? t('billing.loadingShift')
                                    : currentShift
                                        ? t('billing.shiftSummary', { count: currentShift.payment_count || 0, amount: Number(currentShift.collected_amount || 0).toFixed(2), time: new Date(currentShift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
                                        : t('billing.openShiftHelp')
                                }
                            </p>
                        </div>
                    </div>

                    {currentShift && canCloseShift ? (
                        <button
                            type="button"
                            onClick={() => onShiftAction('close')}
                            className="min-h-10 rounded-none border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            {t('billing.closeShift')}
                        </button>
                    ) : !currentShift && canOpenShift ? (
                        <button
                            type="button"
                            onClick={() => onShiftAction('open')}
                            disabled={isLoadingShift}
                            className="min-h-10 rounded-none bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 active:scale-95 dark:bg-cyan-700 dark:hover:bg-cyan-600"
                        >
                            {t('billing.openShift')}
                        </button>
                    ) : null}
                </div>

                <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
                    <ShiftMetric icon={Banknote} label={t('billing.openingBalance')} value={currency.format(shiftSummary.opening)} />
                    <ShiftMetric icon={Receipt} label={t('billing.netCollected')} value={currency.format(shiftSummary.collected)} tone="emerald" />
                    <ShiftMetric icon={CheckCircle2} label={t('billing.paymentCount', { defaultValue: 'Payments' })} value={shiftSummary.payments} tone="cyan" />
                    <ShiftMetric icon={CreditCard} label={t('cashier.metrics.outstanding')} value={currency.format(shiftSummary.queueBalance)} tone="amber" />
                </div>
            </section>

            <section className="rounded-none border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                    <label className="relative w-full lg:max-w-md">
                        <span className="sr-only">{t('cashier.search')}</span>
                        <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('cashier.searchPlaceholder')}
                            className="h-10 w-full rounded-none border border-slate-200 bg-white ps-10 pe-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </label>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="rounded-none bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                            {t('cashier.metrics.outstanding')}: {currency.format(summary.outstanding)}
                        </span>
                        <select
                            aria-label={t('cashier.readinessFilter')}
                            value={readiness}
                            onChange={(event) => setReadiness(event.target.value)}
                            className="h-10 rounded-none border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        >
                            {['All', 'MissingInvoice', 'PaymentDue', 'Paid'].map((value) => (
                                <option key={value} value={value}>
                                    {t(`cashier.filters.${value}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="p-3 sm:p-4">
                    {filtered.length === 0 ? (
                        <div className="py-8">
                            <EmptyState
                                icon={WalletCards}
                                title={t('cashier.empty')}
                                subtitle={queue.length ? t('cashier.noFilterResults') : t('cashier.emptySubtitle')}
                            />
                        </div>
                    ) : (
                        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                            {filtered.map((item) => (
                                <CashierCaseCard
                                    key={item.exam_id}
                                    canAppendSupplies={canAppendSupplies}
                                    currency={currency}
                                    currentShift={currentShift}
                                    item={item}
                                    locale={locale}
                                    onCreateInvoice={onCreateInvoice}
                                    onMoveQueue={onMoveQueue}
                                    onOpenPayment={onOpenPayment}
                                    onSetSupplyExamId={setSupplyExamId}
                                    t={t}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {supplyExamId && (
                <ConsumeItemModal
                    examId={supplyExamId}
                    onClose={() => setSupplyExamId(null)}
                />
            )}
        </div>
    );
};

const MiniMetric = ({ label, value, tone = 'slate' }) => {
    const toneClass = {
        slate: 'border-slate-200 bg-slate-50 text-slate-700',
        rose: 'border-rose-200 bg-rose-50 text-rose-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }[tone];

    return (
        <div className={`rounded-none border px-3 py-2 ${toneClass}`}>
            <p className="truncate text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
            <p className="mt-1 font-mono text-lg font-black">{value}</p>
        </div>
    );
};

const ShiftBadge = ({ currentShift, t }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-none px-2 py-1 text-[10px] font-black ring-1 ${
        currentShift
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
            : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
    }`}>
        <span className={`h-1.5 w-1.5 rounded-none ${currentShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {t(currentShift ? 'billing.shiftOpen' : 'billing.shiftClosedStatus')}
    </span>
);

const ShiftMetric = ({ icon: Icon, label, value, tone = 'slate' }) => {
    const toneClass = {
        slate: 'text-slate-800 dark:text-slate-200',
        emerald: 'text-emerald-700 dark:text-emerald-300',
        cyan: 'text-cyan-700 dark:text-cyan-300',
        amber: 'text-amber-700 dark:text-amber-300'
    }[tone];

    return (
        <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5 sm:[&:not(:first-child)]:border-s">
            <div className="flex items-center gap-1.5">
                <Icon size={14} className="text-slate-400" />
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            </div>
            <p className={`mt-1 truncate text-lg font-black tabular-nums ${toneClass}`}>{value}</p>
        </div>
    );
};

const StateBadge = ({ state, t }) => (
    <span className={`inline-flex rounded-none border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${stateStyles[state] || stateStyles.MissingInvoice}`}>
        {t(`cashier.filters.${state}`)}
    </span>
);

const CashierCaseCard = ({
    canAppendSupplies,
    currency,
    currentShift,
    item,
    locale,
    onCreateInvoice,
    onMoveQueue,
    onOpenPayment,
    onSetSupplyExamId,
    t
}) => {
    const state = getPaymentState(item);
    const balance = Number(item.invoice?.balance_amount || 0);
    const waiting = Number(item.waiting_minutes || 0);

    return (
        <article className={`min-w-0 rounded-none border p-3 transition hover:border-slate-300 dark:hover:border-slate-700 ${
            state === 'PaymentDue'
                ? 'border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/10'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
        }`}>
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate font-black text-slate-950 dark:text-white">
                        {item.patient_name || t('table.patientFallback')}
                    </p>
                    <p className="mt-1 font-mono text-[10px] font-bold text-slate-400 ltr-embed">
                        {item.mrn || '-'}
                    </p>
                </div>
                <StateBadge state={state} t={t} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-none bg-slate-50 p-2 dark:bg-slate-950/40">
                    <p className="text-[10px] font-black uppercase text-slate-400">{t('table.machineExam')}</p>
                    <p className="mt-1 line-clamp-2 font-bold text-slate-700 dark:text-slate-300">
                        {item.exam_type_name || item.modality_name || '-'}
                    </p>
                    {item.body_part && <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{item.body_part}</p>}
                </div>
                <div className="rounded-none bg-slate-50 p-2 dark:bg-slate-950/40">
                    <p className="text-[10px] font-black uppercase text-slate-400">{t('queue.columns.wait', { defaultValue: 'Wait' })}</p>
                    <p className={`mt-1 inline-flex items-center gap-1.5 font-black tabular-nums ${waiting >= 30 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}`}>
                        {waiting >= 30 && <AlertCircle size={13} />}
                        {formatDuration(waiting, locale)}
                    </p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <PriorityBadge priority={item.priority} />
                <div className="text-end">
                    <p className="font-mono text-base font-black text-slate-950 dark:text-white" dir="ltr">
                        {item.invoice ? currency.format(balance) : '-'}
                    </p>
                    {item.supplyTotal > 0 && (
                        <p className="mt-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-300">
                            {t('cashier.supplies', { defaultValue: 'Supplies' })}: {currency.format(item.supplyTotal)}
                            <span className="font-medium text-slate-400"> ({item.supplyCount})</span>
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                {canAppendSupplies && item.exam_id && (
                    <button
                        type="button"
                        onClick={() => onSetSupplyExamId(item.exam_id)}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-none border border-cyan-200 bg-cyan-50 px-3 text-[10px] font-black text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20 sm:flex-none"
                        title={t('cashier.addSupply', { defaultValue: 'Add supply' })}
                    >
                        <PackagePlus size={13} />
                        {t('cashier.addSupply', { defaultValue: 'Add supply' })}
                    </button>
                )}

                {state === 'MissingInvoice' && (
                    <button
                        type="button"
                        onClick={() => onCreateInvoice(item.sourceItem || item)}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-none bg-slate-900 px-3 text-[10px] font-black text-white transition hover:bg-slate-800 active:scale-95 dark:bg-cyan-700 dark:hover:bg-cyan-600 sm:flex-none"
                    >
                        <FilePlus2 size={13} />
                        {t('table.createInvoice')}
                    </button>
                )}

                {state === 'PaymentDue' && (
                    <button
                        type="button"
                        onClick={() => onOpenPayment(item.invoice)}
                        disabled={!currentShift}
                        title={!currentShift ? t('billing.openShiftRequired') : undefined}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-none bg-emerald-600 px-3 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 sm:flex-none"
                    >
                        <CreditCard size={13} />
                        {t('billing.collectPayment')}
                    </button>
                )}

                {state === 'Paid' && (
                    <>
                        <button
                            type="button"
                            onClick={() => onMoveQueue(item, 'Prep Pending')}
                            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-none border border-teal-200 bg-teal-50 px-3 text-[10px] font-black text-teal-700 transition hover:bg-teal-100 active:scale-95 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20 sm:flex-none"
                        >
                            <CheckCircle2 size={13} />
                            {t('cashier.paidNurse')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onMoveQueue(item, 'Ready for Exam')}
                            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-none border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black text-emerald-700 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 sm:flex-none"
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

export default CashierQueueTab;
