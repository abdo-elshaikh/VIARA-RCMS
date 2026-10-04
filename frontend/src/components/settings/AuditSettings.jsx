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
    X,
    Check,
    Copy,
    Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useGetMyAuditLogsQuery } from '../../store/api';
import { formatRelativeTime } from '../../utils/dateFormat';
import Pagination from '../ui/Pagination';

const csvValue = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

const AuditSettings = ({ embedded = false }) => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const [page, setPage] = useState(1);
    const pageSize = 50;
    const { data: logData, isLoading, isError, refetch } = useGetMyAuditLogsQuery({ limit: pageSize, offset: (page - 1) * pageSize });
    const logs = useMemo(() => logData?.logs || [], [logData?.logs]);
    const [query, setQuery] = useState('');
    const pageCount = Math.max(1, Math.ceil(Number(logData?.total || 0) / pageSize));
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

    const stats = useMemo(() => {
        const total = Number(logData?.total ?? logs.length);
        const failed = Number(logData?.summary?.failed ?? logs.filter(l => l.outcome === 'failure' || l.outcome === 'denied').length);
        const auth = Number(logData?.summary?.auth ?? logs.filter(l => (l.event || '').toLowerCase().includes('login') || (l.event || '').toLowerCase().includes('auth')).length);
        return { total, failed, auth };
    }, [logData?.summary, logData?.total, logs]);

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
        anchor.download = `viara-account-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={embedded ? 'space-y-5 pb-0' : 'space-y-6'}>
            {/* Top Account Audit Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Activity size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Shield size={11} />
                                    <span>{t('settings.audit.eyebrow', { defaultValue: 'Security & Access Trace' })}</span>
                                </span>
                                {stats.failed > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                                        <AlertTriangle size={11} />
                                        <span>{stats.failed} {t('settings.audit.suspiciousFailed')}</span>
                                    </span>
                                )}
                            </div>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('settings.audit.title', { defaultValue: 'My Security & Audit Log' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.audit.subtitle', { defaultValue: 'Immutable record of logins, sensitive PHI access, exports, and credential modifications for your account.' })}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 text-center">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{t('settings.audit.metricTotal')}</span>
                            <p className="mt-1 text-xs font-black text-slate-900 dark:text-white">{stats.total}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 text-center">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{t('settings.audit.metricAuth')}</span>
                            <p className="mt-1 text-xs font-black text-teal-700 dark:text-teal-300">{stats.auth}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 text-center">
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{t('settings.audit.metricAlerts')}</span>
                            <p className={`mt-1 text-xs font-black ${stats.failed > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{stats.failed}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Audit List Container */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <header className="flex flex-col gap-3 border-b border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                            <Shield size={16} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-xs font-black uppercase tracking-wider text-slate-950 dark:text-white">{t('settings.audit.activityLog', { defaultValue: 'Account Activity Stream' })}</h2>
                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('settings.audit.activityHint', { defaultValue: 'Cryptographically ordered trail of authentication and data query events.' })}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[220px]">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder={t('settings.audit.searchPlaceholder', { defaultValue: 'Search events, IP, outcome...' })}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-8 pe-8 text-xs font-bold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            />
                            {query ? (
                                <button type="button" onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={t('settings.audit.clearSearch')}>
                                    <X size={13} />
                                </button>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={exportCsv}
                            disabled={visibleLogs.length === 0}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <DownloadCloud size={13} aria-hidden="true" />
                            <span>{t('settings.audit.exportCsv', { defaultValue: 'Export CSV' })}</span>
                        </button>
                    </div>
                </header>

                <div className="min-h-[280px]">
                    {!isLoading && !isError && stats.total > logs.length ? (
                        <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                            {t('settings.audit.showingRecent', { count: logs.length, total: stats.total, defaultValue: `Showing events ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, stats.total)} of ${stats.total}. Search and export apply to this page.` })}
                        </p>
                    ) : null}
                    {isLoading ? <LoadingRows /> : null}
                    {!isLoading && isError ? <State icon={AlertCircle} title={t('settings.audit.loadFailed')} description={t('settings.audit.loadFailedHint')} tone="rose" actionLabel={t('common.retry', { defaultValue: 'Retry' })} onAction={refetch} /> : null}
                    {!isLoading && !isError && visibleLogs.length === 0 ? (
                        <State icon={Eye} title={query ? t('settings.audit.noMatch') : t('settings.audit.noActivity')} description={query ? t('settings.audit.noMatchHint') : t('settings.audit.noActivityHint')} />
                    ) : null}
                    {!isLoading && !isError && visibleLogs.map(log => <AuditRow key={log.id} log={log} t={t} locale={i18n.resolvedLanguage || i18n.language} />)}
                    {!isLoading && !isError && stats.total > pageSize ? (
                        <Pagination currentPage={page} pageCount={pageCount} onPageChange={setPage} isRtl={i18n.language?.startsWith('ar')} />
                    ) : null}
                </div>
            </section>
        </div>
    );
};

const AuditRow = ({ log, t, locale }) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const meta = classify(log.event);
    const Icon = meta.icon;
    const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
    const outcome = log.outcome || 'success';
    const jsonStr = hasMetadata ? JSON.stringify(log.metadata, null, 2) : '';
    const hasRedaction = jsonStr.includes('[REDACTED]');

    const handleCopy = async (event) => {
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(jsonStr);
            setCopied(true);
            toast.success(t('settings.audit.copied'));
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error(t('settings.audit.copyFailed'));
        }
    };

    return (
        <div className="border-b border-slate-100 last:border-0 dark:border-slate-800/80">
            <button
                type="button"
                className="group flex w-full flex-col justify-between gap-3 p-4 text-start transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:px-6"
                onClick={() => hasMetadata && setExpanded(value => !value)}
            >
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg} ${meta.text} ring-1 ${meta.ring} shadow-2xs`}>
                        <Icon size={18} aria-hidden="true" />
                        <span className={`absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${meta.dot}`} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="break-words text-xs font-black text-slate-950 dark:text-white">{log.event}</p>
                            <OutcomeChip outcome={outcome} t={t} />
                            {hasRedaction && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[9px] font-bold text-teal-700 dark:text-teal-300">
                                    <Lock size={9} />
                                    <span>{t('settings.audit.hipaaSanitized')}</span>
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 break-all text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {log.ip ? <span className="font-mono text-slate-600 dark:text-slate-300">IP: {log.ip}</span> : <span className="text-slate-400">{t('settings.audit.internalSession')}</span>}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-slate-400">{formatRelativeTime(log.time, locale)}</span>
                    {hasMetadata ? (
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${expanded ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 dark:bg-slate-800 dark:group-hover:bg-slate-700'}`}>
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                    ) : null}
                </div>
            </button>

            {expanded && hasMetadata ? (
                <div className="px-4 pb-4 sm:px-6">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-300 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('settings.audit.payloadSnapshot')}</span>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition"
                            >
                                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                <span>{copied ? t('settings.audit.copied') : t('settings.audit.copyJson')}</span>
                            </button>
                        </div>
                        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-300">
                            {jsonStr}
                        </pre>
                    </div>
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

const State = ({ icon: Icon, title, description, tone = 'slate', actionLabel, onAction }) => (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone === 'rose' ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
            <Icon size={24} aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
        {onAction ? <button type="button" onClick={onAction} className="mt-4 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">{actionLabel}</button> : null}
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
