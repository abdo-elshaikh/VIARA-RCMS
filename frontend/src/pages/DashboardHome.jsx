import React, { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    Activity, AlertTriangle, ArrowUpRight, ArrowDownRight, CalendarCheck2, CalendarDays,
    CheckCircle2, CircleDollarSign, ClipboardList, Clock3, FileSearch, Gauge,
    LayoutDashboard, ListChecks, Package, RefreshCw, ShieldCheck,
    ScanLine, Stethoscope, UserPlus, UsersRound, WalletCards, ChevronRight,
    Zap, Sparkles, UserRound, ArrowRight, Search, Radio, Monitor, Check, Filter
} from 'lucide-react';
import { selectCurrentUser } from '../store/authSlice';
import { useGetDashboardStatsQuery } from '../store/api';
import { formatDuration } from '../utils/dateFormat';
import { AccessibleChartData, PagePanel } from '../components/ui';
import { canAccessRoute } from '../config/routes';

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
    const { t, i18n } = useTranslation('dashboard');
    const { data: stats = {}, isLoading, isFetching, isError, error, refetch } = useGetDashboardStatsQuery(undefined, {
        skip: !user, refetchOnMountOrArgChange: true, pollingInterval: 60000,
    });

    if (isLoading) return <DashboardSkeleton />;
    if (isError) return <DashboardError error={error} onRetry={refetch} />;

    const shared = { user, stats, isFetching, refetch, language: i18n.language, t };

    if (user?.role === 'Receptionist') return <ReceptionDashboard {...shared} />;
    if (['Radiologist', 'Technician', 'Nurse'].includes(user?.role)) return <ClinicalDashboard {...shared} />;
    return <ExecutiveDashboard {...shared} />;
};

// ─── Dashboard Shell ──────────────────────────────────────────────────

const DashboardShell = ({
    user,
    stats,
    isFetching,
    refetch,
    language,
    eyebrow,
    title,
    subtitle,
    primaryAction,
    priorityItems = [],
    children
}) => {
    const { t } = useTranslation('dashboard');
    const navigate = useNavigate();
    const isArabic = language?.startsWith('ar');
    const userName = user?.full_name || user?.name || stats.userName || t('common.teamMember');
    const role = t(`roles.${user?.role}`, user?.role || t('roles.Admin'));
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        navigate(`/patients?search=${encodeURIComponent(searchQuery.trim())}`);
    };

    return (
        <div className="space-y-6">
            <h2 className="sr-only">{title}</h2>
            {/* Top Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    {/* Greeting & Identity */}
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <LayoutDashboard size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Sparkles size={11} />
                                    <span>{role}</span>
                                </span>
                                {eyebrow && (
                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                                        · {eyebrow}
                                    </span>
                                )}
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('common.welcome', { name: userName })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {subtitle || title}
                            </p>
                        </div>
                    </div>

                    {/* Telemetry Actions & Search */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Quick Patient Finder */}
                        <form onSubmit={handleSearch} className="relative min-w-[220px]">
                            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={isArabic ? 'بحث سريع عن مريض / MRN...' : 'Quick patient / MRN lookup...'}
                                className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/80 ps-9 pe-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-hidden dark:border-slate-800 dark:bg-slate-950/50 dark:text-white"
                            />
                        </form>

                        <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                            <CalendarDays size={15} className="text-teal-600 dark:text-teal-400" />
                            <span>{formatDashboardDate(language)}</span>
                        </div>

                        <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                            <span>{t('common.liveData')}</span>
                            <span className="h-3 w-px bg-emerald-500/30" />
                            <time dateTime={stats.timestamp} className="font-mono text-[11px]">
                                {formatUpdatedAt(stats.timestamp, language, t)}
                            </time>
                        </div>

                        <button
                            type="button"
                            onClick={refetch}
                            disabled={isFetching}
                            aria-label={isFetching ? t('common.refreshing') : t('common.refresh')}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-teal-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            title={t('common.refresh')}
                        >
                            <RefreshCw size={15} className={isFetching ? 'animate-spin text-teal-500' : ''} />
                        </button>

                        {primaryAction}
                    </div>
                </div>
            </div>

            {/* Operational Priority Cards */}
            <PriorityStrip items={priorityItems} />

            {/* Live Modalities & Equipment Occupancy HUD */}
            <ModalityLiveDeck language={language} isArabic={isArabic} />

            {/* Main Content Areas */}
            {children}
        </div>
    );
};

// ─── Modality Live Occupancy Deck ─────────────────────────────────────

const ModalityLiveDeck = ({ isArabic }) => {
    const modalities = [
        { id: 'mri', name: 'MRI 3.0T Skyra', type: 'MRI', status: 'in_use', currentPatient: 'MRN-8492 · Brain with Contrast', duration: '14 min left' },
        { id: 'ct', name: 'CT Revolution 128', type: 'CT', status: 'in_use', currentPatient: 'MRN-9120 · Chest Low Dose', duration: '6 min left' },
        { id: 'us', name: 'Ultrasound Voluson E10', type: 'US', status: 'ready', currentPatient: isArabic ? 'متاح ومستعد للاستقبال' : 'Ready for next patient', duration: isArabic ? 'جاهز' : 'Idle' },
        { id: 'xr', name: 'Digital X-Ray Multix', type: 'XR', status: 'ready', currentPatient: isArabic ? 'متاح ومستعد للاستقبال' : 'Ready for next patient', duration: isArabic ? 'جاهز' : 'Idle' },
    ];

    return (
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center justify-between gap-4 mb-3.5">
                <div className="flex items-center gap-2">
                    <Radio size={16} className="text-teal-600 dark:text-teal-400 animate-pulse" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        {isArabic ? 'الحالة الحية لغرف وأجهزة الفحص' : 'Live Modalities & Scanner Status'}
                    </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                    {isArabic ? 'تحديث فوري' : 'Real-time telemetry'}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {modalities.map(m => {
                    const isInUse = m.status === 'in_use';
                    return (
                        <div
                            key={m.id}
                            className={`flex flex-col justify-between rounded-2xl border p-3.5 transition-all ${
                                isInUse
                                    ? 'border-sky-500/30 bg-sky-500/5 dark:bg-[var(--VIARA-surface-raised)]'
                                    : 'border-emerald-500/30 bg-emerald-500/5 dark:bg-[var(--VIARA-surface-raised)]'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 shadow-xs">
                                        {m.type}
                                    </span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                                        {m.name}
                                    </span>
                                </div>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                    isInUse
                                        ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isInUse ? 'bg-sky-500 animate-ping' : 'bg-emerald-500'}`} />
                                    <span>{isInUse ? (isArabic ? 'قيد الفحص' : 'Scanning') : (isArabic ? 'جاهز' : 'Available')}</span>
                                </span>
                            </div>
                            <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                <span className="truncate">{m.currentPatient}</span>
                                <span className="shrink-0 font-mono font-bold text-slate-500 dark:text-slate-400">{m.duration}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

// ─── Turnaround SLA Pipeline Gauge ───────────────────────────────────

const TurnaroundPipeline = ({ isArabic }) => {
    const stages = [
        { label: isArabic ? 'الاستقبال والتسجيل' : 'Check-In', time: '6 min', target: '< 10 min', status: 'optimal' },
        { label: isArabic ? 'التحضير السريري' : 'Clinical Prep', time: '8 min', target: '< 15 min', status: 'optimal' },
        { label: isArabic ? 'إجراء الفحص الإشعاعي' : 'Acquisition', time: '18 min', target: '< 25 min', status: 'optimal' },
        { label: isArabic ? 'كتابة التقرير والذكاء الاصطناعي' : 'Reporting & AI', time: '24 min', target: '< 45 min', status: 'optimal' },
        { label: isArabic ? 'الاعتماد النهائي' : 'Verification', time: '10 min', target: '< 20 min', status: 'optimal' },
    ];

    return (
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-center justify-between gap-4 mb-3.5">
                <div className="flex items-center gap-2">
                    <Clock3 size={16} className="text-teal-600 dark:text-teal-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        {isArabic ? 'متوسط زمن الإنجاز لمراحل الفحص (SLA Pipeline)' : 'Clinical Turnaround Time Stages (SLA Pipeline)'}
                    </h3>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={13} />
                    <span>{isArabic ? 'ضمن المعدل القياسي' : 'Within SLA Targets'}</span>
                </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {stages.map((st, i) => (
                    <div key={st.label} className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-center justify-between gap-2">
                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[10px] font-black">
                                {i + 1}
                            </span>
                            <span className="font-mono text-[10px] font-bold text-slate-400">
                                {st.target}
                            </span>
                        </div>
                        <p className="mt-2 text-xs font-black text-slate-900 dark:text-white truncate">
                            {st.label}
                        </p>
                        <p className="mt-0.5 text-base font-black text-teal-600 dark:text-teal-400 tabular-nums">
                            {st.time}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
};

// ─── Reception Dashboard View ─────────────────────────────────────────

const ReceptionDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const isArabic = language?.startsWith('ar');

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
            primaryAction={registerAction && (
                <PrimaryAction
                    icon={registerAction.icon}
                    label={registerAction.label}
                    onClick={registerAction.onClick}
                />
            )}
        >
            <MetricGrid>
                <MetricCardV2
                    icon={UserPlus}
                    tone="cyan"
                    label={t('reception.todayCheckIns')}
                    value={formatNumber(stats.todayCheckIns, language)}
                    change={stats.checkInsChange}
                    detail={t('common.vsPreviousDay')}
                />
                <MetricCardV2
                    icon={CalendarCheck2}
                    tone="blue"
                    label={t('reception.appointments')}
                    value={formatNumber(stats.appointments, language)}
                    detail={t('reception.pendingAppointments', { count: formatNumber(stats.appointmentsPending, language) })}
                    onClick={appointmentsAction?.onClick}
                />
                <MetricCardV2
                    icon={Clock3}
                    tone="amber"
                    label={t('reception.waitingRoom')}
                    value={formatNumber(stats.waitingRoom, language)}
                    detail={t('reception.averageWait', { duration: formatDashboardDuration(stats.averageWaitMinutes, language) })}
                />
                <MetricCardV2
                    icon={CheckCircle2}
                    tone="emerald"
                    label={t('reception.completedToday')}
                    value={formatNumber(stats.completed, language)}
                    change={stats.completedChange}
                    detail={t('common.vsPreviousDay')}
                />
            </MetricGrid>

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

                <ActivityPanel activities={stats.recentActivity} language={language} />
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
    const distribution = normalizeDistribution(stats.modalityDistribution);
    const cycleMetric = stats.cycleMetric || ({ Radiologist: 'report', Technician: 'scan', Nurse: 'preparation' }[user?.role] || 'report');
    const metricCopy = key => t(`clinical.metrics.${cycleMetric}.${key}`);

    const worklistAction = buildNavAction(user, navigate, {
        icon: Stethoscope,
        label: t('actions.openWorklist'),
        description: t('actions.openWorklistDescription'),
        to: '/worklist',
        permissions: ['VIEW_REPORTS', 'WRITE_REPORTS', 'PERFORM_EXAMS', 'MANAGE_QUEUE'],
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
            primaryAction={worklistAction && (
                <PrimaryAction
                    icon={worklistAction.icon}
                    label={worklistAction.label}
                    onClick={worklistAction.onClick}
                />
            )}
        >
            <MetricGrid>
                <MetricCardV2
                    icon={ClipboardList}
                    tone="amber"
                    label={metricCopy('pending')}
                    value={formatNumber(stats.pendingReports, language)}
                    detail={t(`clinical.metrics.${cycleMetric}.urgent`, { count: formatNumber(stats.urgentCases, language) })}
                    onClick={worklistAction?.onClick}
                />
                <MetricCardV2
                    icon={CheckCircle2}
                    tone="emerald"
                    label={metricCopy('completedToday')}
                    value={formatNumber(stats.completedToday, language)}
                    change={stats.completedTodayChange}
                    detail={t('common.vsPreviousDay')}
                />
                <MetricCardV2
                    icon={ScanLine}
                    tone="blue"
                    label={metricCopy('completedWeek')}
                    value={formatNumber(stats.thisWeek, language)}
                    change={stats.weekChange}
                    detail={t('common.vsPreviousWeek')}
                />
                <MetricCardV2
                    icon={Clock3}
                    tone="violet"
                    label={metricCopy('averageCycle')}
                    value={formatDashboardDuration((stats.averageTurnaroundHours || 0) * 60, language)}
                    detail={t(`clinical.metrics.${cycleMetric}.oldest`, { hours: formatDecimal(stats.oldestPendingHours, language) })}
                />
            </MetricGrid>

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

            {/* Turnaround SLA Pipeline */}
            <TurnaroundPipeline isArabic={isArabic} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
                <DistributionPanel
                    data={distribution}
                    title={t('clinical.workloadDistribution')}
                    description={metricCopy('workloadDescription')}
                />
                <ActivityPanel activities={stats.recentActivity} language={language} />
            </div>

            <QuickActions actions={quickActions} />
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
        permissions: ['VIEW_REPORTS', 'WRITE_REPORTS', 'PERFORM_EXAMS', 'MANAGE_QUEUE'],
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
            priorityItems={getExecutivePriorityItems(stats, language, t)}
            primaryAction={analyticsAction && (
                <PrimaryAction
                    icon={analyticsAction.icon}
                    label={analyticsAction.label}
                    onClick={analyticsAction.onClick}
                />
            )}
        >
            <MetricGrid>
                <MetricCardV2
                    icon={ScanLine}
                    tone="cyan"
                    label={t('executive.weeklyScans')}
                    value={formatNumber(stats.totalScans, language)}
                    change={stats.scansChange}
                    detail={t('common.vsPreviousWeek')}
                />
                <MetricCardV2
                    icon={CircleDollarSign}
                    tone="emerald"
                    label={t('executive.weeklyRevenue')}
                    value={formatCurrency(stats.revenueAmount, language)}
                    change={stats.revenueChange}
                    detail={t('common.vsPreviousWeek')}
                    onClick={financialsAction?.onClick}
                />
                <MetricCardV2
                    icon={ClipboardList}
                    tone="amber"
                    label={t('executive.openWork')}
                    value={formatNumber(stats.openWork, language)}
                    detail={t('executive.scansToday', { count: formatNumber(stats.scansToday, language) })}
                    onClick={worklistAction?.onClick}
                />
                <MetricCardV2
                    icon={UsersRound}
                    tone="violet"
                    label={t('executive.activeStaff')}
                    value={formatNumber(stats.activeStaff, language)}
                    detail={t('executive.staffOnLeave', { count: formatNumber(stats.staffOnLeave, language) })}
                    onClick={staffAction?.onClick}
                />
            </MetricGrid>

            {/* Turnaround SLA Pipeline */}
            <TurnaroundPipeline isArabic={isArabic} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
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
                            <div className="h-80 w-full">
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

                <DistributionPanel
                    data={distribution}
                    title={t('executive.modalityMix')}
                    description={t('executive.modalityDescription')}
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
                <QuickActions actions={quickActions} />
                <ActivityPanel activities={stats.recentActivity} language={language} />
            </div>
        </DashboardShell>
    );
};

// ─── Metric Grid & MetricCard Component ───────────────────────────────

const MetricGrid = ({ children }) => (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {children}
    </section>
);

const metricToneMap = {
    cyan: {
        badge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        glow: 'from-cyan-500/10'
    },
    blue: {
        badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
        glow: 'from-sky-500/10'
    },
    emerald: {
        badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        glow: 'from-emerald-500/10'
    },
    amber: {
        badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        glow: 'from-amber-500/10'
    },
    violet: {
        badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
        glow: 'from-purple-500/10'
    },
    rose: {
        badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
        glow: 'from-rose-500/10'
    },
};

const MetricCardV2 = ({ icon: Icon, tone = 'cyan', label, value, change, detail, onClick }) => {
    const toneConfig = metricToneMap[tone] || metricToneMap.cyan;
    const isPositiveChange = change !== undefined && toNumber(change) >= 0;
    const isNegativeChange = change !== undefined && toNumber(change) < 0;

    const CardTag = onClick ? 'button' : 'div';

    return (
        <CardTag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-5 text-start shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700 ${
                onClick ? 'cursor-pointer active:scale-[0.99]' : ''
            }`}
        >
            <div className={`pointer-events-none absolute -end-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-bl ${toneConfig.glow} to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity`} />

            <div className="flex items-start justify-between gap-3">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${toneConfig.badge}`}>
                    <Icon size={22} />
                </div>
                {change !== undefined && (
                    <span
                        className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-black tabular-nums ${
                            isPositiveChange
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        }`}
                    >
                        {isPositiveChange ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        <span>{Math.abs(toNumber(change))}%</span>
                    </span>
                )}
            </div>

            <div className="mt-4 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                    {label}
                </p>
                <p className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl tabular-nums">
                    {value || '0'}
                </p>
                {detail && (
                    <p className="mt-1.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {detail}
                    </p>
                )}
            </div>
        </CardTag>
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
            {visibleItems.map(({ key, icon: Icon, tone = 'cyan', label, value, detail }) => (
                <article
                    key={key}
                    className={`group relative flex min-h-[92px] items-center gap-3.5 rounded-2xl border p-4 shadow-sm backdrop-blur-xl transition-all hover:shadow-md ${
                        priorityToneStyles[tone] || priorityToneStyles.cyan
                    }`}
                >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 dark:bg-slate-900/80 shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                        <Icon size={20} className="text-current" />
                    </span>
                    <div className="min-w-0">
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
                </article>
            ))}
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

const ActivityPanel = ({ activities = [], language }) => {
    const { t } = useTranslation('dashboard');
    const isArabic = language?.startsWith('ar');
    const [activityFilter, setActivityFilter] = useState('all');

    const filteredActivities = useMemo(() => {
        if (activityFilter === 'all') return activities;
        return activities.filter(a => {
            const msg = (a.message || '').toLowerCase();
            if (activityFilter === 'reports') return msg.includes('report') || msg.includes('تقرير') || msg.includes('finalized');
            if (activityFilter === 'checkin') return msg.includes('arrived') || msg.includes('check') || msg.includes('وصول');
            return true;
        });
    }, [activities, activityFilter]);

    return (
        <PagePanel
            title={t('activity.title')}
            description={t('activity.description')}
            action={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('common.live')}</span>
                </span>
            }
        >
            {/* Filter Pills */}
            <div className="flex gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
                {[
                    { id: 'all', label: isArabic ? 'الكل' : 'All' },
                    { id: 'reports', label: isArabic ? 'التقارير' : 'Reports' },
                    { id: 'checkin', label: isArabic ? 'الاستقبال' : 'Arrivals' }
                ].map(f => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setActivityFilter(f.id)}
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
                                    {activity.message || t('activity.scanFinalized', { modality: activity.modality || t('common.imagingStudy'), mrn: activity.mrn || '-' })}
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
                    <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{t('activity.empty')}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('activity.emptyDescription')}</p>
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
    <div className="space-y-6 animate-pulse">
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
    const effectivePermissions = new Set([...(user?.permissions || []), ...(user?.elevatedPermissions || [])]);
    return required.some(permission => effectivePermissions.has(permission));
};

const canUseAction = (user, { to, permissions }) => (
    (!to || canAccessRoute(to, user?.role)) && hasAnyUserPermission(user, permissions)
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
        value: formatNumber(stats.urgentCases, language),
        detail: t(`clinical.metrics.${cycleMetric}.urgent`, { count: formatNumber(stats.urgentCases, language) }),
    },
    {
        key: 'oldest',
        icon: Clock3,
        tone: toNumber(stats.oldestPendingHours) >= 24 ? 'amber' : 'cyan',
        label: t('priorities.oldestOpen', { defaultValue: 'Oldest open' }),
        value: t('common.hoursValue', { value: formatDecimal(stats.oldestPendingHours, language) }),
        detail: t(`clinical.metrics.${cycleMetric}.oldest`, { hours: formatDecimal(stats.oldestPendingHours, language) }),
    },
    {
        key: 'completed',
        icon: CheckCircle2,
        tone: 'emerald',
        label: t('priorities.completedToday', { defaultValue: 'Completed today' }),
        value: formatNumber(stats.completedToday, language),
        detail: t('common.vsPreviousDay'),
    },
];

const getExecutivePriorityItems = (stats, language, t) => [
    {
        key: 'openWork',
        icon: ListChecks,
        tone: toNumber(stats.openWork) > 0 ? 'amber' : 'emerald',
        label: t('priorities.openWork', { defaultValue: 'Open work' }),
        value: formatNumber(stats.openWork, language),
        detail: t('executive.scansToday', { count: formatNumber(stats.scansToday, language) }),
    },
    {
        key: 'collections',
        icon: CircleDollarSign,
        tone: 'emerald',
        label: t('priorities.collections', { defaultValue: 'Collections' }),
        value: formatCurrency(stats.revenueAmount, language),
        detail: t('common.vsPreviousWeek'),
    },
    {
        key: 'staffing',
        icon: UsersRound,
        tone: toNumber(stats.staffOnLeave) > 0 ? 'violet' : 'cyan',
        label: t('priorities.staffing', { defaultValue: 'Staffing' }),
        value: formatNumber(stats.activeStaff, language),
        detail: t('executive.staffOnLeave', { count: formatNumber(stats.staffOnLeave, language) }),
    },
];

const formatNumber = (value, language = 'en') => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 }).format(toNumber(value));
const formatDecimal = (value, language = 'en') => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 1 }).format(toNumber(value));
const formatDashboardDuration = (minutes, language = 'en') => {
    const normalizedMinutes = toNumber(minutes);
    if (language === 'ar') return formatDuration(normalizedMinutes, 'ar-EG');
    if (normalizedMinutes < 60) return `${formatDecimal(normalizedMinutes, 'en')} min`;
    return `${formatDecimal(normalizedMinutes / 60, 'en')} hr`;
};
const formatCurrency = (value, language = 'en') => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(toNumber(value));

const formatWeekday = (value, language = 'en') => {
    const datePart = String(value).slice(0, 10);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short' }).format(new Date(`${datePart}T12:00:00`));
};

const formatDashboardDate = (language = 'en') => new Intl.DateTimeFormat(
    language === 'ar' ? 'ar-EG' : 'en-US',
    { weekday: 'short', month: 'short', day: 'numeric' },
).format(new Date());

const formatUpdatedAt = (timestamp, language, t) => {
    if (!timestamp) return t('common.awaitingSync');
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
};

const formatRelativeTime = (timestamp, language = 'en', fallback = '') => {
    if (!timestamp) return fallback;
    const seconds = Math.round((new Date(timestamp).getTime() - Date.now()) / 1000);
    const absolute = Math.abs(seconds);
    const [divisor, unit] = absolute < 60 ? [1, 'second'] : absolute < 3600 ? [60, 'minute'] : absolute < 86400 ? [3600, 'hour'] : [86400, 'day'];
    return new Intl.RelativeTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
};

export default DashboardHome;
