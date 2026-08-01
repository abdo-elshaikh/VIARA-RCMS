import React, { useMemo, useState } from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    DownloadCloud,
    Eye,
    Key,
    LogIn,
    Search,
    Shield,
    X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetMyAuditLogsQuery } from '../../store/api';
import { formatRelativeTime } from '../../utils/dateFormat';

const csvValue = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

const AuditSettings = () => {
    const { t } = useTranslation(['settings', 'common']);
    const { data: logData, isLoading, isError } = useGetMyAuditLogsQuery();
    const logs = useMemo(() => logData?.logs || [], [logData?.logs]);
    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLowerCase();
    const visibleLogs = useMemo(() => {
        if (!normalizedQuery) return logs;
        return logs.filter(log => [
            log.event,
            log.outcome,
            log.ip,
            log.time,
            log.metadata ? JSON.stringify(log.metadata) : ''
        ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery));
    }, [logs, normalizedQuery]);

    const exportCsv = () => {
        const rows = visibleLogs.map(log => [
            log.time,
            log.event,
            log.outcome,
            log.ip,
            log.metadata ? JSON.stringify(log.metadata) : ''
        ].map(csvValue).join(','));
        const csv = ['Time,Event,Outcome,IP,Metadata', ...rows].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `rcms-account-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Activity size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-950 dark:text-white">{t('settings.audit.title')}</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t('settings.audit.subtitle')}</p>
                        </div>
                    </div>
                    <div className={`rounded-xl px-3 py-1.5 text-xs font-bold ring-1 ${isError ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60'}`}>
                        {isError ? t('settings.audit.error') : t('settings.audit.events', { count: logs.length })}
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
                <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Shield size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.audit.activityLog')}</h2>
                            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.audit.activityHint')}</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="relative">
                            <span className="sr-only">{t('settings.audit.searchEvents')}</span>
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder={t('settings.audit.searchPlaceholder')}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white ps-8 pe-8 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:w-64"
                            />
                            {query ? (
                                <button type="button" onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={t('settings.audit.clearSearch')}>
                                    <X size={13} />
                                </button>
                            ) : null}
                        </label>
                        <button type="button" onClick={exportCsv} disabled={visibleLogs.length === 0} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                            <DownloadCloud size={13} aria-hidden="true" />
                            {t('settings.audit.exportCsv')}
                        </button>
                    </div>
                </header>

                <div className="min-h-[280px]">
                    {isLoading ? <LoadingRows /> : null}
                    {!isLoading && isError ? <State icon={AlertCircle} title={t('settings.audit.loadFailed')} description={t('settings.audit.loadFailedHint')} tone="rose" /> : null}
                    {!isLoading && !isError && visibleLogs.length === 0 ? (
                        <State icon={Eye} title={query ? t('settings.audit.noMatch') : t('settings.audit.noActivity')} description={query ? t('settings.audit.noMatchHint') : t('settings.audit.noActivityHint')} />
                    ) : null}
                    {!isLoading && !isError && visibleLogs.map(log => <AuditRow key={log.id} log={log} t={t} />)}
                </div>
            </section>
        </div>
    );
};

const AuditRow = ({ log, t }) => {
    const [expanded, setExpanded] = useState(false);
    const meta = classify(log.event);
    const Icon = meta.icon;
    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
    const outcome = log.outcome || 'success';

    return (
        <div className="border-b border-slate-100 last:border-0 dark:border-slate-800">
            <button type="button" className="group flex w-full flex-col justify-between gap-4 px-4 py-3 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center" onClick={() => hasMetadata && setExpanded(value => !value)}>
                <div className="flex min-w-0 items-center gap-3">
                    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.text} ring-1 ${meta.ring}`}>
                        <Icon size={17} aria-hidden="true" />
                        <span className={`absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${meta.dot}`} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{log.event}</p>
                            <OutcomeChip outcome={outcome} t={t} />
                        </div>
                        <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                            {log.ip ? <span className="font-mono">{log.ip}</span> : null}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <span className="whitespace-nowrap text-xs font-semibold text-slate-400">{formatRelativeTime(log.time)}</span>
                    {hasMetadata ? (
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${expanded ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 dark:bg-slate-800 dark:group-hover:bg-slate-700'}`}>
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                    ) : null}
                </div>
            </button>
            {expanded && hasMetadata ? (
                <div className="px-4 pb-4 sm:ps-[68px]">
                    <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300">
                        {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                </div>
            ) : null}
        </div>
    );
};

const LoadingRows = () => (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {[1, 2, 3, 4].map(item => (
            <div key={item} className="flex items-center gap-4 px-4 py-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-2.5 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
            </div>
        ))}
    </div>
);

const State = ({ icon: Icon, title, description, tone = 'slate' }) => (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone === 'rose' ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
            <Icon size={24} aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
);

const OUTCOME_CHIP = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60',
    failure: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
    denied: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60',
};

const OutcomeChip = ({ outcome, t }) => {
    const value = outcome || 'success';
    if (value === 'success') return null;
    const label = t(`settings.audit.outcome${value.charAt(0).toUpperCase()}${value.slice(1)}`, { defaultValue: value });
    return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${OUTCOME_CHIP[value] || OUTCOME_CHIP.success}`}>{label}</span>;
};

const classify = event => {
    const value = (event || '').toLowerCase();
    if (value.includes('login')) return { icon: LogIn, bg: 'bg-cyan-50 dark:bg-cyan-950/30', text: 'text-cyan-700 dark:text-cyan-300', ring: 'ring-cyan-200 dark:ring-cyan-900/60', dot: 'bg-cyan-500' };
    if (value.includes('password') || value.includes('key')) return { icon: Key, bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-200 dark:ring-amber-900/60', dot: 'bg-amber-500' };
    if (value.includes('export') || value.includes('download')) return { icon: DownloadCloud, bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', ring: 'ring-indigo-200 dark:ring-indigo-900/60', dot: 'bg-indigo-500' };
    if (value.includes('failed') || value.includes('alert')) return { icon: AlertTriangle, bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', ring: 'ring-rose-200 dark:ring-rose-900/60', dot: 'bg-rose-500' };
    return { icon: Shield, bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', ring: 'ring-slate-200 dark:ring-slate-700', dot: 'bg-slate-400' };
};

export default AuditSettings;
