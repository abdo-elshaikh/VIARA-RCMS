import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    Filter,
    Eye,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldAlert,
    ShieldCheck,
    ShieldX
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    useGetAuditAlertsQuery,
    useGetAuditLogsQuery,
    useLazyVerifyAuditChainQuery,
    useReviewAuditAlertMutation,
    useRunAuditDetectionsMutation
} from '../store/api';
import PageHeader from '../components/ui/PageHeader';

const PAGE_SIZE = 25;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const EMPTY_FILTERS = {
    q: '',
    action: '',
    eventCode: '',
    userId: '',
    actorType: '',
    category: '',
    outcome: '',
    minSeverity: '',
    minRisk: '',
    targetType: '',
    patientId: '',
    startDate: '',
    endDate: '',
};
const CATEGORIES = ['AUTH', 'RBAC', 'PHI_ACCESS', 'PRIVACY', 'BILLING', 'CONFIG', 'DATA_WRITE', 'SECURITY'];
const OUTCOMES = ['success', 'failure', 'denied'];
const ACTOR_TYPES = ['USER', 'SYSTEM', 'PATIENT', 'API_TOKEN', 'INTEGRATION'];
const SEVERITIES = [
    { value: '30', key: 'sevNotice' },
    { value: '40', key: 'sevWarning' },
    { value: '50', key: 'sevCritical' },
];

const AuditLogs = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('admin');
    const token = useSelector((state) => state.auth?.token) || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('token') : null);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [expandedId, setExpandedId] = useState(null);
    const [mounted, setMounted] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyChain, verifyState] = useLazyVerifyAuditChainQuery();
    const [runDetections, detectionState] = useRunAuditDetectionsMutation();
    const [reviewAlert, reviewAlertState] = useReviewAuditAlertMutation();
    const { data: alertData, isLoading: alertsLoading, refetch: refetchAlerts } = useGetAuditAlertsQuery({ status: 'open', limit: 8 });

    useEffect(() => { setMounted(true); }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-700 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`,
        style: { transitionDelay: `${delay}ms` },
    });

    // Only send non-empty filters to the server.
    const activeParams = useMemo(() => Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
    ), [filters]);

    const params = { ...activeParams, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
    const { data, isLoading, isFetching, isError, refetch } = useGetAuditLogsQuery(params);
    const logs = useMemo(() => Array.isArray(data?.logs) ? data.logs : [], [data?.logs]);
    const total = Number(data?.total || 0);
    const serverSummary = data?.summary || {};
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const activeFilters = Object.values(filters).filter(Boolean).length;
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

    const updateFilter = (field, value) => {
        setFilters((current) => ({ ...current, [field]: value }));
        setPage(1);
        setExpandedId(null);
    };

    const resetFilters = () => {
        setFilters(EMPTY_FILTERS);
        setPage(1);
        setExpandedId(null);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const search = new URLSearchParams({ ...activeParams, limit: '50000' }).toString();
            const response = await fetch(`${API_BASE}/v1/audit/export?${search}`, {
                headers: token ? { authorization: `Bearer ${token}` } : {},
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`Export failed: ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            toast.success(t('audit.exportAllDone'));
        } catch (error) {
            toast.error(t('audit.exportError'));
        } finally {
            setExporting(false);
        }
    };

    const handleVerify = async () => {
        try {
            const result = await verifyChain().unwrap();
            setVerifyResult(result);
        } catch (error) {
            toast.error(t('audit.verifyError'));
        }
    };

    const handleDetect = async () => {
        try {
            const result = await runDetections({}).unwrap();
            toast.success(t('audit.detectDone', {
                defaultValue: 'Detection scan complete: {{count}} alert(s) created.',
                count: Number(result.totalCreated || 0),
            }));
            refetch();
            refetchAlerts();
        } catch (error) {
            toast.error(t('audit.detectError', { defaultValue: 'Detection scan failed.' }));
        }
    };

    const handleReviewAlert = async (alertId, status) => {
        try {
            await reviewAlert({ alertId, status }).unwrap();
            toast.success(status === 'dismissed'
                ? t('audit.alertDismissed', { defaultValue: 'Alert dismissed.' })
                : t('audit.alertResolved', { defaultValue: 'Alert resolved.' }));
            refetchAlerts();
        } catch (error) {
            toast.error(t('audit.alertReviewError', { defaultValue: 'Could not update alert.' }));
        }
    };

    const exportButton = (
        <button type="button" onClick={handleExport} disabled={exporting || !total} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-teal-100">
            {exporting ? <RefreshCw size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />} {t('audit.exportAll')}
        </button>
    );

    const verifyButton = (
        <button type="button" onClick={handleVerify} disabled={verifyState.isFetching} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            {verifyState.isFetching ? <RefreshCw size={18} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />} {verifyState.isFetching ? t('audit.verifying') : t('audit.verify')}
        </button>
    );

    const detectButton = (
        <button type="button" onClick={handleDetect} disabled={detectionState.isLoading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20">
            {detectionState.isLoading ? <RefreshCw size={18} className="animate-spin" aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />} {detectionState.isLoading ? t('audit.detecting', { defaultValue: 'Detecting...' }) : t('audit.detect', { defaultValue: 'Run detection' })}
        </button>
    );

    return (
        <main className={embedded ? 'space-y-6' : 'mx-auto max-w-[1500px] space-y-6 pb-10'}>
            {embedded ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('audit.description')}</p>
                    <div className="flex flex-wrap gap-2">{detectButton}{verifyButton}{exportButton}</div>
                </div>
            ) : (
                <PageHeader
                    icon={ShieldCheck}
                    eyebrow={t('audit.eyebrow')}
                    title={t('audit.title')}
                    description={t('audit.description')}
                    actions={<div className="flex flex-wrap gap-2">{detectButton}{verifyButton}{exportButton}</div>}
                />
            )}

            {verifyResult ? (
                <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${verifyResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'}`}>
                    {verifyResult.ok ? <ShieldCheck size={20} className="mt-0.5 shrink-0" aria-hidden="true" /> : <ShieldX size={20} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    <div>
                        <p className="font-semibold">{verifyResult.ok ? t('audit.verifyOk', { count: verifyResult.checkedCount }) : t('audit.verifyBroken', { id: verifyResult.firstBrokenLogId })}</p>
                        {verifyResult.note ? <p className="mt-1 text-xs opacity-80">{verifyResult.note}</p> : null}
                    </div>
                </div>
            ) : null}

            <section style={reveal(80).style} className={`grid grid-cols-2 gap-3 lg:grid-cols-6 ${reveal(80).className}`} aria-label={t('audit.summary')}>
                <SummaryCard icon={Activity} label={t('audit.matchingEvents')} value={isLoading ? '-' : total.toLocaleString(locale)} note={t('audit.serverTotal')} />
                <SummaryCard icon={ShieldAlert} label={t('audit.failures')} value={isLoading ? '-' : Number(serverSummary.failures || 0).toLocaleString(locale)} note={t('audit.serverTotal')} tone={serverSummary.failures ? 'danger' : 'default'} />
                <SummaryCard icon={ShieldX} label={t('audit.denied')} value={isLoading ? '-' : Number(serverSummary.denied || 0).toLocaleString(locale)} note={t('audit.serverTotal')} tone={serverSummary.denied ? 'warning' : 'default'} />
                <SummaryCard icon={Eye} label={t('audit.phiAccess')} value={isLoading ? '-' : Number(serverSummary.phiAccess || 0).toLocaleString(locale)} note={t('audit.serverTotal')} />
                <SummaryCard icon={AlertTriangle} label={t('audit.risky', { defaultValue: 'Risky' })} value={isLoading ? '-' : Number(serverSummary.risky || 0).toLocaleString(locale)} note={t('audit.serverTotal')} tone={serverSummary.risky ? 'warning' : 'default'} />
                <SummaryCard icon={Activity} label={t('audit.systemEvents', { defaultValue: 'System' })} value={isLoading ? '-' : Number(serverSummary.systemEvents || 0).toLocaleString(locale)} note={t('audit.serverTotal')} />
            </section>

            <AlertCenter
                alerts={alertData?.alerts || []}
                loading={alertsLoading}
                reviewing={reviewAlertState.isLoading}
                locale={locale}
                t={t}
                onResolve={(alertId) => handleReviewAlert(alertId, 'resolved')}
                onDismiss={(alertId) => handleReviewAlert(alertId, 'dismissed')}
            />

            <section style={reveal(160).style} className={`rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 sm:p-5 ${reveal(160).className}`} aria-labelledby="audit-filter-heading">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <Filter size={18} className="text-slate-600 dark:text-slate-300" aria-hidden="true" />
                            <h2 id="audit-filter-heading" className="font-semibold text-slate-900 dark:text-slate-100">{t('audit.filters')}</h2>
                            {activeFilters > 0 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{activeFilters}</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('audit.filtersDescription')}</p>
                    </div>
                    <button type="button" onClick={resetFilters} disabled={!activeFilters} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                        <RotateCcw size={14} aria-hidden="true" /> {t('audit.reset')}
                    </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <FilterField label={t('audit.search')} icon={Search} wide>
                        <input type="search" placeholder={t('audit.searchPlaceholder')} className={`${INPUT} ps-10`} value={filters.q} onChange={(event) => updateFilter('q', event.target.value)} />
                    </FilterField>
                    <FilterField label={t('audit.category')}>
                        <select className={INPUT} value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
                            <option value="">{t('audit.allCategories')}</option>
                            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{t(`audit.cat${cat}`)}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label={t('audit.outcome')}>
                        <select className={INPUT} value={filters.outcome} onChange={(event) => updateFilter('outcome', event.target.value)}>
                            <option value="">{t('audit.allOutcomes')}</option>
                            {OUTCOMES.map((oc) => <option key={oc} value={oc}>{t(`audit.outcome${oc.charAt(0).toUpperCase()}${oc.slice(1)}`)}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label={t('audit.severity')}>
                        <select className={INPUT} value={filters.minSeverity} onChange={(event) => updateFilter('minSeverity', event.target.value)}>
                            <option value="">{t('audit.anySeverity')}</option>
                            {SEVERITIES.map((sev) => <option key={sev.value} value={sev.value}>{t(`audit.${sev.key}`)}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label={t('audit.actionType')} icon={Search}>
                        <input type="search" placeholder={t('audit.actionPlaceholder')} className={`${INPUT} ps-10`} value={filters.action} onChange={(event) => updateFilter('action', event.target.value)} />
                    </FilterField>
                    <FilterField label={t('audit.eventCode', { defaultValue: 'Event code' })} icon={Search}>
                        <input type="search" placeholder="PATIENT.UPDATED" className={`${INPUT} ps-10 font-mono placeholder:font-sans`} value={filters.eventCode} onChange={(event) => updateFilter('eventCode', event.target.value.trim())} />
                    </FilterField>
                    <FilterField label={t('audit.actorType', { defaultValue: 'Actor' })}>
                        <select className={INPUT} value={filters.actorType} onChange={(event) => updateFilter('actorType', event.target.value)}>
                            <option value="">{t('audit.allActors', { defaultValue: 'All actors' })}</option>
                            {ACTOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label={t('audit.userId')}>
                        <input type="text" placeholder={t('audit.uuidPlaceholder')} className={`${INPUT} font-mono placeholder:font-sans`} value={filters.userId} onChange={(event) => updateFilter('userId', event.target.value.trim())} />
                    </FilterField>
                    <FilterField label={t('audit.targetType', { defaultValue: 'Target type' })}>
                        <input type="text" placeholder="patients" className={`${INPUT} font-mono placeholder:font-sans`} value={filters.targetType} onChange={(event) => updateFilter('targetType', event.target.value.trim())} />
                    </FilterField>
                    <FilterField label={t('audit.patientId', { defaultValue: 'Patient ID' })}>
                        <input type="text" placeholder={t('audit.uuidPlaceholder')} className={`${INPUT} font-mono placeholder:font-sans`} value={filters.patientId} onChange={(event) => updateFilter('patientId', event.target.value.trim())} />
                    </FilterField>
                    <FilterField label={t('audit.risk', { defaultValue: 'Risk' })}>
                        <select className={INPUT} value={filters.minRisk} onChange={(event) => updateFilter('minRisk', event.target.value)}>
                            <option value="">{t('audit.anyRisk', { defaultValue: 'Any risk' })}</option>
                            <option value="50">{t('audit.riskWarning', { defaultValue: '50+ warning' })}</option>
                            <option value="85">{t('audit.riskCritical', { defaultValue: '85+ critical' })}</option>
                        </select>
                    </FilterField>
                    <FilterField label={t('audit.startDate')}>
                        <input type="date" className={`${INPUT} [color-scheme:dark]`} value={filters.startDate} max={filters.endDate || undefined} onChange={(event) => updateFilter('startDate', event.target.value)} />
                    </FilterField>
                    <FilterField label={t('audit.endDate')}>
                        <input type="date" className={`${INPUT} [color-scheme:dark]`} value={filters.endDate} min={filters.startDate || undefined} onChange={(event) => updateFilter('endDate', event.target.value)} />
                    </FilterField>
                </div>
            </section>

            <section style={reveal(240).style} className={`overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 ${reveal(240).className}`} aria-labelledby="audit-results-heading">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 px-5 py-4 sm:px-6">
                    <div>
                        <h2 id="audit-results-heading" className="font-semibold text-slate-900 dark:text-slate-100">{t('audit.eventStream')}</h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('audit.showingRange', { start: total ? (page - 1) * PAGE_SIZE + 1 : 0, end: Math.min(page * PAGE_SIZE, total), total })}</p>
                    </div>
                    {isFetching && !isLoading ? <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-700"><RefreshCw size={13} className="animate-spin" aria-hidden="true" />{t('audit.refreshing')}</span> : null}
                </div>

                {isLoading ? <AuditLoading label={t('audit.loading')} /> : isError ? <AuditError label={t('audit.loadError')} retry={t('audit.retry')} onRetry={refetch} /> : logs.length === 0 ? <AuditEmpty title={t('audit.empty')} description={activeFilters ? t('audit.emptyFiltered') : t('audit.emptyDefault')} /> : (
                    <>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
                            {logs.map((log) => <AuditCard key={log.log_id} log={log} locale={locale} t={t} systemLabel={t('audit.system')} detailsLabel={t('audit.details')} expanded={expandedId === log.log_id} onToggle={() => setExpandedId((id) => id === log.log_id ? null : log.log_id)} />)}
                        </div>
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="w-full min-w-[1080px] text-start text-sm">
                                <thead className="bg-slate-50/80 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800/80">
                                    <tr>{['timestamp', 'user', 'category', 'action', 'outcome', 'resourceId', 'ip'].map((key) => <th key={key} scope="col" className="px-5 py-3 text-start text-[11px] font-black uppercase tracking-wider">{t(`audit.${key}`)}</th>)}<th scope="col" className="w-12 px-3 py-3"><span className="sr-only">{t('audit.details')}</span></th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {logs.map((log) => <AuditRow key={log.log_id} log={log} locale={locale} t={t} systemLabel={t('audit.system')} detailsLabel={t('audit.details')} expanded={expandedId === log.log_id} onToggle={() => setExpandedId((id) => id === log.log_id ? null : log.log_id)} />)}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {!isLoading && !isError && total > 0 ? (
                    <nav className="flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800 px-4 py-4 sm:px-6" aria-label={t('audit.pagination')}>
                        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ChevronLeft size={16} className="rtl:rotate-180" aria-hidden="true" /> <span className="hidden sm:inline">{t('audit.previous')}</span></button>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('audit.pageOf', { page, count: pageCount })}</p>
                        <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><span className="hidden sm:inline">{t('audit.next')}</span> <ChevronRight size={16} className="rtl:rotate-180" aria-hidden="true" /></button>
                    </nav>
                ) : null}
            </section>
        </main>
    );
};

const INPUT = 'h-11 w-full rounded-lg border border-slate-200/60 bg-white/80 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800';

const TONE_ICON = {
    danger: 'bg-rose-100/80 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    warning: 'bg-amber-100/80 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    default: 'bg-slate-100/80 text-slate-600 dark:bg-slate-850 dark:text-slate-300',
};

const SummaryCard = ({ icon: Icon, label, value, note, tone = 'default' }) => <article className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><span className={`rounded-lg p-2 ${TONE_ICON[tone] || TONE_ICON.default}`}><Icon size={16} aria-hidden="true" /></span></div><p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-slate-50 sm:text-3xl">{value}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p></article>;

const AlertCenter = ({ alerts, loading, reviewing, locale, t, onResolve, onDismiss }) => {
    if (loading) {
        return <section className="rounded-2xl border border-slate-200/60 bg-white/70 p-5 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/50"><div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" /></section>;
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50/60 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10" aria-labelledby="audit-alerts-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/70 px-5 py-4 dark:border-amber-500/20">
                <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"><ShieldAlert size={18} aria-hidden="true" /></span>
                    <div>
                        <h2 id="audit-alerts-heading" className="font-semibold text-amber-950 dark:text-amber-100">{t('audit.alertCenter', { defaultValue: 'Open audit alerts' })}</h2>
                        <p className="text-xs text-amber-800/70 dark:text-amber-100/70">{t('audit.alertCenterHint', { defaultValue: 'Review detection results before exporting or closing an investigation.' })}</p>
                    </div>
                </div>
                <span className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-slate-950/20 dark:text-amber-100 dark:ring-amber-500/30">{alerts.length}</span>
            </div>
            {alerts.length === 0 ? (
                <div className="px-5 py-6 text-sm font-medium text-amber-900/75 dark:text-amber-100/75">{t('audit.noOpenAlerts', { defaultValue: 'No open alerts.' })}</div>
            ) : (
                <div className="divide-y divide-amber-200/70 dark:divide-amber-500/20">
                    {alerts.map((alert) => (
                        <article key={alert.alert_id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <SeverityBadge severity={alert.severity} />
                                    <span className="font-mono text-xs font-bold text-amber-950 dark:text-amber-100">{alert.alert_type}</span>
                                    {alert.event_code ? <span className="rounded-md bg-white/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-slate-950/20 dark:text-amber-100 dark:ring-amber-500/30">{alert.event_code}</span> : null}
                                </div>
                                <p className="mt-2 text-sm font-semibold text-amber-950 dark:text-amber-100">{alert.reason}</p>
                                <p className="mt-1 text-xs text-amber-900/70 dark:text-amber-100/65">
                                    {[alert.actor_name, alert.target_type, alert.target_id, formatDate(alert.created_at, locale)].filter(Boolean).join(' - ')}
                                </p>
                                {alert.evidence ? <pre className="mt-3 max-h-28 overflow-auto rounded-lg bg-white/70 p-3 text-xs leading-5 text-amber-950 dark:bg-slate-950/30 dark:text-amber-50">{JSON.stringify(alert.evidence, null, 2)}</pre> : null}
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                                <button type="button" disabled={reviewing} onClick={() => onResolve(alert.alert_id)} className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">{t('audit.resolve', { defaultValue: 'Resolve' })}</button>
                                <button type="button" disabled={reviewing} onClick={() => onDismiss(alert.alert_id)} className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300 bg-white/70 px-3 text-xs font-bold text-amber-900 transition hover:bg-white disabled:opacity-50 dark:border-amber-500/30 dark:bg-slate-950/20 dark:text-amber-100 dark:hover:bg-slate-950/30">{t('audit.dismiss', { defaultValue: 'Dismiss' })}</button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

const SeverityBadge = ({ severity }) => {
    const value = severity || 'warning';
    const style = value === 'critical'
        ? 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/30'
        : 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30';
    return <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ring-inset ${style}`}>{value}</span>;
};

const FilterField = ({ label, icon: Icon, children, wide }) => <label className={`block ${wide ? 'md:col-span-2 xl:col-span-1' : ''}`}><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span><span className="relative block">{Icon ? <Icon size={16} className="pointer-events-none absolute start-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" aria-hidden="true" /> : null}{children}</span></label>;

const AuditCard = ({ log, locale, t, systemLabel, detailsLabel, expanded, onToggle }) => (
    <article className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><CategoryBadge category={log.category} t={t} /><OutcomeBadge outcome={log.outcome} t={t} /><RiskBadge score={log.risk_score} /></div><ActionBadge action={log.event_code || log.action} className="mt-2" /><h3 className="mt-2 truncate font-semibold text-slate-900 dark:text-slate-100">{log.actor_name || log.user_name || systemLabel}</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{log.actor_role || log.user_role || log.actor_type || systemLabel} - {formatDate(log.timestamp, locale)}</p></div>
            <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={detailsLabel} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronDown size={17} className={`transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" /></button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><Detail label={t('audit.resourceTable')} value={log.target_type || log.resource_table || '-'} /><Detail label={t('audit.ip')} value={log.ip_address || '-'} mono /><Detail label={t('audit.resourceId')} value={log.target_id || log.resource_id || '-'} mono wide /><Detail label={t('audit.requestId', { defaultValue: 'Request ID' })} value={log.request_id || '-'} mono wide /></dl>
        {expanded ? <DetailsPanel log={log} label={t('audit.details')} /> : null}
    </article>
);

const AuditRow = ({ log, locale, t, systemLabel, detailsLabel, expanded, onToggle }) => (
    <>
        <tr className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
            <td className="px-5 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">{formatDate(log.timestamp, locale)}</td>
            <td className="px-5 py-4"><p className="font-semibold text-slate-900 dark:text-slate-100">{log.actor_name || log.user_name || systemLabel}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{log.actor_role || log.user_role || log.actor_type || systemLabel}</p></td>
            <td className="px-5 py-4"><CategoryBadge category={log.category} t={t} /></td>
            <td className="px-5 py-4"><ActionBadge action={log.event_code || log.action} /></td>
            <td className="px-5 py-4"><div className="flex flex-wrap gap-1.5"><OutcomeBadge outcome={log.outcome} t={t} /><RiskBadge score={log.risk_score} /></div></td>
            <td className="max-w-[170px] truncate px-5 py-4 font-mono text-xs text-slate-500 dark:text-slate-400" title={log.target_id || log.resource_id || ''}>{log.target_id || log.resource_id || '-'}</td>
            <td className="px-5 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">{log.ip_address || '-'}</td>
            <td className="px-3 py-4"><button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={detailsLabel} className="rounded-lg p-2 text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-cyan-700 dark:hover:text-cyan-400"><ChevronDown size={17} className={`transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" /></button></td>
        </tr>
        {expanded ? <tr><td colSpan="8" className="bg-slate-50 dark:bg-slate-900 px-5 py-0 border-y border-slate-100 dark:border-slate-800"><DetailsPanel log={log} label={t('audit.details')} desktop /></td></tr> : null}
    </>
);

const OUTCOME_STYLE = {
    success: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
    failure: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30',
    denied: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
};

const OutcomeBadge = ({ outcome, t }) => {
    const value = outcome || 'success';
    const label = t(`audit.outcome${value.charAt(0).toUpperCase()}${value.slice(1)}`, { defaultValue: value });
    return <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${OUTCOME_STYLE[value] || OUTCOME_STYLE.success}`}>{label}</span>;
};

const CategoryBadge = ({ category, t }) => {
    if (!category) return <span className="text-xs text-slate-400">-</span>;
    return <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{t(`audit.cat${category}`, { defaultValue: category })}</span>;
};

const ActionBadge = ({ action, className = '' }) => <span className={`inline-flex max-w-full rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 ${className}`}>{action || 'UNKNOWN'}</span>;
const RiskBadge = ({ score }) => {
    const value = Number(score || 0);
    if (!value) return null;
    const style = value >= 85
        ? 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30'
        : 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30';
    return <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${style}`}>R{value}</span>;
};
const Detail = ({ label, value, mono, wide }) => <div className={wide ? 'col-span-2' : ''}><dt className="font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt><dd className={`mt-1 truncate text-slate-700 dark:text-slate-300 ${mono ? 'font-mono' : 'font-semibold'}`} title={String(value)}>{value}</dd></div>;
const DetailsPanel = ({ log, label, desktop }) => {
    const details = {
        details: log.details || {},
        changedFields: log.changed_fields || undefined,
        previousValue: log.previous_value || undefined,
        newValue: log.new_value || undefined,
        metadata: log.metadata || undefined,
        riskReason: log.risk_reason || undefined,
        requestId: log.request_id || undefined,
        sourceSystem: log.source_system || undefined,
        userAgent: log.user_agent || undefined,
    };
    return <div className={`${desktop ? 'my-4' : 'mt-4'} rounded-xl border border-slate-200/60 bg-slate-950 p-4 dark:border-slate-850/60`}><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{label}</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-slate-200">{JSON.stringify(details, null, 2)}</pre></div>;
};
const AuditLoading = ({ label }) => <div className="space-y-3 p-5" aria-label={label}>{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>;
const AuditError = ({ label, retry, onRetry }) => <div role="alert" className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><AlertTriangle size={30} className="text-rose-500" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">{label}</p><button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={15} aria-hidden="true" />{retry}</button></div>;
const AuditEmpty = ({ title, description }) => <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><span className="rounded-lg bg-slate-100 p-4 text-slate-400 dark:bg-slate-800"><ShieldCheck size={28} aria-hidden="true" /></span><p className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{title}</p><p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p></div>;

const validDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const formatDate = (value, locale) => validDate(value)?.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) || '-';

export default AuditLogs;
