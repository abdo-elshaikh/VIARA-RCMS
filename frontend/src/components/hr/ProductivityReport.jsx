import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Filter, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { useGetProductivityReportQuery } from '../../store/api';

const toDateInputValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const asCount = value => Number(value || 0);

const ProductivityReport = () => {
    const { t } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.productivity.${key}`, options);
    const now = new Date();
    const [dateRange, setDateRange] = useState({
        startDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toDateInputValue(now)
    });

    const dateRangeInvalid = Boolean(dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate);
    const { data: report = [], isLoading, isError, isFetching, refetch } = useGetProductivityReportQuery(dateRange, { skip: dateRangeInvalid });

    const receptionists = useMemo(
        () => report.filter(r => r.role === 'Receptionist').sort((a, b) => asCount(b.metric_count) - asCount(a.metric_count)),
        [report]
    );
    const technicians = useMemo(
        () => report.filter(r => r.role === 'Technician').sort((a, b) => asCount(b.metric_count) - asCount(a.metric_count)),
        [report]
    );

    const setDate = (field, value) => setDateRange(current => ({ ...current, [field]: value }));

    return (
        <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <div className="flex flex-col gap-4 border-b border-slate-100/80 pb-6 dark:border-white/5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 shadow-md dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30">
                            <Target size={22} />
                        </span>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{copy('title')}</h2>
                            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{copy('description')}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-slate-900">
                            <Filter size={15} className="ms-1 text-slate-400" />
                            <input
                                type="date"
                                aria-label={copy('startDate')}
                                className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                                value={dateRange.startDate}
                                onChange={event => setDate('startDate', event.target.value)}
                            />
                            <span className="px-1 text-xs font-black text-slate-400">{copy('to')}</span>
                            <input
                                type="date"
                                aria-label={copy('endDate')}
                                className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                                value={dateRange.endDate}
                                onChange={event => setDate('endDate', event.target.value)}
                            />
                        </div>
                        <button type="button" onClick={() => refetch()} disabled={isFetching || dateRangeInvalid} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {copy('refresh')}
                        </button>
                    </div>
                </div>

                {dateRangeInvalid ? (
                    <ErrorState message={copy('dateRangeInvalid')} />
                ) : isError ? (
                    <ErrorState message={copy('loadError')} onRetry={refetch} retryLabel={copy('retry')} />
                ) : (
                    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                        <PerformancePanel
                            title={copy('receptionistTitle')}
                            metricLabel={copy('invoicesGenerated')}
                            emptyLabel={copy('noInvoices')}
                            isLoading={isLoading}
                            loadingLabel={copy('loading')}
                            secondaryLabel={copy('invoicingOutput')}
                            rows={receptionists}
                        />
                        <PerformancePanel
                            title={copy('technicianTitle')}
                            metricLabel={copy('examsCompleted')}
                            emptyLabel={copy('noExams')}
                            isLoading={isLoading}
                            loadingLabel={copy('loading')}
                            secondaryLabel={copy('clinicalOutput')}
                            rows={technicians}
                        />
                    </div>
                )}
            </section>
        </div>
    );
};

const PerformancePanel = ({ title, metricLabel, emptyLabel, isLoading, loadingLabel, secondaryLabel, rows }) => (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100/80 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/5">
            <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">{title}</h3>
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                {metricLabel}
            </span>
        </div>
        <div className="p-5">
            {isLoading ? (
                <div className="animate-pulse py-8 text-center text-xs font-bold text-slate-400">{loadingLabel}</div>
            ) : rows.length === 0 ? (
                <div className="py-8 text-center text-xs font-medium text-slate-400">{emptyLabel}</div>
            ) : (
                <div className="space-y-3">
                    {rows.map((row, index) => (
                        <div key={row.user_id} className="flex items-center justify-between rounded-2xl border border-slate-100/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/[0.02]">
                            <div className="flex min-w-0 items-center gap-3.5">
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                                    index === 0
                                        ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    {index === 0 ? <Award size={16} /> : `#${index + 1}`}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-black text-slate-900 dark:text-white">{row.full_name}</p>
                                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{secondaryLabel}</p>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <span className="font-mono text-xl font-black text-slate-900 dark:text-white">{asCount(row.metric_count)}</span>
                                <TrendingUp size={16} className="text-emerald-500" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
);

const ErrorState = ({ message, onRetry, retryLabel }) => (
    <div role="alert" className="mt-6 rounded-2xl border border-rose-200/80 bg-rose-50/80 p-5 text-center dark:border-rose-500/20 dark:bg-rose-500/10">
        <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{message}</p>
        {onRetry && (
            <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-rose-200 px-4 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
                {retryLabel}
            </button>
        )}
    </div>
);

export default ProductivityReport;
