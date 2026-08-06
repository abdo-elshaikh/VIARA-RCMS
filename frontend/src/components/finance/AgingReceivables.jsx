import { AlertCircle, Clock3, ShieldCheck, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetReceivablesAgingQuery } from '../../store/api';
import { formatFinancialCurrency } from '../../utils/financialFormat';
import AccessibleChartData from '../ui/AccessibleChartData';

const BUCKETS = [
    { label: '0–30 days', key: '0_30', color: 'bg-emerald-500', surface: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10', text: 'text-emerald-800 dark:text-emerald-300' },
    { label: '31–60 days', key: '31_60', color: 'bg-cyan-500', surface: 'border-cyan-200/70 bg-cyan-50/70 dark:border-cyan-500/20 dark:bg-cyan-500/10', text: 'text-cyan-800 dark:text-cyan-300' },
    { label: '61–90 days', key: '61_90', color: 'bg-amber-500', surface: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/10', text: 'text-amber-800 dark:text-amber-300' },
    { label: 'Over 90 days', key: '90_plus', color: 'bg-rose-500', surface: 'border-rose-200/70 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10', text: 'text-rose-800 dark:text-rose-300' }
];

const AgingReceivables = () => {
    const { t, i18n } = useTranslation('workspace');
    const money = (value) => formatFinancialCurrency(value, i18n.language);
    const { data: aging, isLoading, isError } = useGetReceivablesAgingQuery();

    if (isLoading) {
        return (
            <div className="animate-pulse rounded-3xl border border-slate-200/80 bg-white/80 p-12 text-center text-sm font-bold text-slate-400 shadow-lg dark:border-white/10 dark:bg-[#07111f]/80">
                {t('finance.receivables.loading')}
            </div>
        );
    }

    if (isError || !aging) {
        return (
            <div role="alert" className="rounded-3xl border border-rose-200/80 bg-rose-50/80 p-12 text-center text-sm font-bold text-rose-600 shadow-lg dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
                {t('finance.receivables.error')}
            </div>
        );
    }

    const total = Number(aging.total_outstanding || 0);
    const oldBalance = Number(aging['90_plus'] || 0);
    const bucketRows = BUCKETS.map((bucket) => {
        const amount = Number(aging[bucket.key] || 0);
        return {
            ...bucket,
            name: t(`finance.receivables.buckets.${bucket.key}`, { defaultValue: bucket.label }),
            amount,
            percent: total > 0 ? (amount / total) * 100 : 0,
        };
    });

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
            {/* Header */}
            <div className="flex items-start gap-4 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5 sm:p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30 shadow-md">
                    <ShieldCheck size={22} />
                </span>
                <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">
                        {t('finance.receivables.title')}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                        {t('finance.receivables.description')}
                    </p>
                </div>
            </div>

            <div className="p-5 sm:p-7">
                {/* Metric Cards Grid */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                    <article className="col-span-2 flex min-h-[120px] flex-col justify-between rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/20 dark:border dark:border-white/10 dark:bg-slate-900 lg:col-span-1">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {t('finance.receivables.totalOutstanding')}
                            </p>
                            <TrendingUp size={16} className="text-indigo-400" />
                        </div>
                        <p className="mt-3 break-all font-mono text-2xl font-black text-white">
                            {money(total)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400 font-semibold">
                            {t('finance.receivables.allBuckets')}
                        </p>
                    </article>

                    {BUCKETS.map((bucket) => {
                        const amount = Number(aging[bucket.key] || 0);
                        const percent = total > 0 ? (amount / total) * 100 : 0;
                        return (
                            <article
                                key={bucket.key}
                                className={`group min-h-[120px] flex flex-col justify-between rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${bucket.surface}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className={`text-[10px] font-black uppercase tracking-wider ${bucket.text}`}>
                                        {t(`finance.receivables.buckets.${bucket.key}`)}
                                    </p>
                                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                                        {percent.toFixed(1)}%
                                    </span>
                                </div>
                                <p className="mt-4 break-all font-mono text-xl font-black text-slate-900 dark:text-white">
                                    {money(amount)}
                                </p>
                            </article>
                        );
                    })}
                </div>

                {/* Aging Progress Visual Bar */}
                <section className="mt-8" aria-labelledby="aging-distribution">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h3 id="aging-distribution" className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            {t('finance.receivables.distribution')}
                        </h3>
                        <span className="text-xs font-semibold text-slate-400">
                            {t('finance.receivables.distributionDescription')}
                        </span>
                    </div>

                    <AccessibleChartData
                        title={t('finance.receivables.distributionLabel')}
                        summary={t('finance.receivables.chartSummary', { count: bucketRows.length, defaultValue: 'Outstanding receivables across {{count}} aging buckets.' })}
                        rows={bucketRows}
                        columns={[
                            { key: 'name', label: t('finance.receivables.bucket', { defaultValue: 'Aging bucket' }) },
                            { key: 'amount', label: t('finance.receivables.amount', { defaultValue: 'Amount' }), render: row => money(row.amount) },
                            { key: 'percent', label: t('finance.receivables.share', { defaultValue: 'Share' }), render: row => `${row.percent.toFixed(1)}%` },
                        ]}
                        disclosureLabel={t('finance.receivables.viewChartData', { defaultValue: 'View chart data' })}
                        tableLabel={t('finance.receivables.chartDataTable', { defaultValue: 'Receivables aging distribution data' })}
                    >
                        <div className="flex h-10 w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100/80 shadow-inner dark:border-white/10 dark:bg-slate-900/80">
                            {total === 0 ? (
                                <div className="flex w-full items-center justify-center text-xs font-bold text-slate-400">
                                    {t('finance.receivables.noOutstanding')}
                                </div>
                            ) : bucketRows.map((bucket) => bucket.percent > 0 ? (
                                <div
                                    key={bucket.key}
                                    style={{ width: `${bucket.percent}%` }}
                                    className={`${bucket.color} flex min-w-px items-center justify-center overflow-hidden text-[10px] font-black text-white shadow-sm transition-all`}
                                    title={`${bucket.name}: ${money(bucket.amount)}`}
                                >
                                    {bucket.percent >= 8 ? `${bucket.percent.toFixed(0)}%` : ''}
                                </div>
                            ) : null)}
                        </div>
                    </AccessibleChartData>

                    <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                        {BUCKETS.map((bucket) => (
                            <span key={bucket.key} className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${bucket.color}`} />
                                {t(`finance.receivables.buckets.${bucket.key}`)}
                            </span>
                        ))}
                    </div>
                </section>

                {/* Health Status Banners */}
                {oldBalance > 0 ? (
                    <div role="alert" className="mt-8 flex items-start gap-3.5 rounded-2xl border border-rose-300/80 bg-rose-50/90 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
                        <AlertCircle className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" size={22} />
                        <div>
                            <h4 className="font-black text-rose-950 dark:text-rose-100">{t('finance.receivables.criticalTitle')}</h4>
                            <p className="mt-1 text-xs leading-5 font-medium text-rose-800 dark:text-rose-200">
                                {t('finance.receivables.criticalDescription', { amount: money(oldBalance) })}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="mt-8 flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-5 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                        <Clock3 size={20} className="text-emerald-600 dark:text-emerald-400" />
                        {t('finance.receivables.healthy')}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AgingReceivables;
