import { useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, RefreshCw, WalletCards } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import TextPromptDialog from '../ui/TextPromptDialog';
import { useGetCashierReconciliationQuery, useReviewCashierClosureMutation } from '../../store/api';
import { formatFinancialCurrency, formatFinancialDate } from '../../utils/financialFormat';

const CashReconciliation = () => {
    const { t, i18n } = useTranslation('workspace');
    const [reviewTarget, setReviewTarget] = useState(null);
    const { data, isLoading, isError, isFetching, refetch } = useGetCashierReconciliationQuery({});
    const [reviewClosure, { isLoading: reviewing }] = useReviewCashierClosureMutation();

    const shifts = data?.data || [];
    const summary = data?.summary || {};
    const reviewCount = shifts.filter((shift) => shift.review_status === 'Requires Review').length;
    const money = (value) => formatFinancialCurrency(value, i18n.language);

    const submitReview = async (reviewNotes) => {
        if (!reviewTarget) return false;
        try {
            await reviewClosure({ id: reviewTarget.closure_id, reviewNotes }).unwrap();
            toast.success(t('finance.cashier.reviewSuccess'));
            return true;
        } catch (error) {
            toast.error(error?.data?.message || t('finance.cashier.reviewError'));
            return false;
        }
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 shadow-md dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30">
                        <WalletCards size={22} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                            {t('finance.cashier.title')}
                        </h2>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                            {t('finance.cashier.description')}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={refetch}
                    disabled={isFetching}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                    {t('finance.cashier.refresh')}
                </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4 border-b border-slate-100/80 p-5 dark:border-white/5 lg:grid-cols-4">
                <Metric label={t('finance.cashier.netCollected')} value={money(summary.collectedAmount)} />
                <Metric label={t('finance.cashier.paymentCount')} value={summary.paymentCount || 0} />
                <Metric label={t('finance.cashier.openShifts')} value={summary.openShifts || 0} />
                <Metric label={t('finance.cashier.needsReview')} value={reviewCount} alert={reviewCount > 0} />
            </div>

            {/* Shift List */}
            {isLoading ? (
                <div className="p-12 text-center text-sm font-bold text-slate-400">{t('finance.cashier.loading')}</div>
            ) : isError ? (
                <div role="alert" className="p-12 text-center text-sm font-bold text-rose-600 dark:text-rose-400">{t('finance.cashier.error')}</div>
            ) : shifts.length === 0 ? (
                <div className="p-12 text-center">
                    <Banknote size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="mt-3 font-black text-slate-700 dark:text-slate-300">{t('finance.cashier.emptyTitle')}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('finance.cashier.emptyDescription')}</p>
                </div>
            ) : (
                <div className="divide-y divide-slate-100/80 dark:divide-white/5">
                    {shifts.map((shift) => (
                        <Shift
                            key={shift.shift_id}
                            shift={shift}
                            money={money}
                            language={i18n.language}
                            t={t}
                            onReview={() => setReviewTarget(shift)}
                        />
                    ))}
                </div>
            )}

            <TextPromptDialog
                isOpen={Boolean(reviewTarget)}
                onClose={() => setReviewTarget(null)}
                onConfirm={submitReview}
                title={t('finance.cashier.reviewTitle')}
                message={t('finance.cashier.reviewMessage', { cashier: reviewTarget?.cashier_name, variance: money(reviewTarget?.variance) })}
                label={t('finance.cashier.reviewNotes')}
                placeholder={t('finance.cashier.reviewPlaceholder')}
                validationMessage={t('finance.cashier.reviewRequired')}
                confirmLabel={t('finance.cashier.confirmReview')}
                cancelLabel={t('finance.common.cancel')}
                isLoading={reviewing}
            />
        </div>
    );
};

const Metric = ({ label, value, alert }) => (
    <div className={`rounded-2xl border p-4 transition-all ${
        alert
            ? 'border-amber-300/80 bg-amber-50/90 dark:border-amber-500/20 dark:bg-amber-500/10'
            : 'border-slate-200/60 bg-slate-50/70 dark:border-white/5 dark:bg-white/[0.02]'
    }`}>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-2 text-xl font-black ${alert ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
);

const Shift = ({ shift, money, language, t, onReview }) => {
    const requiresReview = shift.review_status === 'Requires Review';
    const reviewed = shift.review_status === 'Reviewed';

    return (
        <article className="p-5 sm:p-6 transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-black text-slate-900 dark:text-white text-base">{shift.cashier_name}</h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            shift.status === 'Open'
                                ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                            {t(`finance.cashier.status.${shift.status}`)}
                        </span>
                        {shift.review_status && (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                                requiresReview
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            }`}>
                                {requiresReview ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                                {t(`finance.cashier.reviewStatus.${shift.review_status}`)}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {formatFinancialDate(shift.opened_at, language)} · {t('finance.cashier.transactions', { payments: shift.payment_count || 0, refunds: shift.refund_count || 0 })}
                    </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    <Value label={t('finance.cashier.collected')} value={money(shift.collected_amount)} />
                    <Value label={t('finance.cashier.expected')} value={shift.expected_cash == null ? '—' : money(shift.expected_cash)} />
                    <Value label={t('finance.cashier.counted')} value={shift.counted_cash == null ? '—' : money(shift.counted_cash)} />
                    <Value label={t('finance.cashier.variance')} value={shift.variance == null ? '—' : money(shift.variance)} danger={Number(shift.variance || 0) !== 0} />
                </dl>

                {requiresReview && (
                    <button
                        type="button"
                        onClick={onReview}
                        className="rounded-2xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/20 transition hover:bg-amber-700"
                    >
                        {t('finance.cashier.review')}
                    </button>
                )}
            </div>

            {shift.variance_reason && (
                <p className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-xs font-semibold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    <strong>{t('finance.cashier.reason')}:</strong> {shift.variance_reason}
                </p>
            )}

            {reviewed && (
                <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t('finance.cashier.reviewedBy', { name: shift.reviewed_by_name || t('finance.common.unknown') })}
                    {shift.review_notes ? ` · ${shift.review_notes}` : ''}
                </p>
            )}
        </article>
    );
};

const Value = ({ label, value, danger }) => (
    <div>
        <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
        <dd className={`mt-1 font-mono text-sm font-black ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {value}
        </dd>
    </div>
);

export default CashReconciliation;
