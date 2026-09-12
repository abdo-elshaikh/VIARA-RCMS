import { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    ArrowUpDown,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock,
    Copy,
    Download,
    Eye,
    FileCode,
    FileJson,
    Filter,
    FilterX,
    Key,
    Layers,
    Lock,
    Maximize2,
    Radio,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
    Sparkles,
    User,
    X
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
import Pagination from '../components/ui/Pagination';
import { getEffectivePermissions } from '../utils/effectivePermissions';

const PAGE_SIZE = 25;
const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
    endDate: ''
};

const CATEGORIES = ['AUTH', 'RBAC', 'PHI_ACCESS', 'PRIVACY', 'BILLING', 'CONFIG', 'DATA_WRITE', 'SECURITY'];
const OUTCOMES = ['success', 'failure', 'denied'];
const ACTOR_TYPES = ['USER', 'SYSTEM', 'PATIENT', 'API_TOKEN', 'INTEGRATION'];

const AuditLogs = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('admin');
    const token = useSelector((state) => state.auth?.token);
    const currentUser = useSelector((state) => state.auth?.user);
    const searchInputRef = useRef(null);

    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [expandedId, setExpandedId] = useState(null);
    const [inspectingLog, setInspectingLog] = useState(null);
    const [mounted, setMounted] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [quickTab, setQuickTab] = useState('all');

    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyChain, verifyState] = useLazyVerifyAuditChainQuery();
    const [runDetections, detectionState] = useRunAuditDetectionsMutation();
    const [reviewAlert, reviewAlertState] = useReviewAuditAlertMutation();

    const { data: alertData, isLoading: alertsLoading, isError: alertsError, refetch: refetchAlerts } = useGetAuditAlertsQuery({ status: 'open', limit: 8 });
    const permissions = getEffectivePermissions(currentUser);
    const elevatedRole = ['Admin', 'Developer'].includes(currentUser?.role);
    const canExportAudit = elevatedRole || permissions.has('EXPORT_AUDIT_TRAILS');
    const canVerifyAudit = elevatedRole || permissions.has('VERIFY_AUDIT_CHAIN');
    const canRunDetections = elevatedRole || permissions.has('RUN_AUDIT_DETECTIONS');
    const canReviewAlerts = elevatedRole || permissions.has('REVIEW_AUDIT_ALERTS');

    useEffect(() => { setMounted(true); }, []);

    // Ctrl + F search shortcut
    useEffect(() => {
        const handleKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                    event.preventDefault();
                    searchInputRef.current?.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-500 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100`,
        style: { transitionDelay: `${delay}ms` },
    });

    const activeParams = useMemo(() => Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
    ), [filters]);

    const params = { ...activeParams, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
    const { data, isLoading, isFetching, isError, refetch } = useGetAuditLogsQuery(params);

    // Auto-refresh interval (every 15 seconds)
    useEffect(() => {
        if (!autoRefresh) return undefined;
        const interval = setInterval(() => {
            refetch();
            refetchAlerts();
        }, 15000);
        return () => clearInterval(interval);
    }, [autoRefresh, refetch, refetchAlerts]);

    const logs = useMemo(() => (Array.isArray(data?.logs) ? data.logs : []), [data?.logs]);
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
        setQuickTab('all');
        setPage(1);
        setExpandedId(null);
    };

    const handleQuickTabSelect = (tabKey) => {
        setQuickTab(tabKey);
        setPage(1);
        if (tabKey === 'all') {
            setFilters(EMPTY_FILTERS);
        } else if (tabKey === 'risky') {
            setFilters({ ...EMPTY_FILTERS, minRisk: '50' });
        } else if (tabKey === 'auth') {
            setFilters({ ...EMPTY_FILTERS, category: 'AUTH' });
        } else if (tabKey === 'phi') {
            setFilters({ ...EMPTY_FILTERS, category: 'PHI_ACCESS' });
        } else if (tabKey === 'failures') {
            setFilters({ ...EMPTY_FILTERS, outcome: 'failure' });
        }
    };

    const applyDatePreset = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setFilters((current) => ({
            ...current,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        }));
        setPage(1);
    };

    const handleExportCsv = async () => {
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
            toast.success(t('audit.exportAllDone', { defaultValue: 'Audit CSV trail exported successfully.' }));
        } catch {
            toast.error(t('audit.exportError', { defaultValue: 'Failed to export audit logs.' }));
        } finally {
            setExporting(false);
        }
    };

    const handleExportJson = () => {
        const jsonStr = JSON.stringify(logs, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit_stream_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success(t('audit.exportJsonDone', { defaultValue: 'Exported active page to JSON.' }));
    };

    const handleVerify = async () => {
        try {
            const result = await verifyChain().unwrap();
            setVerifyResult(result);
            if (result.ok) {
                toast.success(t('audit.verifyOkToast', { defaultValue: `Audit hash chain verified (${result.checkedCount} blocks)` }));
            } else {
                toast.error(t('audit.verifyBrokenToast', { defaultValue: 'Audit chain integrity mismatch detected!' }));
            }
        } catch {
            toast.error(t('audit.verifyError', { defaultValue: 'Audit chain verification failed.' }));
        }
    };

    const handleDetect = async () => {
        try {
            const result = await runDetections({}).unwrap();
            toast.success(t('audit.detectDone', {
                defaultValue: `Detection scan complete: ${result.totalCreated || 0} alert(s) generated.`,
                count: Number(result.totalCreated || 0),
            }));
            refetch();
            refetchAlerts();
        } catch {
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
        } catch {
            toast.error(t('audit.alertReviewError', { defaultValue: 'Could not update alert.' }));
        }
    };

    const copyJsonPayload = (log) => {
        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
        setCopiedId(log.log_id);
        toast.success(t('audit.copied', { defaultValue: 'Log payload copied to clipboard.' }));
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Category distribution calculations
    const categoryStats = useMemo(() => {
        if (!logs.length) return [];
        const counts = logs.reduce((acc, log) => {
            const cat = log.category || 'OTHER';
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([cat, count]) => ({
            cat,
            count,
            percent: Math.round((count / logs.length) * 100)
        })).sort((a, b) => b.count - a.count);
    }, [logs]);

    const autoRefreshButton = (
        <button
            type="button"
            onClick={() => {
                setAutoRefresh((prev) => !prev);
                toast.success(!autoRefresh
                    ? t('audit.livePollingActive', { defaultValue: 'Live audit polling active (15s)' })
                    : t('audit.livePollingPaused', { defaultValue: 'Live polling paused' }));
            }}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                autoRefresh
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
            }`}
        >
            <Radio size={14} className={autoRefresh ? 'text-emerald-600 animate-pulse' : 'text-slate-400'} />
            {autoRefresh
                ? t('audit.livePolling', { defaultValue: 'Live Polling' })
                : t('audit.autoRefreshOff', { defaultValue: 'Auto-Refresh Off' })}
        </button>
    );

    const exportCsvButton = (
        <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting || !total}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
            {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {t('audit.exportAll', { defaultValue: 'CSV' })}
        </button>
    );

    const exportJsonButton = (
        <button
            type="button"
            onClick={handleExportJson}
            disabled={!logs.length}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
            <FileJson size={14} />
            JSON
        </button>
    );

    const verifyButton = (
        <button
            type="button"
            onClick={handleVerify}
            disabled={verifyState.isFetching}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
            {verifyState.isFetching ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />}
            {verifyState.isFetching ? t('audit.verifying', { defaultValue: 'Verifying Hash Chain...' }) : t('audit.verify', { defaultValue: 'Verify Hash Chain' })}
        </button>
    );

    const detectButton = (
        <button
            type="button"
            onClick={handleDetect}
            disabled={detectionState.isLoading}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 text-xs font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-40 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
        >
            {detectionState.isLoading ? <RefreshCw size={14} className="animate-spin" /> : <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400" />}
            {detectionState.isLoading ? t('audit.detecting', { defaultValue: 'Scanning...' }) : t('audit.detect', { defaultValue: 'Run Anomaly Scan' })}
        </button>
    );

    return (
        <main className={embedded ? 'space-y-5' : 'mx-auto max-w-[1600px] space-y-6 pb-28'}>
            {embedded ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <ShieldCheck size={18} />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {t('audit.title', { defaultValue: 'Compliance Audit Stream' })}
                            </h3>
                            <p className="text-[11px] font-semibold text-slate-400">
                                Cryptographic audit trail · Real-time event monitoring
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {autoRefreshButton}
                        {canRunDetections ? detectButton : null}
                        {canVerifyAudit ? verifyButton : null}
                        {canExportAudit ? exportJsonButton : null}
                        {canExportAudit ? exportCsvButton : null}
                    </div>
                </div>
            ) : (
                <PageHeader
                    icon={ShieldCheck}
                    eyebrow={t('audit.eyebrow', { defaultValue: 'Security & Compliance Auditing' })}
                    title={t('audit.title', { defaultValue: 'Audit Trail & Event Stream' })}
                    description={t('audit.description', { defaultValue: 'Tamper-evident audit trail capturing user access, PHI queries, role modifications, and system security events.' })}
                    actions={(
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                            {autoRefreshButton}
                            {canRunDetections ? detectButton : null}
                            {canVerifyAudit ? verifyButton : null}
                            {canExportAudit ? exportJsonButton : null}
                            {canExportAudit ? exportCsvButton : null}
                        </div>
                    )}
                    metrics={[
                        { key: 'events', icon: Activity, label: t('audit.matchingEvents', { defaultValue: 'Matching Events' }), value: total.toLocaleString(locale), detail: t('audit.serverTotal', { defaultValue: 'Filtered result set' }), tone: 'teal', loading: isLoading, error: isError },
                        { key: 'failures', icon: ShieldAlert, label: t('audit.failures', { defaultValue: 'Failed Events' }), value: Number(serverSummary.failures || 0).toLocaleString(locale), tone: serverSummary.failures ? 'rose' : 'emerald', loading: isLoading, error: isError },
                        { key: 'denied', icon: ShieldX, label: t('audit.denied', { defaultValue: 'Access Denied' }), value: Number(serverSummary.denied || 0).toLocaleString(locale), tone: serverSummary.denied ? 'amber' : 'emerald', loading: isLoading, error: isError },
                        { key: 'phi', icon: Eye, label: t('audit.phiAccess', { defaultValue: 'PHI Views' }), value: Number(serverSummary.phiAccess || 0).toLocaleString(locale), tone: 'blue', loading: isLoading, error: isError },
                        { key: 'risk', icon: AlertTriangle, label: t('audit.risky', { defaultValue: 'High Risk' }), value: Number(serverSummary.risky || 0).toLocaleString(locale), tone: serverSummary.risky ? 'rose' : 'emerald', loading: isLoading, error: isError },
                    ]}
                    metricsLabel={t('audit.summary')}
                />
            )}

            {/* Cryptographic Chain Integrity Status Banner */}
            {verifyResult ? (
                <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm backdrop-blur-md ${verifyResult.ok && verifyResult.scopeComplete ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200' : verifyResult.ok ? 'border-amber-200 bg-amber-50/90 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200' : 'border-rose-200 bg-rose-50/90 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200'}`}>
                    {verifyResult.ok && verifyResult.scopeComplete ? <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : verifyResult.ok ? <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" /> : <ShieldX size={20} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />}
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold sm:text-sm">
                            {verifyResult.ok
                                ? t('audit.verifyOk', { count: verifyResult.checkedCount, defaultValue: `Audit chain verified cleanly: ${verifyResult.checkedCount || 0} block hashes intact.` })
                                : t('audit.verifyBroken', { id: verifyResult.firstBrokenLogId, defaultValue: `Integrity check failed at log block ID #${verifyResult.firstBrokenLogId}!` })}
                        </p>
                        {verifyResult.note ? <p className="mt-0.5 text-xs opacity-80">{verifyResult.note}</p> : null}
                    </div>
                    <button type="button" onClick={() => setVerifyResult(null)} className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                        <X size={15} />
                    </button>
                </div>
            ) : null}

            {/* Executive Metrics Overview */}
            <section style={reveal(40).style} className={`grid grid-cols-2 gap-4 lg:grid-cols-6 ${reveal(40).className}`} aria-label={t('audit.summary')}>
                <SummaryCard icon={Activity} label={t('audit.matchingEvents', { defaultValue: 'Matching Events' })} value={isLoading ? '-' : total.toLocaleString(locale)} note={t('audit.serverTotal', { defaultValue: 'Filtered result set' })} />
                <SummaryCard icon={ShieldAlert} label={t('audit.failures', { defaultValue: 'Failed Events' })} value={isLoading ? '-' : Number(serverSummary.failures || 0).toLocaleString(locale)} note={t('audit.serverTotal', { defaultValue: 'All failed operations' })} tone={serverSummary.failures ? 'danger' : 'default'} />
                <SummaryCard icon={ShieldX} label={t('audit.denied', { defaultValue: 'Access Denied' })} value={isLoading ? '-' : Number(serverSummary.denied || 0).toLocaleString(locale)} note={t('audit.serverTotal', { defaultValue: 'Forbidden RBAC checks' })} tone={serverSummary.denied ? 'warning' : 'default'} />
                <SummaryCard icon={Eye} label={t('audit.phiAccess', { defaultValue: 'PHI Views' })} value={isLoading ? '-' : Number(serverSummary.phiAccess || 0).toLocaleString(locale)} note={t('audit.serverTotal', { defaultValue: 'Patient record queries' })} tone="emerald" />
                <SummaryCard icon={AlertTriangle} label={t('audit.risky', { defaultValue: 'High Risk' })} value={isLoading ? '-' : Number(serverSummary.risky || 0).toLocaleString(locale)} note={t('audit.serverTotal', { defaultValue: 'Risk score > 50' })} tone={serverSummary.risky ? 'warning' : 'default'} />
                <SummaryCard icon={Activity} label={t('audit.systemEvents', { defaultValue: 'System Events' })} value={isLoading ? '-' : Number(serverSummary.systemEvents || 0).toLocaleString(locale)} note={t('audit.serverTotal', { defaultValue: 'Automated tasks & API' })} />
            </section>

            {/* Event Category Distribution Visualizer Bar */}
            {categoryStats.length > 0 && (
                <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <Layers size={15} className="text-slate-500" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                                {t('audit.categoryDistribution', { defaultValue: 'Category Distribution in Active Page' })}
                            </h3>
                        </div>
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                            {logs.length} {t('audit.itemsAnalyzed', { defaultValue: 'items analyzed' })}
                        </span>
                    </div>

                    <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        {categoryStats.map((item, idx) => {
                            const colors = [
                                'bg-emerald-500',
                                'bg-cyan-500',
                                'bg-amber-500',
                                'bg-purple-500',
                                'bg-rose-500',
                                'bg-blue-500'
                            ];
                            return (
                                <div
                                    key={item.cat}
                                    className={`${colors[idx % colors.length]} transition-all`}
                                    style={{ width: `${item.percent}%` }}
                                    title={`${item.cat}: ${item.count} (${item.percent}%)`}
                                />
                            );
                        })}
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-3">
                        {categoryStats.map((item, idx) => {
                            const colors = [
                                'bg-emerald-500',
                                'bg-cyan-500',
                                'bg-amber-500',
                                'bg-purple-500',
                                'bg-rose-500',
                                'bg-blue-500'
                            ];
                            return (
                                <div key={item.cat} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                    <span className={`h-2 w-2 rounded-full ${colors[idx % colors.length]}`} />
                                    <span>{item.cat}</span>
                                    <span className="font-mono text-slate-400">({item.percent}%)</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Anomaly & Risk Alerts Drawer */}
            <AlertCenter
                alerts={alertData?.alerts || []}
                total={Number(alertData?.total || 0)}
                loading={alertsLoading}
                error={alertsError}
                onRetry={refetchAlerts}
                reviewing={reviewAlertState.isLoading}
                canReview={canReviewAlerts}
                locale={locale}
                t={t}
                onResolve={(alertId) => handleReviewAlert(alertId, 'resolved')}
                onDismiss={(alertId) => handleReviewAlert(alertId, 'dismissed')}
            />

            {/* Filter Control Center */}
            <section style={reveal(80).style} className={`rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70 ${reveal(80).className}`} aria-labelledby="audit-filter-heading">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:px-5">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Filter size={16} />
                        </span>
                        <div>
                            <h2 id="audit-filter-heading" className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                                {t('audit.filters', { defaultValue: 'Multi-Criteria Filter Engine' })}
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                {t('audit.filtersDescription', { defaultValue: 'Refine by user, PHI patient, action, outcome, or date range' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Quick Date Presets */}
                        <button type="button" onClick={() => applyDatePreset(0)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('audit.today', { defaultValue: 'Today' })}
                        </button>
                        <button type="button" onClick={() => applyDatePreset(7)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('audit.sevenDays', { defaultValue: '7 Days' })}
                        </button>
                        <button type="button" onClick={() => applyDatePreset(30)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('audit.thirtyDays', { defaultValue: '30 Days' })}
                        </button>

                        <button
                            type="button"
                            onClick={resetFilters}
                            disabled={!activeFilters}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <FilterX size={14} />
                            {t('audit.reset', { defaultValue: 'Clear Filters' })} {activeFilters > 0 ? `(${activeFilters})` : ''}
                        </button>
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        <FilterField label={t('audit.search', { defaultValue: 'Fulltext Search' })} icon={Search}>
                            <input
                                ref={searchInputRef}
                                type="search"
                                placeholder={t('audit.searchPlaceholder', { defaultValue: 'Search name, IP, details...' })}
                                className={INPUT}
                                value={filters.q}
                                onChange={(event) => updateFilter('q', event.target.value)}
                            />
                        </FilterField>

                        <FilterField label={t('audit.category', { defaultValue: 'Category' })}>
                            <select className={INPUT} value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
                                <option value="">{t('audit.allCategories', { defaultValue: 'All Categories' })}</option>
                                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{t(`audit.cat${cat}`, { defaultValue: cat })}</option>)}
                            </select>
                        </FilterField>

                        <FilterField label={t('audit.outcome', { defaultValue: 'Outcome' })}>
                            <select className={INPUT} value={filters.outcome} onChange={(event) => updateFilter('outcome', event.target.value)}>
                                <option value="">{t('audit.allOutcomes', { defaultValue: 'All Outcomes' })}</option>
                                {OUTCOMES.map((oc) => <option key={oc} value={oc}>{t(`audit.outcome${oc.charAt(0).toUpperCase()}${oc.slice(1)}`, { defaultValue: oc.toUpperCase() })}</option>)}
                            </select>
                        </FilterField>

                        <FilterField label={t('audit.severity', { defaultValue: 'Min Severity' })}>
                            <select className={INPUT} value={filters.minSeverity} onChange={(event) => updateFilter('minSeverity', event.target.value)}>
                                <option value="">{t('audit.anySeverity', { defaultValue: 'Any Severity' })}</option>
                                <option value="30">{t('audit.sevNotice', { defaultValue: 'Notice (30+)' })}</option>
                                <option value="40">{t('audit.sevWarning', { defaultValue: 'Warning (40+)' })}</option>
                                <option value="50">{t('audit.sevCritical', { defaultValue: 'Critical (50+)' })}</option>
                            </select>
                        </FilterField>

                        <FilterField label={t('audit.actorType', { defaultValue: 'Actor Type' })}>
                            <select className={INPUT} value={filters.actorType} onChange={(event) => updateFilter('actorType', event.target.value)}>
                                <option value="">{t('audit.allActors', { defaultValue: 'All Actor Types' })}</option>
                                {ACTOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </FilterField>

                        <FilterField label={t('audit.eventCode', { defaultValue: 'Event Code' })} icon={Key}>
                            <input
                                type="text"
                                placeholder="PATIENT.UPDATED"
                                className={`${INPUT} font-mono text-xs`}
                                value={filters.eventCode}
                                onChange={(event) => updateFilter('eventCode', event.target.value.trim())}
                            />
                        </FilterField>

                        <FilterField label={t('audit.userId', { defaultValue: 'User UUID' })} icon={User}>
                            <input
                                type="text"
                                placeholder="User UUID..."
                                className={`${INPUT} font-mono text-xs`}
                                value={filters.userId}
                                onChange={(event) => updateFilter('userId', event.target.value.trim())}
                            />
                        </FilterField>

                        <FilterField label={t('audit.patientId', { defaultValue: 'Patient ID' })} icon={User}>
                            <input
                                type="text"
                                placeholder="Patient MRN / UUID..."
                                className={`${INPUT} font-mono text-xs`}
                                value={filters.patientId}
                                onChange={(event) => updateFilter('patientId', event.target.value.trim())}
                            />
                        </FilterField>

                        <FilterField label={t('audit.risk', { defaultValue: 'Risk Score' })}>
                            <select className={INPUT} value={filters.minRisk} onChange={(event) => updateFilter('minRisk', event.target.value)}>
                                <option value="">{t('audit.anyRisk', { defaultValue: 'Any Risk Score' })}</option>
                                <option value="50">{t('audit.riskWarning', { defaultValue: '50+ Moderate Risk' })}</option>
                                <option value="85">{t('audit.riskCritical', { defaultValue: '85+ Critical Risk' })}</option>
                            </select>
                        </FilterField>

                        <FilterField label={t('audit.startDate', { defaultValue: 'Start Date' })} icon={Calendar}>
                            <input
                                type="date"
                                className={`${INPUT} text-xs`}
                                value={filters.startDate}
                                max={filters.endDate || undefined}
                                onChange={(event) => updateFilter('startDate', event.target.value)}
                            />
                        </FilterField>

                        <FilterField label={t('audit.endDate', { defaultValue: 'End Date' })} icon={Calendar}>
                            <input
                                type="date"
                                className={`${INPUT} text-xs`}
                                value={filters.endDate}
                                min={filters.startDate || undefined}
                                onChange={(event) => updateFilter('endDate', event.target.value)}
                            />
                        </FilterField>

                        <FilterField label={t('audit.actionType', { defaultValue: 'Action Pattern' })} icon={Search}>
                            <input
                                type="text"
                                placeholder="e.g. LOGIN, UPDATE"
                                className={`${INPUT} text-xs`}
                                value={filters.action}
                                onChange={(event) => updateFilter('action', event.target.value)}
                            />
                        </FilterField>
                    </div>

                    {/* Active Filter Chips */}
                    {activeFilters > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Filters:</span>
                            {Object.entries(filters).map(([key, val]) => {
                                if (!val) return null;
                                return (
                                    <span key={key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                        <span className="text-slate-400">{key}:</span>
                                        <span>{val}</span>
                                        <button type="button" onClick={() => updateFilter(key, '')} className="text-slate-400 hover:text-slate-700">
                                            <X size={10} />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Event Stream & Quick Tabs */}
            <section style={reveal(120).style} className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70 ${reveal(120).className}`} aria-labelledby="audit-results-heading">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 id="audit-results-heading" className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                            {t('audit.eventStream', { defaultValue: 'Audit Event Stream' })}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {t('audit.showingRange', {
                                start: total ? (page - 1) * PAGE_SIZE + 1 : 0,
                                end: Math.min(page * PAGE_SIZE, total),
                                total,
                                defaultValue: `Showing ${total ? (page - 1) * PAGE_SIZE + 1 : 0}-${Math.min(page * PAGE_SIZE, total)} of ${total} events`
                            })}
                        </p>
                    </div>

                    {/* Quick Filter Stream Tabs */}
                    <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        <QuickStreamTab label={t('audit.quickTabs.all', { defaultValue: 'All Stream' })} active={quickTab === 'all'} onClick={() => handleQuickTabSelect('all')} />
                        <QuickStreamTab label={t('audit.quickTabs.risky', { defaultValue: 'High Risk (50+)' })} active={quickTab === 'risky'} onClick={() => handleQuickTabSelect('risky')} />
                        <QuickStreamTab label={t('audit.quickTabs.auth', { defaultValue: 'Auth & Login' })} active={quickTab === 'auth'} onClick={() => handleQuickTabSelect('auth')} />
                        <QuickStreamTab label={t('audit.quickTabs.phi', { defaultValue: 'PHI Queries' })} active={quickTab === 'phi'} onClick={() => handleQuickTabSelect('phi')} />
                        <QuickStreamTab label={t('audit.quickTabs.failures', { defaultValue: 'Failures' })} active={quickTab === 'failures'} onClick={() => handleQuickTabSelect('failures')} />
                    </div>
                </div>

                {isLoading ? (
                    <AuditLoading label={t('audit.loading', { defaultValue: 'Loading audit logs...' })} />
                ) : isError ? (
                    <AuditError label={t('audit.loadError', { defaultValue: 'Failed to load audit logs.' })} retry={t('audit.retry', { defaultValue: 'Retry' })} onRetry={refetch} />
                ) : logs.length === 0 ? (
                    <AuditEmpty title={t('audit.empty', { defaultValue: 'No Audit Records Found' })} description={activeFilters ? t('audit.emptyFiltered', { defaultValue: 'No audit records match your current filters. Try resetting search filters.' }) : t('audit.emptyDefault', { defaultValue: 'No system audit logs recorded.' })} />
                ) : (
                    <>
                        {/* Mobile View Cards */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
                            {logs.map((log) => (
                                <AuditCard
                                    key={log.log_id}
                                    log={log}
                                    locale={locale}
                                    t={t}
                                    systemLabel={t('audit.system', { defaultValue: 'SYSTEM' })}
                                    detailsLabel={t('audit.details', { defaultValue: 'View Details' })}
                                    expanded={expandedId === log.log_id}
                                    copiedId={copiedId}
                                    onCopy={() => copyJsonPayload(log)}
                                    onInspect={() => setInspectingLog(log)}
                                    onToggle={() => setExpandedId((id) => (id === log.log_id ? null : log.log_id))}
                                />
                            ))}
                        </div>

                        {/* Desktop View Table */}
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="w-full min-w-[1100px] text-start text-xs">
                                <thead className="border-b border-slate-100 bg-slate-50/70 font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500">
                                    <tr>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.timestamp', { defaultValue: 'Timestamp' })}</th>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.user', { defaultValue: 'Actor' })}</th>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.category', { defaultValue: 'Category' })}</th>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.action', { defaultValue: 'Event Action' })}</th>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.outcome', { defaultValue: 'Outcome & Risk' })}</th>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.resourceId', { defaultValue: 'Target / Ref' })}</th>
                                        <th scope="col" className="px-4 py-3 text-start">{t('audit.ip', { defaultValue: 'IP Address' })}</th>
                                        <th scope="col" className="w-20 px-3 py-3 text-center"><span className="sr-only">{t('audit.details', { defaultValue: 'Actions' })}</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {logs.map((log) => (
                                        <AuditRow
                                            key={log.log_id}
                                            log={log}
                                            locale={locale}
                                            t={t}
                                            systemLabel={t('audit.system', { defaultValue: 'SYSTEM' })}
                                            detailsLabel={t('audit.details', { defaultValue: 'Toggle Payload' })}
                                            expanded={expandedId === log.log_id}
                                            copiedId={copiedId}
                                            onCopy={() => copyJsonPayload(log)}
                                            onInspect={() => setInspectingLog(log)}
                                            onToggle={() => setExpandedId((id) => (id === log.log_id ? null : log.log_id))}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Pagination Toolbar */}
                {!isLoading && !isError && total > 0 ? (
                    <Pagination
                        currentPage={page}
                        pageCount={pageCount}
                        onPageChange={setPage}
                        isRtl={i18n.language?.startsWith('ar')}
                        ariaLabel={t('audit.pagination')}
                        className="border-t border-slate-100 px-4 dark:border-slate-800 sm:px-6"
                    />
                ) : null}
            </section>

            {/* Event Detail Fullscreen Inspector Modal */}
            {inspectingLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 p-4">
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
                                    <ShieldCheck size={16} />
                                </span>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                                        {t('audit.inspector.title', { id: inspectingLog.log_id, defaultValue: `Cryptographic Audit Entry #${inspectingLog.log_id}` })}
                                    </h3>
                                    <p className="font-mono text-xs text-slate-400">{formatDate(inspectingLog.timestamp, locale)}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => copyJsonPayload(inspectingLog)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800">
                                    {copiedId === inspectingLog.log_id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                    <span>{t('audit.inspector.copyJson', { defaultValue: 'Copy JSON' })}</span>
                                </button>
                                <button type="button" onClick={() => setInspectingLog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        {t('audit.inspector.actor', { defaultValue: 'Actor' })}
                                    </span>
                                    <p className="mt-1 font-bold text-white text-xs">{inspectingLog.actor_name || inspectingLog.user_name || 'SYSTEM'}</p>
                                    <p className="font-mono text-[10px] text-slate-400">{inspectingLog.actor_role || inspectingLog.actor_type || '-'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        {t('audit.inspector.categoryAndAction', { defaultValue: 'Category & Action' })}
                                    </span>
                                    <p className="mt-1 font-mono font-bold text-emerald-400 text-xs">{inspectingLog.category || '-'}</p>
                                    <p className="font-mono text-[10px] text-slate-300">{inspectingLog.event_code || inspectingLog.action}</p>
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        {t('audit.inspector.ipAndRequestId', { defaultValue: 'IP & Request ID' })}
                                    </span>
                                    <p className="mt-1 font-mono text-xs text-white">{inspectingLog.ip_address || '-'}</p>
                                    <p className="truncate font-mono text-[10px] text-slate-400">{inspectingLog.request_id || '-'}</p>
                                </div>
                            </div>

                            {/* Changed fields diff box */}
                            {(inspectingLog.previous_value || inspectingLog.new_value) && (
                                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                        {t('audit.inspector.stateDiff', { defaultValue: 'State Modification Diff' })}
                                    </span>
                                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-lg bg-slate-900 p-3">
                                            <span className="text-[10px] font-bold text-rose-400">
                                                {t('audit.inspector.previousState', { defaultValue: '- Previous State' })}
                                            </span>
                                            <pre className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-rose-200">{JSON.stringify(inspectingLog.previous_value, null, 2)}</pre>
                                        </div>
                                        <div className="rounded-lg bg-slate-900 p-3">
                                            <span className="text-[10px] font-bold text-emerald-400">
                                                {t('audit.inspector.newState', { defaultValue: '+ New State' })}
                                            </span>
                                            <pre className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-emerald-200">{JSON.stringify(inspectingLog.new_value, null, 2)}</pre>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('audit.inspector.rawObject', { defaultValue: 'Full Raw Log Entry Object' })}
                                </span>
                                <pre className="max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-200">{JSON.stringify(inspectingLog, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};

const QuickStreamTab = ({ label, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold transition-all ${
            active
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
        }`}
    >
        {label}
    </button>
);

const INPUT = 'input-field h-9 w-full text-xs font-semibold';

const TONE_ICON = {
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    default: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};

const SummaryCard = ({ icon: Icon, label, value, note, tone = 'default' }) => (
    <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${TONE_ICON[tone] || TONE_ICON.default}`}>
                <Icon size={16} aria-hidden="true" />
            </span>
        </div>
        <p className="mt-2 text-2xl font-black tabular-nums leading-none text-slate-900 dark:text-white">{value}</p>
        <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{note}</p>
    </article>
);

const AlertCenter = ({ alerts, total, loading, error, onRetry, reviewing, canReview, locale, t, onResolve, onDismiss }) => {
    if (loading) {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </section>
        );
    }

    if (error) {
        return (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                <div className="flex items-center justify-between gap-3">
                    <span>{t('audit.alertLoadError', { defaultValue: 'Security alerts could not be loaded.' })}</span>
                    <button type="button" onClick={onRetry} className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-bold dark:border-rose-800">
                        {t('audit.retry', { defaultValue: 'Retry' })}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/70 shadow-sm backdrop-blur-xl dark:border-amber-900/40 dark:bg-amber-950/30" aria-labelledby="audit-alerts-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/70 p-4 dark:border-amber-900/40">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        <ShieldAlert size={16} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 id="audit-alerts-heading" className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-100">
                            {t('audit.alertCenter', { defaultValue: 'Security & Anomaly Detection Center' })}
                        </h2>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-200/70">
                            {t('audit.alertCenterHint', { defaultValue: 'Review AI detection results and rule flags before closing security investigations.' })}
                        </p>
                    </div>
                </div>
                <span className="rounded-full border border-amber-300 bg-white px-3 py-0.5 font-mono text-xs font-black text-amber-900 shadow-sm dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200">
                    {total} Open
                </span>
            </div>

            {alerts.length === 0 ? (
                <div className="p-5 text-xs font-bold text-amber-900/75 dark:text-amber-200/75">
                    {t('audit.noOpenAlerts', { defaultValue: 'No active security anomaly alerts.' })}
                </div>
            ) : (
                <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
                    {alerts.map((alert) => (
                        <article key={alert.alert_id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <SeverityBadge severity={alert.severity} />
                                    <span className="font-mono text-xs font-bold text-amber-950 dark:text-amber-100">{alert.alert_type}</span>
                                    {alert.event_code ? <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-900 ring-1 ring-amber-200 dark:bg-slate-900 dark:text-amber-200 dark:ring-amber-800">{alert.event_code}</span> : null}
                                </div>
                                <p className="mt-2 text-xs font-bold text-amber-950 dark:text-amber-100 sm:text-sm">{alert.reason}</p>
                                <p className="mt-1 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/70">
                                    {[alert.actor_name, alert.target_type, alert.target_id, formatDate(alert.created_at, locale)].filter(Boolean).join(' · ')}
                                </p>
                                {alert.evidence ? <pre className="mt-2.5 max-h-28 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] font-mono leading-relaxed text-slate-200">{JSON.stringify(alert.evidence, null, 2)}</pre> : null}
                            </div>
                            {canReview ? <div className="flex flex-wrap gap-2 lg:justify-end">
                                <button
                                    type="button"
                                    disabled={reviewing}
                                    onClick={() => onResolve(alert.alert_id)}
                                    className="inline-flex h-8 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950"
                                >
                                    {t('audit.resolve', { defaultValue: 'Resolve Alert' })}
                                </button>
                                <button
                                    type="button"
                                    disabled={reviewing}
                                    onClick={() => onDismiss(alert.alert_id)}
                                    className="inline-flex h-8 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                                >
                                    {t('audit.dismiss', { defaultValue: 'Dismiss' })}
                                </button>
                            </div> : null}
                        </article>
                    ))}
                </div>
            )}
            {total > alerts.length ? (
                <p className="border-t border-amber-200/70 px-4 py-2 text-[11px] font-semibold text-amber-900/70 dark:border-amber-900/40 dark:text-amber-200/70">
                    {t('audit.alertsShowingFirst', { count: alerts.length, total, defaultValue: `Showing the first ${alerts.length} of ${total} open alerts.` })}
                </p>
            ) : null}
        </section>
    );
};

const SeverityBadge = ({ severity }) => {
    const value = severity || 'warning';
    const style = value === 'critical'
        ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
        : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${style}`}>{value}</span>;
};

const FilterField = ({ label, icon: Icon, children }) => (
    <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <div className="relative">
            {Icon ? <Icon size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /> : null}
            {children}
        </div>
    </label>
);

const AuditCard = ({ log, locale, t, systemLabel, detailsLabel, expanded, copiedId, onCopy, onInspect, onToggle }) => (
    <article className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={log.category} t={t} />
                    <OutcomeBadge outcome={log.outcome} t={t} />
                    <RiskBadge score={log.risk_score} />
                </div>
                <ActionBadge action={log.event_code || log.action} className="mt-2" />
                <h3 className="mt-2 truncate font-bold text-slate-900 dark:text-white text-sm">{log.actor_name || log.user_name || systemLabel}</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{log.actor_role || log.user_role || log.actor_type || systemLabel} · {formatDate(log.timestamp, locale)}</p>
            </div>
            <div className="flex items-center gap-1">
                <button type="button" onClick={onInspect} title="Inspect Full Event" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                    <Maximize2 size={15} />
                </button>
                <button type="button" onClick={onCopy} title="Copy JSON payload" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                    {copiedId === log.log_id ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
                <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={detailsLabel} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                    <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            </div>
        </div>
        <dl className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
            <Detail label={t('audit.resourceTable', { defaultValue: 'Target' })} value={log.target_type || log.resource_table || '-'} />
            <Detail label={t('audit.ip', { defaultValue: 'IP Address' })} value={log.ip_address || '-'} mono />
            <Detail label={t('audit.resourceId', { defaultValue: 'Ref ID' })} value={log.target_id || log.resource_id || '-'} mono wide />
        </dl>
        {expanded ? <DetailsPanel log={log} label={t('audit.details', { defaultValue: 'Full Event Payload' })} t={t} /> : null}
    </article>
);

const AuditRow = ({ log, locale, t, systemLabel, detailsLabel, expanded, copiedId, onCopy, onInspect, onToggle }) => (
    <>
        <tr className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
            <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(log.timestamp, locale)}</td>
            <td className="px-4 py-3">
                <p className="font-bold text-slate-900 dark:text-slate-100">{log.actor_name || log.user_name || systemLabel}</p>
                <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500">{log.actor_role || log.user_role || log.actor_type || systemLabel}</p>
            </td>
            <td className="px-4 py-3"><CategoryBadge category={log.category} t={t} /></td>
            <td className="px-4 py-3"><ActionBadge action={log.event_code || log.action} /></td>
            <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                    <OutcomeBadge outcome={log.outcome} t={t} />
                    <RiskBadge score={log.risk_score} />
                </div>
            </td>
            <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-400" title={log.target_id || log.resource_id || ''}>{log.target_id || log.resource_id || '-'}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.ip_address || '-'}</td>
            <td className="px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                    <button type="button" onClick={onInspect} title="Inspect Full Event Modal" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        <Maximize2 size={14} />
                    </button>
                    <button type="button" onClick={onCopy} title="Copy JSON Payload" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        {copiedId === log.log_id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                    <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={detailsLabel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                        <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </td>
        </tr>
        {expanded ? (
            <tr>
                <td colSpan="8" className="bg-slate-950 p-4 border-y border-slate-800">
                    <DetailsPanel log={log} label={t('audit.details', { defaultValue: 'Cryptographic Log Entry Payload' })} t={t} />
                </td>
            </tr>
        ) : null}
    </>
);

const OUTCOME_STYLE = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    failure: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    denied: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
};

const OutcomeBadge = ({ outcome, t }) => {
    const value = outcome || 'success';
    const label = t(`audit.outcome${value.charAt(0).toUpperCase()}${value.slice(1)}`, { defaultValue: value.toUpperCase() });
    return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${OUTCOME_STYLE[value] || OUTCOME_STYLE.success}`}>{label}</span>;
};

const CategoryBadge = ({ category, t }) => {
    if (!category) return <span className="text-xs text-slate-400">-</span>;
    return <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{t(`audit.cat${category}`, { defaultValue: category })}</span>;
};

const ActionBadge = ({ action, className = '' }) => <span className={`inline-flex max-w-full rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${className}`}>{action || 'UNKNOWN'}</span>;

const RiskBadge = ({ score }) => {
    const value = Number(score || 0);
    if (!value) return null;
    const style = value >= 85
        ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
        : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-black tracking-wider ${style}`}>R{value}</span>;
};

const Detail = ({ label, value, mono, wide }) => (
    <div className={wide ? 'col-span-2' : ''}>
        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
        <dd className={`mt-0.5 truncate text-slate-800 dark:text-slate-200 ${mono ? 'font-mono text-xs' : 'font-bold'}`} title={String(value)}>{value}</dd>
    </div>
);

const DetailsPanel = ({ log, label, t }) => {
    const jsonStr = JSON.stringify(log.details || {}, null, 2);
    const hasRedaction = jsonStr.includes('[REDACTED]');

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

    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                <div className="flex items-center gap-2">
                    {hasRedaction && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[9.5px] font-bold text-teal-300">
                            <Lock size={10} />
                            <span>{t ? t('audit.inspector.hipaaRedacted', { defaultValue: 'HIPAA/GDPR Redacted' }) : 'HIPAA/GDPR Redacted'}</span>
                        </span>
                    )}
                    <span className="font-mono text-[10px] text-slate-400">ID #{log.log_id}</span>
                </div>
            </div>

            {/* Direct 1-Click Resource Navigation Links */}
            {(log.patient_id || log.exam_id || log.invoice_id || log.appointment_id) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {t ? t('audit.inspector.quickLinks', { defaultValue: 'Quick Links:' }) : 'Quick Links:'}
                    </span>
                    {log.patient_id && (
                        <Link
                            to={`/patients?patientId=${log.patient_id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-600/30 border border-teal-500/40 px-2.5 py-1 text-[10.5px] font-bold text-teal-200 hover:bg-teal-600/50 transition"
                        >
                            <span>{t ? t('audit.inspector.patient', { defaultValue: 'Patient' }) : 'Patient'} #{String(log.patient_id).slice(0, 8)}...</span>
                        </Link>
                    )}
                    {log.exam_id && (
                        <Link
                            to={`/worklist?examId=${log.exam_id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600/30 border border-cyan-500/40 px-2.5 py-1 text-[10.5px] font-bold text-cyan-200 hover:bg-cyan-600/50 transition"
                        >
                            <span>{t ? t('audit.inspector.examStudy', { defaultValue: 'Exam Study' }) : 'Exam Study'}</span>
                        </Link>
                    )}
                    {log.invoice_id && (
                        <Link
                            to={`/reception?tab=cashier&invoiceId=${log.invoice_id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600/30 border border-amber-500/40 px-2.5 py-1 text-[10.5px] font-bold text-amber-200 hover:bg-amber-600/50 transition"
                        >
                            <span>{t ? t('audit.inspector.invoice', { defaultValue: 'Invoice' }) : 'Invoice'}</span>
                        </Link>
                    )}
                    {log.appointment_id && (
                        <Link
                            to={`/appointments?appointmentId=${log.appointment_id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-sky-600/30 border border-sky-500/40 px-2.5 py-1 text-[10.5px] font-bold text-sky-200 hover:bg-sky-600/50 transition"
                        >
                            <span>{t ? t('audit.inspector.appointment', { defaultValue: 'Appointment' }) : 'Appointment'}</span>
                        </Link>
                    )}
                </div>
            )}

            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-300 rounded-xl bg-slate-900/80 p-3 border border-slate-800/80">
                {JSON.stringify(details, null, 2)}
            </pre>
        </div>
    );
};

const AuditLoading = ({ label }) => (
    <div className="space-y-3 p-5" aria-label={label}>
        {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
    </div>
);

const AuditError = ({ label, retry, onRetry }) => (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <AlertTriangle size={32} className="text-rose-500" aria-hidden="true" />
        <p className="mt-3 font-bold text-slate-800 dark:text-slate-100">{label}</p>
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-md dark:bg-white dark:text-slate-950">
            <RefreshCw size={14} aria-hidden="true" />
            {retry}
        </button>
    </div>
);

const AuditEmpty = ({ title, description }) => (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <ShieldCheck size={26} aria-hidden="true" />
        </span>
        <p className="mt-4 font-bold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
);

const validDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const formatDate = (value, locale) => validDate(value)?.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) || '-';

export default AuditLogs;
