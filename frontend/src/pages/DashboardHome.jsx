import React, { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    Activity, AlertTriangle, ArrowUpRight, CalendarCheck2, CalendarDays,
    CheckCircle2, CircleDollarSign, ClipboardList, Clock3, FileSearch, Gauge,
    LayoutDashboard, ListChecks, Package, RefreshCw, ShieldCheck,
    ScanLine, Stethoscope, UserPlus, UsersRound, WalletCards, ChevronRight,
    Zap, Sparkles, UserRound, ArrowRight, Search, Radio, Monitor, Check, Filter
} from 'lucide-react';
import { selectCurrentUser } from '../store/authSlice';
import { selectPreferences } from '../store/preferencesSlice';
import { useGetDashboardStatsQuery } from '../store/api';
import { formatDuration } from '../utils/dateFormat';
import { AccessibleChartData, PageHeader, PagePanel } from '../components/ui';
import { canAccessRoute } from '../config/routes';
import { getEffectivePermissions } from '../utils/effectivePermissions';

const chartTooltipStyle = {
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(51, 65, 85, 0.6)',
    borderRadius: '16px',
    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.4)',
    fontSize: '12px',
    fontWeight: '700',
    padding: '10px 14px',
    color: '#f8fafc'
};

const modalityColors = ['#0ea5e9', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#64748b'];

const toNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const DashboardHome = () => {
    const user = useSelector(selectCurrentUser);
    const preferences = useSelector(selectPreferences);
    const { t, i18n } = useTranslation('dashboard');
    const { data: stats = {}, isLoading, isFetching, isError, error, refetch } = useGetDashboardStatsQuery(undefined, {
        skip: !user, refetchOnMountOrArgChange: true, pollingInterval: 60000,
    });

    if (isLoading) return <DashboardSkeleton />;
    if (isError && Object.keys(stats).length === 0) return <DashboardError error={error} onRetry={refetch} />;

    const shared = {
        user,
        stats,
        isFetching,
        syncError: isError ? error : null,
        refetch,
        language: i18n.language,
        timezone: preferences.timezone,
        t
    };

    if (user?.role === 'Receptionist') return <ReceptionDashboard {...shared} />;
    if (['Cashier', 'Accountant'].includes(user?.role)) return <FinanceDashboard {...shared} />;
    if (user?.role === 'HR') return <HRDashboard {...shared} />;
    if (user?.role === 'Insurance_Staff') return <InsuranceDashboard {...shared} />;
    if (['Radiologist', 'Technician', 'Nurse'].includes(user?.role)) return <ClinicalDashboard {...shared} />;
    return <ExecutiveDashboard {...shared} />;
};

// ─── Dashboard Shell ──────────────────────────────────────────────────

const DashboardShell = ({
    user,
    stats,
    isFetching,
    syncError,
    refetch,
    language,
    timezone,
    eyebrow,
    title,
    subtitle,
    primaryAction,
    metrics = [],
    priorityItems = [],
    showModalities = false,
    showTurnaround = false,
    showPatientSearch = true,
    children
}) => {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const userName = user?.full_name || user?.name || stats.userName || t('common.teamMember');
    const role = t(`roles.${user?.role}`, user?.role || t('roles.Admin'));
    const [searchQuery, setSearchQuery] = useState('');
    const canSearchPatients = showPatientSearch && canAccessRoute('/patients', user);

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        navigate(`/patients?search=${encodeURIComponent(searchQuery.trim())}`);
    };

    return (
        <main className="mx-auto max-w-[var(--VIARA-workspace-max)] space-y-[var(--VIARA-density-section-gap)] pb-12">
            <PageHeader
                icon={LayoutDashboard}
                eyebrowIcon={Sparkles}
                eyebrow={(
                    <>
                        <span>{role}</span>
                        {eyebrow && <span aria-hidden="true">·</span>}
                        {eyebrow && <span>{eyebrow}</span>}
                    </>
                )}
                title={title}
                description={`${t('common.welcome', { name: userName })} — ${subtitle || title}`}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><CalendarDays size={13} className="text-teal-600" />{formatDashboardDate(language, timezone)}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('common.liveData')} · <time dateTime={stats.timestamp}>{formatUpdatedAt(stats.timestamp, language, timezone, t)}</time></span>
                    </div>
                }
                actions={
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {canSearchPatients && (
                            <form onSubmit={handleSearch} className="relative min-w-[220px] flex-1" role="search">
                                <label htmlFor="dashboard-patient-search" className="sr-only">{t('common.patientSearchLabel')}</label>
                                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input id="dashboard-patient-search" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={t('common.patientSearchPlaceholder')} className="min-h-[var(--VIARA-control-min-height)] w-full rounded-xl border border-slate-200 bg-slate-50/80 ps-9 pe-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-950/50 dark:text-white" />
                            </form>
                        )}
                        <button type="button" onClick={refetch} disabled={isFetching} aria-label={isFetching ? t('common.refreshing') : t('common.refresh')} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-teal-500/40 hover:text-teal-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300" title={t('common.refresh')}><RefreshCw size={15} className={isFetching ? 'animate-spin text-teal-500' : ''} /></button>
                        {primaryAction}
                    </div>
                }
                metrics={metrics}
                metricsLabel={t('common.dashboardMetrics', { defaultValue: 'Dashboard record indicators' })}
            />

            {syncError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    <span>{t('error.staleData')}</span>
                    <button type="button" onClick={refetch} className="rounded-xl border border-amber-500/30 px-3 py-1.5 font-bold hover:bg-amber-500/10">{t('error.retry')}</button>
                </div>
            )}

            {/* Operational Priority Cards */}
            <PriorityStrip items={priorityItems} />

            {showModalities && <ModalityLiveDeck modalities={stats.liveModalities} language={language} />}

            {showTurnaround && <TurnaroundPipeline stages={stats.turnaroundStages} language={language} />}

            {/* Main Content Areas */}
            {children}
        </main>
    );
};

// ─── Modality Live Occupancy Deck ─────────────────────────────────────

const ModalityLiveDeck = ({ modalities = [], language }) => {
    const { t } = useTranslation('dashboard');

    return (
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 [padding:var(--VIARA-density-card-padding)] shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90" aria-labelledby="dashboard-modalities-title">
            <div className="flex items-center justify-between gap-4 mb-3.5">
                <div className="flex items-center gap-2">
                    <Radio size={16} className="text-teal-600 dark:text-teal-400 animate-pulse" />
                    <h3 id="dashboard-modalities-title" className="text-sm font-black text-slate-800 dark:text-slate-200">
                        {t('operations.modalitiesTitle')}
                    </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                    {t('operations.measuredStatus')}
                </span>
            </div>

            {modalities.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {modalities.map(m => {
                    const isInUse = m.status === 'in_use';
                    const isReady = m.status === 'ready';
                    const statusTone = isInUse ? 'border-sky-500/30 bg-sky-500/5' : isReady ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5';
                    return (
                        <div
                            key={m.id}
                            className={`flex flex-col justify-between rounded-2xl border p-3.5 transition-all overflow-hidden dark:bg-[var(--VIARA-surface-raised)] ${statusTone}`}
                        >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 shadow-xs ring-1 ring-slate-200/60 dark:ring-slate-700">
                                        {m.type}
                                    </span>
                                    <span className="truncate text-xs font-black text-slate-900 dark:text-white" title={m.name}>
                                        {m.name}
                                    </span>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase whitespace-nowrap ${
                                    isInUse ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300' : isReady ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isInUse ? 'bg-sky-500' : isReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    <span>{t(`operations.modalityStatus.${m.status}`, { defaultValue: m.equipmentStatus || m.status })}</span>
                                </span>
                            </div>
                            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 min-w-0">
                                <span className="truncate text-slate-500 dark:text-slate-400">{m.equipmentStatus || 'Active'}</span>
                                <span className="shrink-0 font-bold text-slate-500 dark:text-slate-400">{m.elapsedMinutes === null ? t('operations.noActiveExam') : t('operations.elapsed', { duration: formatDashboardDuration(m.elapsedMinutes, language) })}</span>
                            </div>
                        </div>
                    );
                })}
            </div> : <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">{t('operations.noModalities')}</p>}
        </section>
    );
};

// ─── Turnaround SLA Pipeline Gauge ───────────────────────────────────

const TurnaroundPipeline = ({ stages = [], language }) => {
    const { t } = useTranslation('dashboard');
    const measuredStages = stages.filter(stage => stage.sampleSize > 0 && stage.averageMinutes !== null);
    const allWithinTarget = measuredStages.length > 0 && measuredStages.every(stage => stage.withinTarget);

    return (
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 [padding:var(--VIARA-density-card-padding)] shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90" aria-labelledby="dashboard-turnaround-title">
            <div className="flex items-center justify-between gap-4 mb-3.5">
                <div className="flex items-center gap-2">
                    <Clock3 size={16} className="text-teal-600 dark:text-teal-400" />
                    <h3 id="dashboard-turnaround-title" className="text-sm font-black text-slate-800 dark:text-slate-200">
                        {t('operations.turnaroundTitle')}
                    </h3>
                </div>
                {measuredStages.length > 0 && <span className={`inline-flex items-center gap-1 text-xs font-bold ${allWithinTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                    {allWithinTarget ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    <span>{allWithinTarget ? t('operations.withinTargets') : t('operations.targetAttention')}</span>
                </span>}
            </div>

            {measuredStages.length > 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {measuredStages.map((st, i) => (
                    <div key={`${st.key || st.label || 'stage'}-${i}`} className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-center justify-between gap-2">
                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-black">
                                {i + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-400">
                                {t('operations.target', { duration: formatDashboardDuration(st.targetMinutes, language) })}
                            </span>
                        </div>
                        <p className="mt-2 text-xs font-black text-slate-900 dark:text-white truncate">
                            {t(`operations.stages.${st.key}`)}
                        </p>
                        <p className="mt-0.5 text-base font-black text-teal-600 dark:text-teal-400 tabular-nums">
                            {formatDashboardDuration(st.averageMinutes, language)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('operations.samples', { count: formatNumber(st.sampleSize, language) })}</p>
                    </div>
                ))}
            </div> : <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400">{t('operations.noTurnaround')}</p>}
        </section>
    );
};

// ─── Reception Dashboard View ─────────────────────────────────────────

const ReceptionDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const flow = (stats.patientFlowData || []).map(item => ({
        ...item,
        waiting: toNumber(item.waiting),
        in_progress: toNumber(item.in_progress),
        completed: toNumber(item.completed),
    }));

    const registerAction = buildNavAction(user, navigate, {
        icon: UserPlus,
        label: t('actions.registerPatient'),
        description: t('actions.registerPatientDescription'),
        to: '/reception',
        permissions: ['CREATE_PATIENTS'],
    });

    const appointmentsAction = buildNavAction(user, navigate, {
        icon: CalendarCheck2,
        label: t('actions.manageSchedule'),
        description: t('actions.manageScheduleDescription'),
        to: '/appointments',
        permissions: ['VIEW_APPOINTMENTS'],
    });

    const quickActions = [
        registerAction,
        appointmentsAction,
        buildNavAction(user, navigate, {
            icon: FileSearch,
            label: t('actions.patientRegistry'),
            description: t('actions.patientRegistryDescription'),
            to: '/patients',
            permissions: ['VIEW_PATIENTS'],
        }),
    ].filter(Boolean);

    return (
        <DashboardShell
            {...props}
            eyebrow={t('reception.eyebrow')}
            title={t('reception.title')}
            subtitle={t('reception.subtitle')}
            priorityItems={getReceptionPriorityItems(stats, language, t)}
            showModalities
            metrics={[
                { key: 'checkIns', icon: UserPlus, tone: 'cyan', label: t('reception.todayCheckIns'), value: formatNumber(stats.todayCheckIns, language), badge: stats.checkInsChange, detail: t('common.vsPreviousDay') },
                { key: 'appointments', icon: CalendarCheck2, tone: 'blue', label: t('reception.appointments'), value: formatNumber(stats.appointments, language), detail: t('reception.pendingAppointments', { count: formatNumber(stats.appointmentsPending, language) }), onClick: appointmentsAction?.onClick },
                { key: 'waiting', icon: Clock3, tone: 'amber', label: t('reception.waitingRoom'), value: formatNumber(stats.waitingRoom, language), detail: t('reception.averageWait', { duration: formatDashboardDuration(stats.averageWaitMinutes, language) }) },
                { key: 'completed', icon: CheckCircle2, tone: 'emerald', label: t('reception.completedToday'), value: formatNumber(stats.completed, language), badge: stats.completedChange, detail: t('common.vsPreviousDay') },
            ]}
            primaryAction={registerAction && (
                <PrimaryAction
                    icon={registerAction.icon}
                    label={registerAction.label}
                    onClick={registerAction.onClick}
                />
            )}
        >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.85fr)]">
                <PagePanel
                    title={t('reception.patientFlow')}
                    description={t('reception.patientFlowDescription')}
                    action={<PanelBadge>{t('common.today')}</PanelBadge>}
                >
                    {flow.length > 0 ? (
                        <ChartData
                            title={t('reception.patientFlow')}
                            rows={flow}
                            columns={[
                                { key: 'time', label: t('common.time', { defaultValue: 'Time' }) },
                                { key: 'waiting', label: t('flow.waiting'), render: row => formatNumber(row.waiting, language) },
                                { key: 'in_progress', label: t('flow.inProgress'), render: row => formatNumber(row.in_progress, language) },
                                { key: 'completed', label: t('flow.completed'), render: row => formatNumber(row.completed, language) },
                            ]}
                            t={t}
                        >
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={flow} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="waitingArea" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="completedArea" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" stroke="currentColor" className="text-slate-100 dark:text-slate-800" vertical={false} />
                                        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={chartTooltipStyle} />
                                        <Area type="monotone" dataKey="waiting" name={t('flow.waiting')} stroke="#f59e0b" strokeWidth={3} fill="url(#waitingArea)" />
                                        <Area type="monotone" dataKey="in_progress" name={t('flow.inProgress')} stroke="#3b82f6" strokeWidth={3} fill="url(#progressArea)" />
                                        <Area type="monotone" dataKey="completed" name={t('flow.completed')} stroke="#10b981" strokeWidth={3} fill="url(#completedArea)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartData>
                    ) : <ChartEmpty />}
                    <ChartLegend items={[[t('flow.waiting'), '#f59e0b'], [t('flow.inProgress'), '#3b82f6'], [t('flow.completed'), '#10b981']]} />
                </PagePanel>

                <ActivityPanel activities={stats.recentActivity} language={language} kind="reception" />
            </div>

            <QuickActions actions={quickActions} />
        </DashboardShell>
    );
};

// ─── Clinical Dashboard View ──────────────────────────────────────────

const ClinicalDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const isArabic = language?.startsWith('ar');
    const stageDistribution = normalizeDistribution(Object.entries(stats.stageDistribution || {}).map(([name, value]) => ({ name, value })));
    const distribution = stageDistribution.length > 0 ? stageDistribution : normalizeDistribution(stats.modalityDistribution);
    const cycleMetric = stats.cycleMetric || ({ Radiologist: 'report', Technician: 'scan', Nurse: 'preparation' }[user?.role] || 'report');
    const metricCopy = key => t(`clinical.metrics.${cycleMetric}.${key}`);

    const worklistAction = buildNavAction(user, navigate, {
        icon: Stethoscope,
        label: t('actions.openWorklist'),
        description: t('actions.openWorklistDescription'),
        to: '/worklist',
        permissions: ['VIEW_EXAMS'],
    });

    const quickActions = [
        worklistAction,
        buildNavAction(user, navigate, {
            icon: CalendarCheck2,
            label: t('actions.viewSchedule'),
            description: t('actions.viewScheduleDescription'),
            to: '/appointments',
            permissions: ['VIEW_APPOINTMENTS'],
        }),
        buildNavAction(user, navigate, {
            icon: FileSearch,
            label: t('actions.patientRegistry'),
            description: t('actions.patientRegistryDescription'),
            to: '/patients',
            permissions: ['VIEW_PATIENTS'],
        }),
    ].filter(Boolean);

    return (
        <DashboardShell
            {...props}
            eyebrow={t('clinical.eyebrow')}
            title={t('clinical.title')}
            subtitle={metricCopy('subtitle')}
            priorityItems={getClinicalPriorityItems(stats, language, t, cycleMetric)}
            showModalities
            showTurnaround
            metrics={[
                { key: 'assigned', icon: ListChecks, tone: 'cyan', label: t('clinical.taskMetrics.totalAssigned'), value: formatNumber(stats.totalAssigned, language), detail: t('clinical.taskMetrics.available', { count: formatNumber(stats.availableTasks, language) }), onClick: worklistAction?.onClick },
                { key: 'pending', icon: ClipboardList, tone: 'amber', label: t('clinical.taskMetrics.pending'), value: formatNumber(stats.pending, language), detail: metricCopy('pending'), onClick: worklistAction?.onClick },
                { key: 'inProgress', icon: Activity, tone: 'blue', label: t('clinical.taskMetrics.inProgress'), value: formatNumber(stats.inProgress, language), detail: t('clinical.taskMetrics.onHold', { count: formatNumber(stats.onHold, language) }), onClick: worklistAction?.onClick },
                { key: 'completedToday', icon: CheckCircle2, tone: 'emerald', label: metricCopy('completedToday'), value: formatNumber(stats.completedToday, language), badge: stats.completedTodayChange, detail: t('common.vsPreviousDay') },
                { key: 'averageCycle', icon: Clock3, tone: 'violet', label: metricCopy('averageCycle'), value: formatDashboardDuration((stats.averageTurnaroundHours || 0) * 60, language), detail: t(`clinical.metrics.${cycleMetric}.oldest`, { hours: formatDecimal(stats.oldestPendingHours, language) }) },
            ]}
            primaryAction={worklistAction && (
                <PrimaryAction
                    icon={worklistAction.icon}
                    label={worklistAction.label}
                    onClick={worklistAction.onClick}
                />
            )}
        >
            {/* High-Acuity Alert Banner */}
            {toNumber(stats.urgentCases) > 0 && worklistAction && (
                <button
                    type="button"
                    onClick={worklistAction.onClick}
                    className="group relative flex w-full flex-col gap-4 overflow-hidden rounded-3xl border border-rose-500/30 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent p-5 text-start shadow-sm transition-all hover:shadow-md hover:border-rose-500/50 dark:from-rose-950/40 dark:via-slate-900/60 dark:to-slate-900 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-center gap-4">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-500/20 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/30 animate-pulse">
                            <AlertTriangle size={22} />
                        </span>
                        <div>
                            <span className="block text-base font-black text-rose-950 dark:text-rose-200">
                                {metricCopy('attentionTitle')}
                            </span>
                            <span className="mt-0.5 block text-xs font-semibold text-rose-800/90 dark:text-rose-300/80">
                                {t(`clinical.metrics.${cycleMetric}.attentionDescription`, { count: formatNumber(stats.urgentCases, language) })}
                            </span>
                        </div>
                    </div>
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-rose-500 group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                        <span>{t('actions.reviewNow')}</span>
                        <ArrowRight size={14} className={isArabic ? 'rotate-180' : ''} />
                    </span>
                </button>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
                <DistributionPanel
                    data={distribution}
                    title={stageDistribution.length > 0 ? t('clinical.taskMetrics.stageDistribution') : t('clinical.workloadDistribution')}
                    description={stageDistribution.length > 0 ? t('clinical.taskMetrics.stageDistributionDescription') : metricCopy('workloadDescription')}
                />
                <ActivityPanel activities={stats.recentActivity} language={language} />
            </div>

            <QuickActions actions={quickActions} />
        </DashboardShell>
    );
};

// ─── Finance, HR, and Insurance role dashboards ──────────────────────

const FinanceDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const isCashier = user?.role === 'Cashier';
    const workspaceAction = buildNavAction(user, navigate, isCashier ? {
        icon: WalletCards,
        label: t('actions.openCashierWorkspace'),
        description: t('actions.openCashierWorkspaceDescription'),
        to: '/reception',
        permissions: ['VIEW_INVOICES', 'PROCESS_PAYMENTS'],
    } : {
        icon: WalletCards,
        label: t('actions.financials'),
        description: t('actions.financialsDescription'),
        to: '/financials',
        permissions: ['VIEW_FINANCIALS'],
    });
    const insuranceAction = buildNavAction(user, navigate, {
        icon: ShieldCheck,
        label: t('actions.insurance'),
        description: t('actions.insuranceDescription'),
        to: '/insurance',
        permissions: ['VIEW_INSURANCE'],
    });
    const quickActions = [workspaceAction, insuranceAction].filter(Boolean);

    return (
        <DashboardShell
            {...props}
            eyebrow={t(`finance.${isCashier ? 'cashierEyebrow' : 'accountingEyebrow'}`)}
            title={t(`finance.${isCashier ? 'cashierTitle' : 'accountingTitle'}`)}
            subtitle={t(`finance.${isCashier ? 'cashierSubtitle' : 'accountingSubtitle'}`)}
            priorityItems={[
                { key: 'outstanding', icon: WalletCards, tone: toNumber(stats.outstandingAmount) > 0 ? 'amber' : 'emerald', label: t('finance.outstanding'), value: formatCurrency(stats.outstandingAmount, language), detail: t('finance.openInvoicesDetail', { count: formatNumber(stats.openInvoices, language) }) },
                { key: 'refunds', icon: RefreshCw, tone: toNumber(stats.pendingRefunds) > 0 ? 'rose' : 'emerald', label: t('finance.pendingRefunds'), value: formatNumber(stats.pendingRefunds, language), detail: t('finance.requiresReview') },
                { key: 'shift', icon: ShieldCheck, tone: stats.shiftOpen ? 'emerald' : 'cyan', label: isCashier ? t('finance.shiftStatus') : t('finance.todayTransactions'), value: isCashier ? t(stats.shiftOpen ? 'finance.shiftOpen' : 'finance.shiftClosed') : formatNumber(stats.transactionsToday, language), detail: isCashier ? t('finance.shiftStatusDetail') : t('finance.transactionsDetail') },
            ]}
            metrics={[
                { key: 'today', icon: CircleDollarSign, tone: 'emerald', label: t('finance.collectedToday'), value: formatCurrency(stats.collectedToday, language), detail: t('common.today') },
                { key: 'week', icon: WalletCards, tone: 'cyan', label: t('finance.collectedWeek'), value: formatCurrency(stats.collectedWeek, language), detail: t('common.currentWeek') },
                { key: 'transactions', icon: ClipboardList, tone: 'blue', label: t('finance.transactionsToday'), value: formatNumber(stats.transactionsToday, language), detail: t('common.today') },
                { key: 'openInvoices', icon: FileSearch, tone: 'amber', label: t('finance.openInvoices'), value: formatNumber(stats.openInvoices, language), detail: formatCurrency(stats.outstandingAmount, language), onClick: workspaceAction?.onClick },
            ]}
            primaryAction={workspaceAction && <PrimaryAction icon={workspaceAction.icon} label={workspaceAction.label} onClick={workspaceAction.onClick} />}
        >
            <QuickActions actions={quickActions} />
        </DashboardShell>
    );
};

const HRDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const hrAction = buildNavAction(user, navigate, {
        icon: UsersRound,
        label: t('actions.openHR'),
        description: t('actions.openHRDescription'),
        to: '/hr',
        permissions: ['VIEW_STAFF'],
    });
    const usersAction = buildNavAction(user, navigate, {
        icon: UserRound,
        label: t('actions.manageStaff'),
        description: t('actions.manageStaffDescription'),
        to: '/users',
        permissions: ['VIEW_USERS'],
    });

    return (
        <DashboardShell
            {...props}
            eyebrow={t('hr.eyebrow')}
            title={t('hr.title')}
            subtitle={t('hr.subtitle')}
            priorityItems={[
                { key: 'attendance', icon: CheckCircle2, tone: 'emerald', label: t('hr.presentToday'), value: formatNumber(stats.presentToday, language), detail: t('common.today') },
                { key: 'leave', icon: CalendarDays, tone: toNumber(stats.onLeaveToday) > 0 ? 'violet' : 'cyan', label: t('hr.onLeaveToday'), value: formatNumber(stats.onLeaveToday, language), detail: t('common.today') },
                { key: 'pending', icon: ClipboardList, tone: toNumber(stats.pendingLeave) > 0 ? 'amber' : 'emerald', label: t('hr.pendingLeave'), value: formatNumber(stats.pendingLeave, language), detail: t('hr.pendingLeaveDetail') },
            ]}
            metrics={[
                { key: 'active', icon: UsersRound, tone: 'cyan', label: t('hr.activeStaff'), value: formatNumber(stats.activeStaff, language), detail: t('hr.activeStaffDetail') },
                { key: 'present', icon: CheckCircle2, tone: 'emerald', label: t('hr.presentToday'), value: formatNumber(stats.presentToday, language), detail: t('common.today') },
                { key: 'leave', icon: CalendarDays, tone: 'violet', label: t('hr.onLeaveToday'), value: formatNumber(stats.onLeaveToday, language), detail: t('common.today') },
                { key: 'pending', icon: ClipboardList, tone: 'amber', label: t('hr.pendingLeave'), value: formatNumber(stats.pendingLeave, language), detail: t('hr.pendingLeaveDetail'), onClick: hrAction?.onClick },
            ]}
            primaryAction={hrAction && <PrimaryAction icon={hrAction.icon} label={hrAction.label} onClick={hrAction.onClick} />}
        >
            <QuickActions actions={[hrAction, usersAction].filter(Boolean)} />
        </DashboardShell>
    );
};

const InsuranceDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const insuranceAction = buildNavAction(user, navigate, {
        icon: ShieldCheck,
        label: t('actions.openInsurance'),
        description: t('actions.openInsuranceDescription'),
        to: '/insurance',
        permissions: ['VIEW_INSURANCE'],
    });
    const approvalsAction = buildNavAction(user, navigate, {
        icon: ClipboardList,
        label: t('actions.openApprovals'),
        description: t('actions.openApprovalsDescription'),
        to: '/approvals',
        permissions: ['MANAGE_INSURANCE_APPROVALS'],
    });

    return (
        <DashboardShell
            {...props}
            eyebrow={t('insurance.eyebrow')}
            title={t('insurance.title')}
            subtitle={t('insurance.subtitle')}
            priorityItems={[
                { key: 'approvals', icon: ClipboardList, tone: toNumber(stats.pendingApprovals) > 0 ? 'amber' : 'emerald', label: t('insurance.pendingApprovals'), value: formatNumber(stats.pendingApprovals, language), detail: t('insurance.requiresDecision') },
                { key: 'rejected', icon: AlertTriangle, tone: toNumber(stats.rejectedClaims) > 0 ? 'rose' : 'emerald', label: t('insurance.rejectedClaims'), value: formatNumber(stats.rejectedClaims, language), detail: t('insurance.requiresFollowUp') },
                { key: 'outstanding', icon: WalletCards, tone: 'cyan', label: t('insurance.outstandingClaims'), value: formatCurrency(stats.outstandingClaims, language), detail: t('insurance.openClaimsDetail', { count: formatNumber(stats.openClaims, language) }) },
            ]}
            metrics={[
                { key: 'approvals', icon: ClipboardList, tone: 'amber', label: t('insurance.pendingApprovals'), value: formatNumber(stats.pendingApprovals, language), detail: t('insurance.requiresDecision'), onClick: approvalsAction?.onClick },
                { key: 'openClaims', icon: FileSearch, tone: 'cyan', label: t('insurance.openClaims'), value: formatNumber(stats.openClaims, language), detail: t('insurance.inProgress') },
                { key: 'outstanding', icon: WalletCards, tone: 'violet', label: t('insurance.outstandingClaims'), value: formatCurrency(stats.outstandingClaims, language), detail: t('insurance.openClaimsDetail', { count: formatNumber(stats.openClaims, language) }) },
                { key: 'received', icon: CircleDollarSign, tone: 'emerald', label: t('insurance.receivedWeek'), value: formatCurrency(stats.receivedWeek, language), detail: t('common.currentWeek') },
            ]}
            primaryAction={insuranceAction && <PrimaryAction icon={insuranceAction.icon} label={insuranceAction.label} onClick={insuranceAction.onClick} />}
        >
            <QuickActions actions={[insuranceAction, approvalsAction].filter(Boolean)} />
        </DashboardShell>
    );
};

// ─── Executive & Admin Dashboard View ─────────────────────────────────

const ExecutiveDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const isArabic = language?.startsWith('ar');
    const performance = (stats.scanVolumeData || []).map(item => ({
        ...item,
        name: item.date ? formatWeekday(item.date, language) : item.name,
        scans: toNumber(item.scans),
        revenue: toNumber(item.revenue),
    }));

    const distribution = normalizeDistribution(stats.modalityData);

    const analyticsAction = buildNavAction(user, navigate, {
        icon: Gauge,
        label: t('actions.openAnalytics'),
        description: t('actions.openAnalyticsDescription'),
        to: '/analytics',
        permissions: ['VIEW_ANALYTICS'],
    });

    const financialsAction = buildNavAction(user, navigate, {
        icon: WalletCards,
        label: t('actions.financials'),
        description: t('actions.financialsDescription'),
        to: '/financials',
        permissions: ['VIEW_FINANCIALS'],
    });

    const worklistAction = buildNavAction(user, navigate, {
        icon: ClipboardList,
        label: t('actions.openWorklist'),
        description: t('actions.openWorklistDescription'),
        to: '/worklist',
        permissions: ['VIEW_EXAMS'],
    });

    const staffAction = buildNavAction(user, navigate, {
        icon: UsersRound,
        label: t('actions.manageStaff'),
        description: t('actions.manageStaffDescription'),
        to: '/users',
        permissions: ['VIEW_STAFF', 'MANAGE_STAFF'],
    });

    const quickActions = [
        staffAction,
        financialsAction,
        buildNavAction(user, navigate, {
            icon: Package,
            label: t('actions.inventory'),
            description: t('actions.inventoryDescription'),
            to: '/inventory',
            permissions: ['VIEW_INVENTORY', 'CONSUME_INVENTORY'],
        }),
        analyticsAction,
    ].filter(Boolean);

    return (
        <DashboardShell
            {...props}
            eyebrow={t('executive.eyebrow')}
            title={t('executive.title')}
            subtitle={t('executive.subtitle')}
            priorityItems={getExecutivePriorityItems(stats, language, t, { worklistAction, financialsAction, staffAction })}
            showPatientSearch={false}
            metrics={[
                { key: 'scans', icon: ScanLine, tone: 'cyan', label: t('executive.weeklyScans'), value: formatNumber(stats.totalScans, language), badge: stats.scansChange, detail: t('common.vsPreviousWeek') },
                { key: 'today', icon: Zap, tone: 'emerald', label: isArabic ? 'إنتاج اليوم' : 'Today throughput', value: formatNumber(stats.scansToday, language), detail: isArabic ? 'فحوص مكتملة اليوم' : 'Completed scans today' },
                { key: 'openWork', icon: ClipboardList, tone: 'amber', label: t('executive.openWork'), value: formatNumber(stats.openWork, language), detail: t('executive.scansToday', { count: formatNumber(stats.scansToday, language) }), onClick: worklistAction?.onClick },
                { key: 'completion', icon: CheckCircle2, tone: 'violet', label: isArabic ? 'معدل الإنجاز' : 'Completion rate', value: `${formatNumber(stats.completionRate, language)}%`, detail: isArabic ? 'كفاءة إغلاق دورة العمل' : 'Workflow completion efficiency' },
            ]}
            primaryAction={analyticsAction && (
                <PrimaryAction
                    icon={analyticsAction.icon}
                    label={analyticsAction.label}
                    onClick={analyticsAction.onClick}
                />
            )}
        >
            <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={isArabic ? 'اختصارات القيادة التشغيلية' : 'Operational command shortcuts'}>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="me-auto text-xs font-black text-slate-800 dark:text-slate-200">{isArabic ? 'انتقل مباشرة إلى منطقة العمل' : 'Go directly to work'}</span>
                    {quickActions.map(action => (
                        <button key={action.label} type="button" onClick={action.onClick} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-teal-800 dark:hover:bg-teal-950/30">
                            <action.icon size={14} />{action.label}
                        </button>
                    ))}
                </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.55fr)]">
                <PagePanel
                    title={t('executive.weeklyPerformance')}
                    description={t('executive.performanceDescription')}
                    action={<PanelBadge>{t('common.currentWeek')}</PanelBadge>}
                >
                    {performance.length > 0 ? (
                        <ChartData
                            title={t('executive.weeklyPerformance')}
                            rows={performance}
                            columns={[
                                { key: 'name', label: t('common.date', { defaultValue: 'Date' }) },
                                { key: 'scans', label: t('executive.scans'), render: row => formatNumber(row.scans, language) },
                                { key: 'revenue', label: t('executive.revenue'), render: row => formatCurrency(row.revenue, language) },
                            ]}
                            t={t}
                        >
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={performance} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="4 4" stroke="currentColor" className="text-slate-100 dark:text-slate-800" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="scans" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <YAxis yAxisId="revenue" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={chartTooltipStyle}
                                            formatter={(value, name) => name === t('executive.revenue') ? formatCurrency(value, language) : formatNumber(value, language)}
                                        />
                                        <Bar yAxisId="scans" dataKey="scans" name={t('executive.scans')} fill="#0ea5e9" radius={[8, 8, 0, 0]} maxBarSize={44} />
                                        <Line yAxisId="revenue" type="monotone" dataKey="revenue" name={t('executive.revenue')} stroke="#10b981" strokeWidth={3.5} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartData>
                    ) : <ChartEmpty />}
                    <ChartLegend items={[[t('executive.scans'), '#0ea5e9'], [t('executive.revenue'), '#10b981']]} />
                </PagePanel>

                <PagePanel title={isArabic ? 'نبض الإنتاجية' : 'Productivity pulse'} description={isArabic ? 'قراءة سريعة للحجم والعمل المفتوح دون مؤشرات مشتتة.' : 'A concise reading of throughput and unresolved work.'}>
                    <div className="space-y-3">
                        <ProductivityRow label={isArabic ? 'إنتاج اليوم' : 'Today throughput'} value={formatNumber(stats.scansToday, language)} total={Math.max(toNumber(stats.totalScans), toNumber(stats.scansToday), 1)} current={toNumber(stats.scansToday)} tone="emerald" />
                        <ProductivityRow label={isArabic ? 'العمل المفتوح' : 'Open work'} value={formatNumber(stats.openWork, language)} total={Math.max(toNumber(stats.totalScans), toNumber(stats.openWork), 1)} current={toNumber(stats.openWork)} tone="amber" />
                        <ProductivityRow label={isArabic ? 'معدل الإنجاز' : 'Completion rate'} value={`${formatNumber(stats.completionRate, language)}%`} total={100} current={toNumber(stats.completionRate)} tone="cyan" />
                    </div>
                </PagePanel>
            </div>

            <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-800 marker:hidden dark:text-slate-200">
                    <span>{isArabic ? 'التفاصيل التشغيلية والتحليل المساند' : 'Operational detail and supporting analysis'}</span>
                    <ChevronRight size={16} className="transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" />
                </summary>
                <div className="space-y-5 border-t border-slate-100 p-4 dark:border-slate-800">
                    <ModalityLiveDeck modalities={stats.liveModalities} language={language} />
                    <TurnaroundPipeline stages={stats.turnaroundStages} language={language} />
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
                        <DistributionPanel data={distribution} title={t('executive.modalityMix')} description={t('executive.modalityDescription')} />
                        <ActivityPanel activities={stats.recentActivity} language={language} />
                    </div>
                </div>
            </details>
        </DashboardShell>
    );
};

const ProductivityRow = ({ label, value, current, total, tone }) => {
    const width = Math.min(100, Math.max(0, (toNumber(current) / Math.max(toNumber(total), 1)) * 100));
    const color = tone === 'amber' ? 'bg-amber-500' : tone === 'cyan' ? 'bg-cyan-500' : 'bg-emerald-500';
    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600 dark:text-slate-300"><span>{label}</span><strong className="text-sm font-black tabular-nums text-slate-950 dark:text-white">{value}</strong></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true"><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div>
        </div>
    );
};

// ─── Priority Strip ───────────────────────────────────────────────────

const priorityToneStyles = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:bg-[var(--VIARA-surface)] dark:text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:bg-[var(--VIARA-surface)] dark:text-amber-300',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:bg-[var(--VIARA-surface)] dark:text-rose-300',
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:bg-[var(--VIARA-surface)] dark:text-cyan-300',
    violet: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:bg-[var(--VIARA-surface)] dark:text-purple-300',
};

const PriorityStrip = ({ items }) => {
    const { t } = useTranslation('dashboard');
    const visibleItems = (items || []).filter(Boolean);
    if (visibleItems.length === 0) return null;

    return (
        <section className="grid gap-3.5 md:grid-cols-3" aria-label={t('priorities.title', { defaultValue: 'Operational priorities' })}>
            {visibleItems.map(({ key, icon: Icon, tone = 'cyan', label, value, detail, onClick }) => {
                const Element = onClick ? 'button' : 'article';
                return <Element
                    key={key}
                    type={onClick ? 'button' : undefined}
                    onClick={onClick}
                    className={`group relative flex min-h-[84px] items-center gap-3.5 rounded-2xl border p-3.5 text-start shadow-sm backdrop-blur-xl transition-all hover:shadow-md ${
                        priorityToneStyles[tone] || priorityToneStyles.cyan
                    }`}
                >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 dark:bg-slate-900/80 shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                        <Icon size={20} className="text-current" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] font-black uppercase tracking-wider opacity-75 truncate">
                            {label}
                        </p>
                        <p className="mt-0.5 truncate text-xl font-black text-slate-900 dark:text-white tabular-nums">
                            {value}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-bold opacity-85">
                            {detail}
                        </p>
                    </div>
                    {onClick && <ArrowUpRight size={15} className="shrink-0 opacity-60" />}
                </Element>;
            })}
        </section>
    );
};

const PanelBadge = ({ children }) => (
    <span className="shrink-0 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
        {children}
    </span>
);

// ─── Distribution Donut Panel ─────────────────────────────────────────

const DistributionPanel = ({ data, title, description }) => {
    const { t } = useTranslation('dashboard');
    return (
        <PagePanel title={title} description={description}>
            {data.length > 0 ? (
                <div className="flex-1 flex flex-col justify-center">
                    <ChartData
                        title={title}
                        rows={data}
                        columns={[
                            { key: 'name', label: t('common.modality', { defaultValue: 'Category' }) },
                            { key: 'value', label: t('common.value', { defaultValue: 'Value' }) },
                        ]}
                        t={t}
                    >
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={62}
                                        outerRadius={92}
                                        paddingAngle={5}
                                        cornerRadius={6}
                                    >
                                        {data.map((entry, index) => (
                                            <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={chartTooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartData>
                    <div className="mt-4 grid gap-2 grid-cols-2">
                        {data.map(item => (
                            <div key={item.name} className="flex items-center justify-between gap-2 text-xs rounded-xl bg-slate-50/70 p-2 dark:bg-slate-950/40">
                                <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-bold truncate">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full shadow-xs" style={{ backgroundColor: item.color }} />
                                    <span className="truncate">{item.name}</span>
                                </span>
                                <span className="font-black text-slate-900 dark:text-white tabular-nums">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : <ChartEmpty label={t('common.noDistribution')} />}
        </PagePanel>
    );
};

// ─── Activity Timeline Panel with Sub-Tabs ────────────────────────────

const ActivityPanel = ({ activities = [], language, kind = 'clinical' }) => {
    const { t } = useTranslation('dashboard');
    const isArabic = language?.startsWith('ar');
    const [activityFilter, setActivityFilter] = useState('all');

    const availableFilters = useMemo(() => {
        const types = new Set(activities.map(activity => activity.type));
        return [
            { id: 'all', label: isArabic ? 'الكل' : 'All' },
            (types.has('report') || types.has('scan') || types.has('preparation')) && { id: 'clinical', label: isArabic ? 'السريري' : 'Clinical' },
            types.has('checkin') && { id: 'checkin', label: isArabic ? 'الاستقبال' : 'Arrivals' },
        ].filter(Boolean);
    }, [activities, isArabic]);

    const filteredActivities = useMemo(() => {
        if (activityFilter === 'all') return activities;
        if (activityFilter === 'clinical') return activities.filter(activity => ['report', 'scan', 'preparation'].includes(activity.type));
        if (activityFilter === 'checkin') return activities.filter(activity => activity.type === 'checkin');
        return activities;
    }, [activities, activityFilter]);

    return (
        <PagePanel
            title={t(kind === 'reception' ? 'activity.receptionTitle' : 'activity.title')}
            description={t(kind === 'reception' ? 'activity.receptionDescription' : 'activity.description')}
            action={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('common.live')}</span>
                </span>
            }
        >
            {/* Filter Pills */}
            <div className="flex gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
                {availableFilters.map(f => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setActivityFilter(f.id)}
                        aria-pressed={activityFilter === f.id}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition ${
                            activityFilter === f.id
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {filteredActivities.length > 0 ? (
                <div className="flex-1 overflow-auto pe-1 mt-3 max-h-80">
                    <ol className="relative border-s border-slate-100 dark:border-slate-800 ms-3 space-y-4">
                        {filteredActivities.map((activity, index) => (
                            <li key={`${activity.timestamp || activity.time}-${index}`} className="ms-6">
                                <span className="absolute -start-[11px] flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 ring-4 ring-white dark:ring-slate-900">
                                    <CheckCircle2 size={12} />
                                </span>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                                    {activity.message || t(
                                        activity.type === 'checkin' ? 'activity.patientArrived'
                                            : activity.type === 'preparation' ? 'activity.preparationCompleted'
                                                : activity.type === 'scan' ? 'activity.scanCompleted'
                                                    : 'activity.scanFinalized',
                                        { modality: activity.modality || t('common.imagingStudy'), mrn: activity.mrn || '-' }
                                    )}
                                </p>
                                <time className="mt-1 block font-mono text-[10px] font-semibold text-slate-400 dark:text-slate-500" dateTime={activity.timestamp}>
                                    {formatRelativeTime(activity.timestamp, language, activity.time)}
                                </time>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                        <Activity size={24} />
                    </span>
                    <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{t(kind === 'reception' ? 'activity.receptionEmpty' : 'activity.empty')}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(kind === 'reception' ? 'activity.receptionEmptyDescription' : 'activity.emptyDescription')}</p>
                </div>
            )}
        </PagePanel>
    );
};

// ─── Quick Actions Launchpad ──────────────────────────────────────────

const QuickActionButton = ({ icon: Icon, label, description, onClick }) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative overflow-hidden flex min-h-[96px] items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 text-start shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-teal-500/50 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-teal-500/40"
        >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold transition-colors group-hover:bg-teal-600 group-hover:text-white">
                <Icon size={22} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors truncate">
                    {label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400 line-clamp-1">
                    {description}
                </span>
            </span>
            <ArrowUpRight size={18} className="shrink-0 text-slate-300 dark:text-slate-600 transition-colors group-hover:text-teal-600 dark:group-hover:text-teal-400 rtl:rotate-[-90deg]" />
        </button>
    );
};

const QuickActions = ({ actions = [] }) => {
    const { t } = useTranslation('dashboard');
    if (!actions.length) {
        return (
            <PagePanel title={t('actions.title')} description={t('actions.description')} className="min-h-[200px]">
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-slate-800 dark:bg-slate-950/20">
                    <div>
                        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-900 dark:text-slate-500">
                            <ShieldCheck size={22} />
                        </span>
                        <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{t('actions.noneAvailable', { defaultValue: 'No shortcuts available' })}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('actions.noneAvailableDescription', { defaultValue: 'Ask an administrator for permissions.' })}</p>
                    </div>
                </div>
            </PagePanel>
        );
    }

    return (
        <PagePanel title={t('actions.title')} description={t('actions.description')}>
            <div className={`grid gap-4 ${actions.length === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3'}`}>
                {actions.map(action => (
                    <QuickActionButton key={action.label} {...action} />
                ))}
            </div>
        </PagePanel>
    );
};

const PrimaryAction = ({ icon: Icon, label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-500 active:scale-95"
    >
        <Icon size={16} />
        <span>{label}</span>
    </button>
);

const ChartLegend = ({ items }) => (
    <div className="mt-4 flex flex-wrap justify-center gap-5">
        {items.map(([label, color]) => (
            <span key={label} className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full shadow-xs" style={{ backgroundColor: color }} />
                <span>{label}</span>
            </span>
        ))}
    </div>
);

const ChartData = ({ title, rows, columns, t, children }) => (
    <AccessibleChartData
        title={title}
        summary={t('common.chartSummary', { count: rows.length, defaultValue: '{{count}} data points in {{title}}.', title })}
        rows={rows}
        columns={columns}
        disclosureLabel={t('common.viewChartData', { defaultValue: 'View chart data' })}
        tableLabel={t('common.chartDataTable', { title, defaultValue: '{{title}} data' })}
    >
        {children}
    </AccessibleChartData>
);

const ChartEmpty = ({ label }) => {
    const { t } = useTranslation('dashboard');
    return (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 text-center p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 shadow-sm">
                <Gauge size={24} />
            </span>
            <p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{label || t('common.noChartData')}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('common.noChartDataDescription')}</p>
        </div>
    );
};

const DashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading dashboard data…</span>
        <div className="h-44 rounded-3xl bg-slate-200/60 dark:bg-slate-800/60" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-36 rounded-3xl bg-slate-200/60 dark:bg-slate-800/60" />
            ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
            <div className="h-96 rounded-3xl bg-slate-200/60 dark:bg-slate-800/60 xl:col-span-2" />
            <div className="h-96 rounded-3xl bg-slate-200/60 dark:bg-slate-800/60" />
        </div>
    </div>
);

const DashboardError = ({ error, onRetry }) => {
    const { t } = useTranslation('dashboard');
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl border border-rose-200/80 bg-white/90 p-8 text-center shadow-lg dark:border-rose-900/50 dark:bg-slate-900/90 backdrop-blur-xl">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={30} />
                </span>
                <h1 className="mt-5 text-xl font-black text-slate-900 dark:text-white">{t('error.title')}</h1>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {error?.data?.message || t('error.description')}
                </p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-teal-600 px-6 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                >
                    <RefreshCw size={16} />
                    <span>{t('error.retry')}</span>
                </button>
            </div>
        </div>
    );
};

// ─── Helpers ──────────────────────────────────────────────────────────

const normalizeDistribution = data => (data || []).map((item, index) => ({
    name: item.name || 'N/A',
    value: toNumber(item.value),
    color: item.color || modalityColors[index % modalityColors.length],
})).filter(item => item.value > 0);

const hasAnyUserPermission = (user, permissions = []) => {
    const required = Array.isArray(permissions) ? permissions : [permissions];
    if (required.length === 0) return true;
    if (user?.role === 'Developer') return true;
    const effectivePermissions = getEffectivePermissions(user);
    return required.some(permission => effectivePermissions.has(permission));
};

const canUseAction = (user, { to, permissions }) => (
    (!to || canAccessRoute(to, user)) && hasAnyUserPermission(user, permissions)
);

const buildNavAction = (user, navigate, action) => (
    canUseAction(user, action) ? { ...action, onClick: () => navigate(action.to) } : null
);

const getReceptionPriorityItems = (stats, language, t) => [
    {
        key: 'waiting',
        icon: Clock3,
        tone: toNumber(stats.waitingRoom) > 0 ? 'amber' : 'emerald',
        label: t('priorities.waitingRoom', { defaultValue: 'Waiting room' }),
        value: formatNumber(stats.waitingRoom, language),
        detail: t('priorities.averageWait', { duration: formatDashboardDuration(stats.averageWaitMinutes, language), defaultValue: 'Average wait {{duration}}' }),
    },
    {
        key: 'appointments',
        icon: CalendarCheck2,
        tone: toNumber(stats.appointmentsPending) > 0 ? 'cyan' : 'emerald',
        label: t('priorities.readyAppointments', { defaultValue: 'Ready appointments' }),
        value: formatNumber(stats.appointmentsPending, language),
        detail: t('priorities.totalAppointments', { count: formatNumber(stats.appointments, language), defaultValue: '{{count}} scheduled today' }),
    },
    {
        key: 'completed',
        icon: CheckCircle2,
        tone: 'emerald',
        label: t('priorities.completedToday', { defaultValue: 'Completed today' }),
        value: formatNumber(stats.completed, language),
        detail: t('common.vsPreviousDay'),
    },
];

const getClinicalPriorityItems = (stats, language, t, cycleMetric) => [
    {
        key: 'urgent',
        icon: AlertTriangle,
        tone: toNumber(stats.urgentCases) > 0 ? 'rose' : 'emerald',
        label: t('priorities.urgentWork', { defaultValue: 'Aged work' }),
        value: formatNumber(stats.overdueTasks ?? stats.urgentCases, language),
        detail: t('clinical.taskMetrics.overdueDetail'),
    },
    {
        key: 'oldest',
        icon: Clock3,
        tone: toNumber(stats.oldestPendingHours) >= 24 ? 'amber' : 'cyan',
        label: t('clinical.taskMetrics.slaCompliance'),
        value: `${formatNumber(stats.slaCompliance, language)}%`,
        detail: t('clinical.taskMetrics.startDelay', { minutes: formatNumber(stats.averageStartDelayMinutes, language) }),
    },
    {
        key: 'completed',
        icon: CheckCircle2,
        tone: 'emerald',
        label: t('clinical.taskMetrics.completionRate'),
        value: `${formatNumber(stats.completionRate, language)}%`,
        detail: t('clinical.taskMetrics.weeklyProgress', { completed: formatNumber(stats.thisWeek, language), reassigned: formatNumber(stats.reassignmentsWeek, language) }),
    },
];

const getExecutivePriorityItems = (stats, language, t, actions = {}) => [
    {
        key: 'openWork',
        icon: ListChecks,
        tone: toNumber(stats.openWork) > 0 ? 'amber' : 'emerald',
        label: t('priorities.openWork', { defaultValue: 'Open work' }),
        value: formatNumber(stats.openWork, language),
        detail: t('executive.scansToday', { count: formatNumber(stats.scansToday, language) }),
        onClick: actions.worklistAction?.onClick,
    },
    {
        key: 'collections',
        icon: CircleDollarSign,
        tone: 'emerald',
        label: t('priorities.collections', { defaultValue: 'Collections' }),
        value: formatCurrency(stats.revenueAmount, language),
        detail: t('common.vsPreviousWeek'),
        onClick: actions.financialsAction?.onClick,
    },
    {
        key: 'staffing',
        icon: UsersRound,
        tone: toNumber(stats.staffOnLeave) > 0 ? 'violet' : 'cyan',
        label: t('priorities.staffing', { defaultValue: 'Staffing' }),
        value: formatNumber(stats.activeStaff, language),
        detail: t('executive.staffOnLeave', { count: formatNumber(stats.staffOnLeave, language) }),
        onClick: actions.staffAction?.onClick,
    },
];

const dashboardLocale = language => language?.startsWith('ar') ? 'ar-EG' : 'en-US';
const resolvedTimezone = timezone => timezone && timezone !== 'auto' ? timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
const formatNumber = (value, language = 'en') => new Intl.NumberFormat(dashboardLocale(language), { maximumFractionDigits: 0 }).format(toNumber(value));
const formatDecimal = (value, language = 'en') => new Intl.NumberFormat(dashboardLocale(language), { maximumFractionDigits: 1 }).format(toNumber(value));
const formatDashboardDuration = (minutes, language = 'en') => {
    const normalizedMinutes = toNumber(minutes);
    if (language?.startsWith('ar')) return formatDuration(normalizedMinutes, 'ar-EG');
    if (normalizedMinutes < 60) return `${formatDecimal(normalizedMinutes, 'en')} min`;
    return `${formatDecimal(normalizedMinutes / 60, 'en')} hr`;
};
const formatCurrency = (value, language = 'en') => new Intl.NumberFormat(dashboardLocale(language), { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(toNumber(value));

const formatWeekday = (value, language = 'en') => {
    const datePart = String(value).slice(0, 10);
    return new Intl.DateTimeFormat(dashboardLocale(language), { weekday: 'short' }).format(new Date(`${datePart}T12:00:00`));
};

const formatDashboardDate = (language = 'en', timezone = 'auto') => new Intl.DateTimeFormat(
    dashboardLocale(language),
    { weekday: 'short', month: 'short', day: 'numeric', timeZone: resolvedTimezone(timezone) },
).format(new Date());

const formatUpdatedAt = (timestamp, language, timezone, t) => {
    if (!timestamp) return t('common.awaitingSync');
    return new Intl.DateTimeFormat(dashboardLocale(language), { hour: '2-digit', minute: '2-digit', timeZone: resolvedTimezone(timezone) }).format(new Date(timestamp));
};

const formatRelativeTime = (timestamp, language = 'en', fallback = '') => {
    if (!timestamp) return fallback;
    const seconds = Math.round((new Date(timestamp).getTime() - Date.now()) / 1000);
    const absolute = Math.abs(seconds);
    const [divisor, unit] = absolute < 60 ? [1, 'second'] : absolute < 3600 ? [60, 'minute'] : absolute < 86400 ? [3600, 'hour'] : [86400, 'day'];
    return new Intl.RelativeTimeFormat(dashboardLocale(language), { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
};

export default DashboardHome;
