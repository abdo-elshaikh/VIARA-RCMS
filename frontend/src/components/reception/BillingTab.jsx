import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    AlertTriangle,
    Banknote,
    Calendar,
    CheckCircle2,
    Clock3,
    CreditCard,
    Download,
    FileText,
    Hash,
    History,
    PackagePlus,
    Printer,
    Receipt,
    RotateCcw,
    Search,
    ShieldCheck,
    TrendingDown,
    User,
    X
} from 'lucide-react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    useGetCashierReconciliationQuery,
    useGetInvoiceQuery,
    useGetInvoicesQuery,
    useGetRefundsQuery,
    useLazyGetInvoicePdfQuery,
    useRefundInvoiceMutation,
    useReviewRefundMutation,
} from '../../store/api';
import Modal from '../ui/Modal';
import ConsumeItemModal from '../inventory/ConsumeItemModal';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { selectCurrentUser } from '../../store/authSlice';

const fieldClass =
    'h-10 w-full rounded-none border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400';

const STATUS_STYLES = {
    Paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Pending: 'bg-amber-50 text-amber-700 border-amber-100',
    Partial: 'bg-teal-50 text-teal-700 border-teal-100',
    Voided: 'bg-slate-100 text-slate-500 border-slate-200',
    Refunded: 'bg-rose-50 text-rose-700 border-rose-100',
};

const StatusPill = ({ status }) => {
    const { t } = useTranslation('reception');
    const label = t(`billing.statuses.${status}`, { defaultValue: status });
    return (
        <span className={`inline-flex items-center rounded-none border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.Voided}`}>
            {label}
        </span>
    );
};

const BillingTab = () => {
    const { t } = useTranslation('reception');
    const user = useSelector(selectCurrentUser);
    const permissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    const canCollect = user?.role === 'Developer' || permissions.has('PROCESS_PAYMENTS');
    const canReconcile = user?.role === 'Developer' || permissions.has('RECONCILE_SHIFTS');
    const canRequestRefund = user?.role === 'Developer' || permissions.has('REQUEST_REFUNDS');
    const canApproveRefund = user?.role === 'Developer' || permissions.has('APPROVE_REFUNDS');
    const canProcessRefund = user?.role === 'Developer' || permissions.has('PROCESS_REFUNDS');
    const canAppendSupplies = user?.role === 'Developer' || permissions.has('CONSUME_INVENTORY');
    const userId = user?.id || user?.user_id;

    const { data: invoices = [], isLoading } = useGetInvoicesQuery(undefined, { pollingInterval: 30000 });
    const [refundInvoice, { isLoading: isRefunding }] = useRefundInvoiceMutation();
    const [reviewRefund, { isLoading: isReviewingRefund }] = useReviewRefundMutation();
    const [getPdf, { isFetching: isDownloading }] = useLazyGetInvoicePdfQuery();

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [printInvoice, setPrintInvoice] = useState(null);
    const [printLang, setPrintLang] = useState('both');
    const [refundTarget, setRefundTarget] = useState(null);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundMethod, setRefundMethod] = useState('Cash');
    const [refundReason, setRefundReason] = useState('');
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewReason, setReviewReason] = useState('');
    const [refundIdempotencyKey, setRefundIdempotencyKey] = useState(() => crypto.randomUUID());
    const [supplyExamId, setSupplyExamId] = useState(null);

    const { data: pendingRefunds = [], isFetching: isLoadingRefunds } = useGetRefundsQuery(
        { status: canApproveRefund ? 'Pending' : 'Approved', limit: '100' },
        { skip: !canApproveRefund && !canProcessRefund, pollingInterval: 30000 }
    );
    const { data: cashierData } = useGetCashierReconciliationQuery(
        { cashierId: userId },
        { skip: !userId || (!canCollect && !canReconcile) }
    );
    const currentShift = cashierData?.data?.find((shift) => shift.status === 'Open');

    const { data: invoiceDetail, isFetching: isLoadingInvoiceDetail } = useGetInvoiceQuery(
        selectedInvoice?.invoice_id,
        { skip: !selectedInvoice?.invoice_id }
    );

    const filteredInvoices = invoices.filter((invoice) => {
        const query = searchTerm.trim().toLowerCase();
        const matchSearch = !query || [invoice.invoice_number, invoice.patient_name, invoice.mrn]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query);
        return matchSearch && (statusFilter === 'All' || invoice.invoice_status === statusFilter);
    });

    const kpis = invoices.reduce(
        (acc, invoice) => ({
            collected: acc.collected + Number(invoice.paid_amount || 0) - Number(invoice.refunded_amount || 0),
            outstanding: acc.outstanding + Number(invoice.balance_amount || 0),
            discounts: acc.discounts + Number(invoice.discount_amount || 0),
            open: acc.open + (Number(invoice.balance_amount || 0) > 0 && invoice.invoice_status !== 'Voided' ? 1 : 0),
        }),
        { collected: 0, outstanding: 0, discounts: 0, open: 0 }
    );

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

    const openRefund = (invoice, payment) => {
        const reserved = (invoiceDetail?.refunds || [])
            .filter((refund) => refund.payment_id === payment.payment_id && refund.status !== 'Rejected')
            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
        const available = Math.max(0, Number(payment.amount || 0) - reserved);
        setRefundTarget({ invoice, payment, available });
        setRefundAmount(available.toFixed(2));
        setRefundMethod(payment.method || 'Cash');
        setRefundReason('');
        setRefundIdempotencyKey(crypto.randomUUID());
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

    return (
        <div className="space-y-5">
            <section className="rounded-none border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[.18em] text-teal-700 dark:text-teal-400">
                            {t('billing.workspaceTitle', { defaultValue: 'Billing workspace' })}
                        </p>
                        <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                            {t('billing.title')}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            {t('billing.subtitle')}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[560px]">
                        <BillingMetric icon={Banknote} label={t('billing.totalCollected')} value={kpis.collected} tone="emerald" />
                        <BillingMetric icon={Clock3} label={t('billing.totalOutstanding')} value={kpis.outstanding} sub={t('billing.openInvoices', { count: kpis.open })} tone="amber" />
                        <BillingMetric icon={TrendingDown} label={t('billing.totalDiscounts')} value={kpis.discounts} tone="violet" />
                        <BillingMetric icon={Receipt} label={t('billing.invoiceCount')} value={invoices.length} money={false} tone="blue" />
                    </div>
                </div>
            </section>

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

            <section className="rounded-none border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                    <label className="relative w-full lg:max-w-md">
                        <span className="sr-only">{t('billing.searchPlaceholder')}</span>
                        <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            placeholder={t('billing.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="h-10 w-full rounded-none border border-slate-200 bg-white ps-10 pe-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="rounded-none bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                            {filteredInvoices.length} / {invoices.length}
                        </span>
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="h-10 rounded-none border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                            aria-label={t('billing.filterStatus')}
                        >
                            {['All', 'Pending', 'Partial', 'Paid', 'Refunded', 'Voided'].map((status) => (
                                <option key={status} value={status}>
                                    {status === 'All' ? t('billing.allStatuses') : t(`billing.statuses.${status}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    {isLoading ? (
                        <div className="space-y-2 p-4">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <div key={index} className="h-12 animate-pulse rounded-none bg-slate-100 dark:bg-slate-800" />
                            ))}
                        </div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="flex min-h-56 flex-col items-center justify-center text-center">
                            <Receipt size={28} className="text-slate-300 dark:text-slate-700" />
                            <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">{t('billing.noInvoices')}</p>
                        </div>
                    ) : (
                        <InvoiceTable
                            invoices={filteredInvoices}
                            isDownloading={isDownloading}
                            onPrint={setPrintInvoice}
                            onSelect={setSelectedInvoice}
                            t={t}
                        />
                    )}
                </div>
            </section>

            <Modal
                isOpen={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                title={t('billing.invoiceDetails', { defaultValue: 'Invoice Details' })}
                width="w-full max-w-2xl"
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
                title={t(reviewTarget?.status === 'Processed' ? 'billing.approveRefundTitle' : 'billing.rejectRefundTitle')}
            >
                {reviewTarget && (
                    <form onSubmit={handleRefundReview} className="space-y-5">
                        <div className={`rounded-none border p-4 ${reviewTarget.status === 'Processed' ? 'border-emerald-100 bg-emerald-50/60' : 'border-rose-100 bg-rose-50/60'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900">{reviewTarget.refund.patient_name}</p>
                                    <p className="font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{reviewTarget.refund.invoice_number}</p>
                                    <p className="mt-2 text-sm text-slate-600">{reviewTarget.refund.reason}</p>
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
                                className="w-full rounded-none border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
                            />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={() => setReviewTarget(null)} disabled={isReviewingRefund} className="min-h-11 flex-1 rounded-none border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50">{t('cancel')}</button>
                            <button type="submit" disabled={isReviewingRefund || reviewReason.trim().length < 3 || (reviewTarget.status === 'Processed' && !currentShift)} className={`flex min-h-11 flex-[1.5] items-center justify-center gap-2 rounded-none text-sm font-bold text-white disabled:opacity-40 ${reviewTarget.status === 'Rejected' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
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
                        <div className="rounded-none border border-rose-100 bg-rose-50/60 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900">{refundTarget.invoice.patient_name || t('billing.unnamedPatient')}</p>
                                    <p className="font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{refundTarget.invoice.invoice_number}</p>
                                    <p className="mt-2 text-sm text-slate-600">{t(`billing.methods.${refundTarget.payment.method}`, { defaultValue: refundTarget.payment.method })}</p>
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
                                    {['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer'].map((method) => (
                                        <option key={method} value={method}>{t(`billing.methods.${method}`)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>{t('billing.refundReason')}</label>
                            <textarea rows="3" minLength="3" maxLength="1000" required value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder={t('billing.refundReasonPlaceholder')} className="w-full rounded-none border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" />
                            <p className="mt-1.5 text-xs text-slate-500">{t('billing.refundApprovalHelp')}</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={() => setRefundTarget(null)} disabled={isRefunding} className="min-h-11 flex-1 rounded-none border border-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50">{t('cancel')}</button>
                            <button type="submit" disabled={isRefunding || Number(refundAmount) <= 0 || Number(refundAmount) > refundTarget.available + 0.005 || refundReason.trim().length < 3} className="flex min-h-11 flex-[1.5] items-center justify-center gap-2 rounded-none bg-rose-600 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-40">
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
                        <div className="rounded-none border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm text-slate-600">
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
                            <button type="button" onClick={() => setPrintInvoice(null)} disabled={isDownloading} className="min-h-11 flex-1 rounded-none border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                                {t('cancel')}
                            </button>
                            <button type="submit" disabled={isDownloading} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-none bg-slate-900 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50">
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

const BillingMetric = ({ icon: Icon, label, value, money = true, sub, tone = 'slate' }) => {
    const toneClass = {
        slate: 'border-slate-200 bg-slate-50 text-slate-700',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        violet: 'border-cyan-200 bg-cyan-50 text-cyan-700',
        blue: 'border-teal-200 bg-teal-50 text-teal-700',
    }[tone];

    return (
        <div className={`rounded-none border p-3 ${toneClass}`}>
            <div className="flex items-center gap-1.5">
                <Icon size={14} />
                <p className="truncate text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
            </div>
            <p className="mt-1 truncate font-mono text-lg font-black tabular-nums" dir="ltr">
                {money ? Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
            </p>
            {sub && <p className="mt-0.5 truncate text-[11px] font-semibold opacity-70">{sub}</p>}
        </div>
    );
};

const AmountBlock = ({ label, value, tone = 'default' }) => {
    const tones = {
        default: 'bg-slate-50 text-slate-700',
        amber: 'bg-amber-50 text-amber-700',
        emerald: 'bg-emerald-50 text-emerald-700',
    };
    return (
        <div className={`rounded-none px-4 py-3 ${tones[tone] || tones.default}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums ltr-embed" dir="ltr">
                {Number(value || 0).toFixed(2)}
            </p>
        </div>
    );
};

const RefundReviewQueue = ({ canApproveRefund, canProcessRefund, currentShift, isLoading, onReview, refunds, t }) => (
    <section className="rounded-none border border-amber-200 bg-white shadow-sm dark:border-amber-500/20 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-3 border-b border-amber-100 px-4 py-3.5 dark:border-amber-500/20">
            <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-black text-amber-900 dark:text-amber-200">
                    <ShieldCheck size={16} />
                    {t('billing.refundApprovalQueue')}
                </h3>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{t('billing.refundApprovalQueueHelp')}</p>
            </div>
            <span className="rounded-none bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{refunds.length}</span>
        </header>
        {isLoading ? (
            <div className="space-y-2 p-4">
                {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="h-20 animate-pulse rounded-none bg-slate-100 dark:bg-slate-800" />
                ))}
            </div>
        ) : refunds.length === 0 ? (
            <p className="px-4 py-5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('billing.noPendingRefunds')}</p>
        ) : (
            <div className="grid gap-3 p-3 lg:grid-cols-2">
                {refunds.map((refund) => (
                    <article key={refund.refund_id} className="rounded-none border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{refund.patient_name || t('billing.unnamedPatient')}</p>
                                <p className="font-mono text-[11px] text-slate-400 ltr-embed" dir="ltr">{refund.invoice_number} / {refund.mrn || '-'}</p>
                                <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-700 dark:text-slate-300">{refund.reason}</p>
                                <p className="mt-1 text-[11px] text-slate-400">{t('billing.requestedBy', { name: refund.requested_by_name || '-' })}</p>
                            </div>
                            <div className="sm:text-end">
                                <p className="font-mono text-sm font-black text-rose-700 ltr-embed" dir="ltr">{Number(refund.amount || 0).toFixed(2)}</p>
                                <p className="text-[11px] text-slate-400 ltr-embed" dir="ltr">{new Date(refund.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {refund.status === 'Pending' && canApproveRefund && (
                                <>
                                    <button type="button" onClick={() => onReview(refund, 'Rejected')} className="min-h-9 rounded-none border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100">{t('billing.rejectRefund')}</button>
                                    <button type="button" onClick={() => onReview(refund, 'Approved')} className="min-h-9 rounded-none bg-teal-600 px-3 text-xs font-bold text-white transition hover:bg-teal-700">{t('billing.approveRefund')}</button>
                                </>
                            )}
                            {refund.status === 'Approved' && canProcessRefund && (
                                <button type="button" onClick={() => onReview(refund, 'Processed')} disabled={!currentShift} title={!currentShift ? t('billing.openShiftRequired') : undefined} className="min-h-9 rounded-none bg-emerald-600 px-3 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{t('billing.processRefund')}</button>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        )}
    </section>
);

const InvoiceTable = ({ invoices, isDownloading, onPrint, onSelect, t }) => (
    <table className="w-full table-fixed text-start text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="w-[112px] px-4 py-3 sm:px-5">{t('billing.invoiceNo')}</th>
                <th className="px-3 py-3">{t('billing.patient')}</th>
                <th className="hidden w-[112px] px-3 py-3 md:table-cell">{t('billing.date')}</th>
                <th className="hidden w-[112px] px-3 py-3 text-end sm:table-cell">{t('billing.total')}</th>
                <th className="hidden w-[112px] px-3 py-3 text-end lg:table-cell">{t('billing.paid')}</th>
                <th className="w-[104px] px-3 py-3 text-end">{t('billing.balance')}</th>
                <th className="hidden w-[116px] px-3 py-3 text-center md:table-cell">{t('billing.status')}</th>
                <th className="w-[120px] px-4 py-3 text-end sm:px-5">{t('billing.actions')}</th>
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

const InvoiceRow = ({ invoice, isDownloading, onPrint, onSelect, t }) => {
    const total = Number(invoice.patient_payable_amount || invoice.total_amount || 0);
    const paid = Number(invoice.paid_amount || 0);
    const balance = Number(invoice.balance_amount || 0);
    const paidPct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
    const hasBalance = balance > 0 && invoice.invoice_status !== 'Voided';
    const dateValue = invoice.generated_at || invoice.created_at;

    return (
        <tr className={`group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hasBalance ? 'bg-amber-50/40 dark:bg-amber-500/10' : ''}`}>
            <td className="px-4 py-3 sm:px-5">
                <button
                    type="button"
                    onClick={() => onSelect(invoice)}
                    className="max-w-full truncate font-mono text-[11px] font-black uppercase tracking-wide text-slate-700 outline-none hover:text-teal-700 focus-visible:rounded-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-300 ltr-embed"
                    dir="ltr"
                >
                    {invoice.invoice_number || '-'}
                </button>
            </td>
            <td className="px-3 py-3">
                <button
                    type="button"
                    onClick={() => onSelect(invoice)}
                    className="block min-w-0 max-w-full text-start outline-none focus-visible:rounded-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                    <span className="block truncate font-black text-slate-950 dark:text-white">
                        {invoice.patient_name || t('billing.unnamedPatient')}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400 uppercase ltr-embed" dir="ltr">
                        {invoice.mrn || '-'}
                    </span>
                    <span className="mt-1 inline-flex md:hidden">
                        <StatusPill status={invoice.invoice_status} />
                    </span>
                </button>
            </td>
            <td className="hidden px-3 py-3 text-xs font-semibold text-slate-500 md:table-cell ltr-embed" dir="ltr">
                {dateValue ? new Date(dateValue).toLocaleDateString() : '-'}
            </td>
            <td className="hidden px-3 py-3 text-end sm:table-cell">
                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 ltr-embed" dir="ltr">
                    {total.toFixed(2)}
                </span>
            </td>
            <td className="hidden px-3 py-3 text-end lg:table-cell">
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 ltr-embed" dir="ltr">
                    {paid.toFixed(2)}
                </span>
            </td>
            <td className="px-3 py-3 text-end">
                <span className={`font-mono text-xs font-black tabular-nums ltr-embed ${hasBalance ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`} dir="ltr">
                    {balance.toFixed(2)}
                </span>
                <div className="ms-auto mt-1 h-1 w-full max-w-20 overflow-hidden rounded-none bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-none ${paidPct >= 100 ? 'bg-emerald-500' : paidPct > 0 ? 'bg-teal-500' : 'bg-slate-300'}`} style={{ width: `${paidPct}%` }} />
                </div>
            </td>
            <td className="hidden px-3 py-3 text-center md:table-cell">
                <StatusPill status={invoice.invoice_status} />
            </td>
            <td className="px-4 py-3 text-end sm:px-5">
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={() => onSelect(invoice)}
                        className="inline-flex h-8 items-center justify-center rounded-none border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title={t('billing.viewDetails', { defaultValue: 'View Details' })}
                    >
                        <FileText size={13} />
                        <span className="sr-only">{t('billing.viewDetails', { defaultValue: 'View Details' })}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onPrint(invoice)}
                        disabled={isDownloading}
                        className="inline-flex h-8 items-center justify-center rounded-none border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
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
    const issueDate = invoice.created_at || invoice.issue_date;
    const examId = invoice.exam_id || invoiceDetail?.exam_id;

    return (
        <div className="space-y-4">
            <section className="rounded-none border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                                <Receipt size={19} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {t('billing.invoiceNo', { defaultValue: 'Invoice No' })}
                                </p>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                                    <p className="min-w-0 truncate font-mono text-lg font-black text-slate-950 ltr-embed dark:text-white" dir="ltr">
                                        {invoice.invoice_number}
                                    </p>
                                    <StatusPill status={invoice.invoice_status} />
                                </div>
                                <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2 lg:flex lg:flex-wrap">
                                    <InvoiceMeta icon={User} value={invoice.patient_name || t('billing.unnamedPatient')} suffix={invoice.mrn} />
                                    <InvoiceMeta icon={Calendar} value={issueDate ? new Date(issueDate).toLocaleDateString() : '-'} />
                                    {invoice.order_number && <InvoiceMeta icon={Hash} value={`${t('billing.order', { defaultValue: 'Order' })}: ${invoice.order_number}`} mono />}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:shrink-0">
                            <button
                                type="button"
                                onClick={() => window.open(`/print/invoice/${invoice.invoice_id}`, '_blank')}
                                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-none border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 hover:text-teal-600"
                                title={t('billing.printFullInvoice', { defaultValue: 'Print full invoice' })}
                            >
                                <Printer size={16} />
                                {t('billing.print', { defaultValue: 'Print' })}
                            </button>
                            {canAppendSupplies && examId && (
                                <button
                                    type="button"
                                    onClick={() => onSetSupplyExamId(examId)}
                                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-none border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-700 transition hover:bg-cyan-100"
                                    title={t('cashier.addSupply', { defaultValue: 'Add supply' })}
                                >
                                    <PackagePlus size={15} />
                                    {t('cashier.addSupply', { defaultValue: 'Add supply' })}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {invoice.invoice_status === 'Voided' && invoice.cancellation_reason && (
                    <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 p-3 text-rose-800">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs font-black">{t('billing.voidReason', { defaultValue: 'Void reason' })}</p>
                            <p className="mt-0.5 text-xs font-medium text-rose-700">{invoice.cancellation_reason}</p>
                        </div>
                    </div>
                )}

                <div className="grid gap-2 p-3 sm:grid-cols-3">
                    <InvoiceMetric label={t('billing.totalAmount', { defaultValue: 'Total Amount' })} value={invoice.total_amount} />
                    <InvoiceMetric label={t('billing.totalPaid', { defaultValue: 'Total Paid' })} value={invoice.paid_amount} tone="emerald" />
                    <InvoiceMetric label={t('billing.currentBalance', { defaultValue: 'Balance' })} value={invoice.balance_amount} tone={Number(invoice.balance_amount) > 0 ? 'amber' : 'slate'} />
                </div>
            </section>

            <div className="flex flex-col gap-4">
                <InvoiceItemsPanel invoiceDetail={invoiceDetail} isLoading={isLoading} t={t} />
                <InvoicePaymentsPanel
                    canRequestRefund={canRequestRefund}
                    invoice={invoice}
                    invoiceDetail={invoiceDetail}
                    isLoading={isLoading}
                    onOpenRefund={onOpenRefund}
                    t={t}
                />
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 w-full rounded-none border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 sm:w-auto"
                >
                    {t('cancel')}
                </button>
            </div>
        </div>
    );
};

const InvoiceMeta = ({ icon: Icon, value, suffix, mono }) => (
    <div className="flex min-w-0 items-center gap-1.5">
        <Icon size={14} className="shrink-0 text-slate-400" />
        <span className={`min-w-0 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
        {suffix && <span className="shrink-0 rounded-none bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{suffix}</span>}
    </div>
);

const InvoiceMetric = ({ label, value, tone = 'slate' }) => {
    const toneClass = {
        slate: 'border-slate-200 bg-slate-50 text-slate-900',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
    }[tone];

    return (
        <div className={`rounded-none border p-3 ${toneClass}`}>
            <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
            <p className="mt-1 font-mono text-lg font-black ltr-embed" dir="ltr">{Number(value || 0).toFixed(2)}</p>
        </div>
    );
};

const InvoiceItemsPanel = ({ invoiceDetail, isLoading, t }) => (
    <section className="rounded-none border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <PanelTitle icon={FileText} title={t('billing.itemsBreakdown', { defaultValue: 'Invoice Items' })} count={invoiceDetail?.items?.length || 0} tone="indigo" />
        <div className="mt-3">
            {isLoading ? (
                <LoadingRows label={t('billing.loadingHistory')} />
            ) : invoiceDetail?.items?.length ? (
                <div className="space-y-2">
                    {invoiceDetail.items.map((item) => (
                        <div key={item.item_id} className="rounded-none border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                                <p className="min-w-0 truncate text-sm font-black text-slate-800 dark:text-slate-100">{item.name}</p>
                                <p className="shrink-0 font-mono text-sm font-black text-slate-950 dark:text-white" dir="ltr">{Number(item.total_amount).toFixed(2)}</p>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                                <MiniStat label={t('billing.price', { defaultValue: 'Price' })} value={Number(item.price).toFixed(2)} />
                                <MiniStat label={t('billing.quantity', { defaultValue: 'Qty' })} value={item.quantity} />
                                <MiniStat label={t('billing.total', { defaultValue: 'Total' })} value={Number(item.total_amount).toFixed(2)} emphasize />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="py-8 text-center text-xs font-semibold text-slate-400">{t('billing.noInvoiceItems', { defaultValue: 'No items on this invoice' })}</p>
            )}
        </div>
    </section>
);

const InvoicePaymentsPanel = ({ canRequestRefund, invoice, invoiceDetail, isLoading, onOpenRefund, t }) => (
    <section className="rounded-none border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <PanelTitle icon={History} title={t('billing.paymentHistory')} count={invoiceDetail?.payments?.length || 0} tone="emerald" />
        <div className="mt-3 max-h-80 overflow-y-auto overflow-x-hidden pe-1">
            {isLoading ? (
                <LoadingRows label={t('billing.loadingHistory')} />
            ) : invoiceDetail?.payments?.length ? (
                <div className="space-y-2">
                    {invoiceDetail.payments.map((payment) => {
                        const reserved = (invoiceDetail.refunds || [])
                            .filter((refund) => refund.payment_id === payment.payment_id && refund.status !== 'Rejected')
                            .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
                        const refundable = Math.max(0, Number(payment.amount || 0) - reserved);
                        const canRefundPayment = canRequestRefund && payment.payment_status === 'Completed' && refundable > 0;

                        return (
                            <div key={payment.payment_id} className="rounded-none border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-white text-slate-500 ring-1 ring-slate-200">
                                        {payment.method === 'Cash' ? <Banknote size={16} /> : <CreditCard size={16} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-800 dark:text-slate-100">
                                                    {t(`billing.methods.${payment.method}`, { defaultValue: payment.method })}
                                                </p>
                                                <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 ltr-embed" dir="ltr">
                                                    {new Date(payment.transaction_date || payment.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                            <span className="shrink-0 font-mono text-sm font-black text-emerald-600 tabular-nums ltr-embed" dir="ltr">
                                                +{Number(payment.amount || 0).toFixed(2)}
                                            </span>
                                        </div>
                                        {payment.payment_reference && <p className="mt-1 truncate font-mono text-[10px] font-semibold text-slate-400 ltr-embed" dir="ltr">REF: {payment.payment_reference}</p>}
                                        {canRefundPayment && (
                                            <button
                                                type="button"
                                                onClick={() => onOpenRefund(invoice, payment)}
                                                className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-none border border-rose-200 bg-rose-50 px-2.5 text-[10px] font-black text-rose-700 transition hover:bg-rose-100 sm:w-auto"
                                                title={t('billing.requestRefund', { defaultValue: 'Request refund' })}
                                            >
                                                <RotateCcw size={12} />
                                                {t('billing.requestRefund', { defaultValue: 'Refund' })}
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
                    <AlertCircle size={24} className="mb-2 opacity-30" />
                    <p className="text-sm font-medium">{t('billing.noPaymentHistory')}</p>
                </div>
            )}
        </div>
    </section>
);

const PanelTitle = ({ icon: Icon, title, count, tone }) => {
    const toneClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-teal-50 text-teal-600';
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-none ${toneClass}`}>
                    <Icon size={16} />
                </span>
                <p className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{title}</p>
            </div>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-none bg-slate-100 px-2 text-[10px] font-black text-slate-500">
                {count}
            </span>
        </div>
    );
};

const MiniStat = ({ label, value, emphasize }) => (
    <div>
        <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
        <p className={`mt-1 truncate font-mono font-bold ${emphasize ? 'text-slate-950 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`} dir="ltr">
            {value}
        </p>
    </div>
);

const LoadingRows = ({ label }) => (
    <div className="space-y-2 py-2">
        <p className="sr-only">{label}</p>
        {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-none bg-slate-100 dark:bg-slate-800" />
        ))}
    </div>
);

export default BillingTab;
