import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Lock, Plus, ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreateFinancialClosureMutation, useFinalizeFinancialClosureMutation, useGetFinancialClosuresQuery } from '../../store/api';
import { formatFinancialCurrency, formatFinancialDate, toFinancialDateInput } from '../../utils/financialFormat';
import ConfirmDialog from '../ui/ConfirmDialog';

const FinancialClosures = () => {
    const { t, i18n } = useTranslation('workspace');
    const [statusFilter, setStatusFilter] = useState('');
    const [closureDate, setClosureDate] = useState(toFinancialDateInput());
    const [showForm, setShowForm] = useState(false);
    const [finalizeTarget, setFinalizeTarget] = useState(null);

    const queryArgs = useMemo(() => (statusFilter ? { status: statusFilter } : {}), [statusFilter]);
    const { data: closures = [], isLoading, isError } = useGetFinancialClosuresQuery(queryArgs);
    const [createClosure, { isLoading: creating }] = useCreateFinancialClosureMutation();
    const [finalizeClosure, { isLoading: finalizing }] = useFinalizeFinancialClosureMutation();

    const handleCreate = async () => {
        try {
            await createClosure({ closureDate }).unwrap();
            setShowForm(false);
            toast.success(t('finance.closures.createSuccess'));
        } catch (error) {
            toast.error(error?.data?.message || t('finance.closures.createError'));
        }
    };

    const handleFinalize = async () => {
        if (!finalizeTarget) return false;
        try {
            await finalizeClosure({ id: finalizeTarget.closure_id, status: 'Finalized' }).unwrap();
            toast.success(t('finance.closures.finalizeSuccess'));
            return true;
        } catch (error) {
            toast.error(error?.data?.message || t('finance.closures.finalizeError'));
            return false;
        }
    };

    return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300">
                        <Lock size={20} />
                    </span>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                            {t('finance.closures.title')}
                        </h2>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                            {t('finance.closures.description')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row">
                    <label>
                        <span className="sr-only">{t('finance.closures.filterStatus')}</span>
                        <select
                            className="h-10 w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20 sm:w-auto"
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                        >
                            <option value="">{t('finance.closures.allStatuses')}</option>
                            <option value="Draft">{t('finance.common.draft')}</option>
                            <option value="Finalized">{t('finance.common.finalized')}</option>
                        </select>
                    </label>

                    <button
                        type="button"
                        onClick={() => setShowForm((value) => !value)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-cyan-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                        {showForm ? <X size={16} /> : <Plus size={16} />}
                        {showForm ? t('finance.closures.closeForm') : t('finance.closures.new')}
                    </button>
                </div>
            </div>

            {/* Generate Closure Form Overlay */}
            {showForm && (
                <div className="border-b border-slate-200/80 bg-violet-50/40 p-5 backdrop-blur-md dark:border-white/5 dark:bg-violet-950/20 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <label className="block flex-1">
                            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('finance.closures.closureDate')}
                            </span>
                            <input
                                type="date"
                                className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                                value={closureDate}
                                onChange={(event) => setClosureDate(event.target.value)}
                            />
                        </label>

                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={creating || !closureDate}
                            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {creating ? t('finance.closures.generating') : t('finance.closures.generate')}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-white/5"
                        >
                            {t('finance.common.cancel')}
                        </button>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t('finance.closures.formHelp')}
                    </p>
                </div>
            )}

            {/* Content List */}
            {isLoading ? (
                <div className="animate-pulse p-12 text-center text-sm font-bold text-slate-400">{t('finance.closures.loading')}</div>
            ) : isError ? (
                <div role="alert" className="p-12 text-center text-sm font-bold text-rose-600 dark:text-rose-400">{t('finance.closures.error')}</div>
            ) : closures.length === 0 ? (
                <div className="p-12 text-center">
                    <FileText size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
                    <p className="mt-3 font-black text-slate-700 dark:text-slate-300">{t('finance.closures.emptyTitle')}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('finance.closures.emptyDescription')}</p>
                </div>
            ) : (
                <>
                    <div className="divide-y divide-slate-100/80 dark:divide-white/5 md:hidden">
                        {closures.map((closure) => (
                            <ClosureCard
                                key={closure.closure_id}
                                closure={closure}
                                onFinalize={() => setFinalizeTarget(closure)}
                                finalizing={finalizing}
                            />
                        ))}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[980px] text-start text-sm">
                            <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                <tr>
                                    {[
                                        t('finance.common.date'),
                                        t('finance.closures.revenue'),
                                        t('finance.closures.expenses'),
                                        t('finance.closures.netProfit'),
                                        t('finance.common.status'),
                                        t('finance.closures.readiness', { defaultValue: 'Readiness' }),
                                        t('finance.closures.closedBy')
                                    ].map((label) => (
                                        <th key={label} scope="col" className="px-4 py-3.5 text-start text-xs font-black uppercase tracking-wider">{label}</th>
                                    ))}
                                    <th scope="col" className="px-4 py-3.5 text-end text-xs font-black uppercase tracking-wider">{t('finance.common.action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                {closures.map((closure) => (
                                    <ClosureRow
                                        key={closure.closure_id}
                                        closure={closure}
                                        onFinalize={() => setFinalizeTarget(closure)}
                                        finalizing={finalizing}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <ConfirmDialog
                isOpen={Boolean(finalizeTarget)}
                onClose={() => setFinalizeTarget(null)}
                onConfirm={handleFinalize}
                title={t('finance.closures.finalizeTitle')}
                message={t('finance.closures.finalizeMessage', { date: finalizeTarget ? formatFinancialDate(finalizeTarget.closure_date, i18n.language) : '' })}
                confirmLabel={t('finance.closures.finalizeAction')}
                cancelLabel={t('finance.common.cancel')}
                variant="warning"
                isLoading={finalizing}
            />
        </div>
    );
};

const closureBlockers = (closure, t) => [
    Number(closure.open_shifts || 0) > 0 && t('finance.closures.openShiftBlocker', { defaultValue: '{{count}} open shift(s)', count: closure.open_shifts }),
    Number(closure.unresolved_variances || 0) > 0 && t('finance.closures.varianceBlocker', { defaultValue: '{{count}} variance review(s)', count: closure.unresolved_variances }),
    Number(closure.pending_refunds || 0) > 0 && t('finance.closures.refundBlocker', { defaultValue: '{{count}} pending refund(s)', count: closure.pending_refunds }),
].filter(Boolean);

const Status = ({ value }) => {
    const { t } = useTranslation('workspace');
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            value === 'Finalized'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
        }`}>
            {value === 'Finalized' ? <CheckCircle size={13} /> : <FileText size={13} />}
            {value === 'Finalized' ? t('finance.common.finalized') : t('finance.common.draft')}
        </span>
    );
};

const Readiness = ({ closure }) => {
    const { t } = useTranslation('workspace');
    if (closure.status === 'Finalized') {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                <ShieldCheck size={13} />
                {t('finance.closures.locked', { defaultValue: 'Locked' })}
            </span>
        );
    }
    const blockers = closureBlockers(closure, t);
    if (!blockers.length) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                <ShieldCheck size={13} />
                {t('finance.closures.ready', { defaultValue: 'Ready' })}
            </span>
        );
    }
    return (
        <div className="flex flex-wrap gap-1.5">
            {blockers.map((blocker) => (
                <span key={blocker} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">
                    <AlertTriangle size={12} />
                    {blocker}
                </span>
            ))}
        </div>
    );
};

const Finalize = ({ closure, onFinalize, finalizing, full }) => {
    const { t } = useTranslation('workspace');
    const blockers = closureBlockers(closure, t);
    if (closure.status !== 'Draft') return null;
    return (
        <button
            type="button"
            onClick={onFinalize}
            disabled={finalizing || blockers.length > 0}
            title={blockers.join(', ') || undefined}
            className={`rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 ${full ? 'w-full' : ''}`}
        >
            {t('finance.closures.finalize')}
        </button>
    );
};

const ClosureCard = ({ closure, onFinalize, finalizing }) => {
    const { t, i18n } = useTranslation('workspace');
    return (
        <article className="p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-black text-slate-900 dark:text-white">{formatFinancialDate(closure.closure_date, i18n.language)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('finance.closures.closedBy')} {closure.closed_by_name || '-'}</p>
                </div>
                <Status value={closure.status} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
                <Value label={t('finance.closures.revenue')} value={closure.total_revenue} tone="emerald" />
                <Value label={t('finance.closures.expenses')} value={closure.total_expenses} tone="rose" />
                <Value label={t('finance.closures.netProfit')} value={closure.net_profit} tone={Number(closure.net_profit) >= 0 ? 'emerald' : 'rose'} />
            </dl>
            <div className="mt-4"><Readiness closure={closure} /></div>
            {closure.status === 'Draft' ? (
                <div className="mt-4">
                    <Finalize closure={closure} onFinalize={onFinalize} finalizing={finalizing} full />
                </div>
            ) : null}
        </article>
    );
};

const ClosureRow = ({ closure, onFinalize, finalizing }) => {
    const { i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    return (
        <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
            <td className="px-4 py-4 font-bold text-slate-900 dark:text-white">{formatFinancialDate(closure.closure_date, i18n.language)}</td>
            <td className="px-4 py-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">{money(closure.total_revenue)}</td>
            <td className="px-4 py-4 font-mono font-bold text-rose-600 dark:text-rose-400">{money(closure.total_expenses)}</td>
            <td className={`px-4 py-4 font-mono font-black ${Number(closure.net_profit) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(closure.net_profit)}</td>
            <td className="px-4 py-4"><Status value={closure.status} /></td>
            <td className="px-4 py-4"><Readiness closure={closure} /></td>
            <td className="px-4 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400">{closure.closed_by_name || '-'}</td>
            <td className="px-4 py-4 text-end">
                <Finalize closure={closure} onFinalize={onFinalize} finalizing={finalizing} />
            </td>
        </tr>
    );
};

const Value = ({ label, value, tone }) => {
    const { i18n } = useTranslation('workspace');
    return (
        <div>
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className={`mt-1 truncate font-mono text-xs font-bold ${
                tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
                {formatFinancialCurrency(value, i18n.language)}
            </dd>
        </div>
    );
};

export default FinancialClosures;
