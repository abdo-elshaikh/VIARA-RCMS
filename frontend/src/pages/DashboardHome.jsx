import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    Activity, AlertTriangle, ArrowUpRight, CalendarCheck2, CalendarDays, CheckCircle2, CircleDollarSign,
    ClipboardList, Clock3, FileSearch, Gauge, LayoutDashboard, Package, RefreshCw,
    ScanLine, Stethoscope, UserPlus, UsersRound, WalletCards,
} from 'lucide-react';
import { selectCurrentUser } from '../store/authSlice';
import { useGetDashboardStatsQuery } from '../store/api';
import { formatDuration } from '../utils/dateFormat';
import { AccessibleChartData, PageHeader, MetricCard, PagePanel } from '../components/ui';

const chartTooltipStyle = {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(8px)',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.1)',
    fontSize: '13px',
    fontWeight: '600',
    padding: '12px 16px',
    color: '#0f172a'
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

const DashboardShell = ({ user, stats, isFetching, refetch, language, eyebrow, title, subtitle, primaryAction, children }) => {
    const { t } = useTranslation('dashboard');
    const userName = user?.full_name || user?.name || stats.userName || t('common.teamMember');
    const role = t(`roles.${user?.role}`, user?.role || t('roles.Admin'));

    return (
        <div className="space-y-5 sm:space-y-6">
            <PageHeader
                icon={LayoutDashboard}
                eyebrowIcon={Activity}
                eyebrow={eyebrow}
                title={title}
                description={subtitle}
                actions={
                    <div className="flex flex-col gap-3 sm:items-end">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <CalendarDays size={15} className="text-teal-600 dark:text-teal-300" />{formatDashboardDate(language)}
                            </span>
                            {primaryAction}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex min-h-9 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
                                <span>{t('common.liveData')}</span>
                                <span className="h-3 w-px bg-emerald-200 dark:bg-emerald-800" aria-hidden="true" />
                                <time dateTime={stats.timestamp}>{formatUpdatedAt(stats.timestamp, language, t)}</time>
                            </div>
                            <button type="button" onClick={refetch} disabled={isFetching} aria-label={isFetching ? t('common.refreshing') : t('common.refresh')} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/60 bg-white/80 text-slate-600 transition hover:bg-slate-50 hover:text-teal-700 disabled:cursor-wait disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-teal-300">
                                <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                }
            >
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{t('common.welcome', { name: userName })}</span>
                    <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">{role}</span>
                </div>
            </PageHeader>
            {children}
        </div>
    );
};

const ReceptionDashboard = props => {
    const { stats, language, t } = props;
    const navigate = useNavigate();
    const flow = (stats.patientFlowData || []).map(item => ({
        ...item, waiting: toNumber(item.waiting), in_progress: toNumber(item.in_progress), completed: toNumber(item.completed),
    }));

    return (
        <DashboardShell
            {...props}
            eyebrow={t('reception.eyebrow')} title={t('reception.title')} subtitle={t('reception.subtitle')}
            primaryAction={<PrimaryAction icon={UserPlus} label={t('actions.registerPatient')} onClick={() => navigate('/reception')} />}
        >
            <MetricGrid>
                <MetricCard icon={UserPlus} tone="cyan" label={t('reception.todayCheckIns')} value={formatNumber(stats.todayCheckIns, language)} change={stats.checkInsChange} detail={t('common.vsPreviousDay')} />
                <MetricCard icon={CalendarCheck2} tone="blue" label={t('reception.appointments')} value={formatNumber(stats.appointments, language)} detail={t('reception.pendingAppointments', { count: formatNumber(stats.appointmentsPending, language) })} onClick={() => navigate('/appointments')} />
                <MetricCard icon={Clock3} tone="amber" label={t('reception.waitingRoom')} value={formatNumber(stats.waitingRoom, language)} detail={t('reception.averageWait', { duration: formatDashboardDuration(stats.averageWaitMinutes, language) })} />
                <MetricCard icon={CheckCircle2} tone="emerald" label={t('reception.completedToday')} value={formatNumber(stats.completed, language)} change={stats.completedChange} detail={t('common.vsPreviousDay')} />
            </MetricGrid>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)]">
                <PagePanel title={t('reception.patientFlow')} description={t('reception.patientFlowDescription')} action={<PanelBadge>{t('common.today')}</PanelBadge>}>
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
                            <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={flow} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="waitingArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                        <linearGradient id="completedArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={chartTooltipStyle} />
                                    <Area type="monotone" dataKey="waiting" name={t('flow.waiting')} stroke="#f59e0b" strokeWidth={3} fill="url(#waitingArea)" />
                                    <Area type="monotone" dataKey="in_progress" name={t('flow.inProgress')} stroke="#3b82f6" strokeWidth={3} fill="url(#progressArea)" />
                                    <Area type="monotone" dataKey="completed" name={t('flow.completed')} stroke="#10b981" strokeWidth={3} fill="url(#completedArea)" />
                                </AreaChart>
                            </ResponsiveContainer></div>
                        </ChartData>
                    ) : <ChartEmpty />}
                    <ChartLegend items={[[t('flow.waiting'), '#f59e0b'], [t('flow.inProgress'), '#3b82f6'], [t('flow.completed'), '#10b981']]} />
                </PagePanel>
                <ActivityPanel activities={stats.recentActivity} language={language} />
            </div>

            <QuickActions actions={[
                { icon: UserPlus, label: t('actions.registerPatient'), description: t('actions.registerPatientDescription'), onClick: () => navigate('/reception') },
                { icon: CalendarCheck2, label: t('actions.manageSchedule'), description: t('actions.manageScheduleDescription'), onClick: () => navigate('/appointments') },
                { icon: FileSearch, label: t('actions.patientRegistry'), description: t('actions.patientRegistryDescription'), onClick: () => navigate('/patients') },
            ]} />
        </DashboardShell>
    );
};

const ClinicalDashboard = props => {
    const { user, stats, language, t } = props;
    const navigate = useNavigate();
    const distribution = normalizeDistribution(stats.modalityDistribution);
    const cycleMetric = stats.cycleMetric || ({ Radiologist: 'report', Technician: 'scan', Nurse: 'preparation' }[user?.role] || 'report');
    const metricCopy = key => t(`clinical.metrics.${cycleMetric}.${key}`);

    return (
        <DashboardShell
            {...props}
            eyebrow={t('clinical.eyebrow')} title={t('clinical.title')} subtitle={metricCopy('subtitle')}
            primaryAction={<PrimaryAction icon={Stethoscope} label={t('actions.openWorklist')} onClick={() => navigate('/worklist')} />}
        >
            <MetricGrid>
                <MetricCard icon={ClipboardList} tone="amber" label={metricCopy('pending')} value={formatNumber(stats.pendingReports, language)} detail={t(`clinical.metrics.${cycleMetric}.urgent`, { count: formatNumber(stats.urgentCases, language) })} onClick={() => navigate('/worklist')} />
                <MetricCard icon={CheckCircle2} tone="emerald" label={metricCopy('completedToday')} value={formatNumber(stats.completedToday, language)} change={stats.completedTodayChange} detail={t('common.vsPreviousDay')} />
                <MetricCard icon={ScanLine} tone="blue" label={metricCopy('completedWeek')} value={formatNumber(stats.thisWeek, language)} change={stats.weekChange} detail={t('common.vsPreviousWeek')} />
                <MetricCard icon={Clock3} tone="violet" label={metricCopy('averageCycle')} value={formatDashboardDuration((stats.averageTurnaroundHours || 0) * 60, language)} detail={t(`clinical.metrics.${cycleMetric}.oldest`, { hours: formatDecimal(stats.oldestPendingHours, language) })} />
            </MetricGrid>

            {toNumber(stats.urgentCases) > 0 && (
                <button type="button" onClick={() => navigate('/worklist')} className="flex w-full flex-col gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-5 text-start transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-red-500/10 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 ring-4 ring-red-100/50 dark:ring-red-900/50"><AlertTriangle size={20} /></span>
                        <span>
                            <span className="block font-bold text-red-950 dark:text-red-200 text-base">{metricCopy('attentionTitle')}</span>
                            <span className="mt-0.5 block text-sm font-medium text-red-800/80 dark:text-red-300/80">{t(`clinical.metrics.${cycleMetric}.attentionDescription`, { count: formatNumber(stats.urgentCases, language) })}</span>
                        </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-red-950 px-4 py-2 text-sm font-bold text-red-600 dark:text-red-400 shadow-sm transition hover:bg-red-50 dark:hover:bg-red-900/50">
                        {t('actions.reviewNow')}<ArrowUpRight size={16} className="rtl-flip" />
                    </span>
                </button>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
                <DistributionPanel data={distribution} title={t('clinical.workloadDistribution')} description={metricCopy('workloadDescription')} />
                <ActivityPanel activities={stats.recentActivity} language={language} />
            </div>

            <QuickActions actions={[
                { icon: Stethoscope, label: t('actions.openWorklist'), description: t('actions.openWorklistDescription'), onClick: () => navigate('/worklist') },
                { icon: CalendarCheck2, label: t('actions.viewSchedule'), description: t('actions.viewScheduleDescription'), onClick: () => navigate('/appointments') },
                { icon: FileSearch, label: t('actions.patientRegistry'), description: t('actions.patientRegistryDescription'), onClick: () => navigate('/patients') },
            ]} />
        </DashboardShell>
    );
};

const ExecutiveDashboard = props => {
    const { stats, language, t } = props;
    const navigate = useNavigate();
    const performance = (stats.scanVolumeData || []).map(item => ({
        ...item, name: item.date ? formatWeekday(item.date, language) : item.name, scans: toNumber(item.scans), revenue: toNumber(item.revenue),
    }));
    const distribution = normalizeDistribution(stats.modalityData);

    return (
        <DashboardShell
            {...props}
            eyebrow={t('executive.eyebrow')} title={t('executive.title')} subtitle={t('executive.subtitle')}
            primaryAction={<PrimaryAction icon={Gauge} label={t('actions.openAnalytics')} onClick={() => navigate('/analytics')} />}
        >
            <MetricGrid>
                <MetricCard icon={ScanLine} tone="cyan" label={t('executive.weeklyScans')} value={formatNumber(stats.totalScans, language)} change={stats.scansChange} detail={t('common.vsPreviousWeek')} />
                <MetricCard icon={CircleDollarSign} tone="emerald" label={t('executive.weeklyRevenue')} value={formatCurrency(stats.revenueAmount, language)} change={stats.revenueChange} detail={t('common.vsPreviousWeek')} onClick={() => navigate('/financials')} />
                <MetricCard icon={ClipboardList} tone="amber" label={t('executive.openWork')} value={formatNumber(stats.openWork, language)} detail={t('executive.scansToday', { count: formatNumber(stats.scansToday, language) })} onClick={() => navigate('/worklist')} />
                <MetricCard icon={UsersRound} tone="violet" label={t('executive.activeStaff')} value={formatNumber(stats.activeStaff, language)} detail={t('executive.staffOnLeave', { count: formatNumber(stats.staffOnLeave, language) })} onClick={() => navigate('/users')} />
            </MetricGrid>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
                <PagePanel title={t('executive.weeklyPerformance')} description={t('executive.performanceDescription')} action={<PanelBadge>{t('common.currentWeek')}</PanelBadge>}>
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
                            <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={performance} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="scans" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="revenue" orientation="right" tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => name === t('executive.revenue') ? formatCurrency(value, language) : formatNumber(value, language)} />
                                    <Bar yAxisId="scans" dataKey="scans" name={t('executive.scans')} fill="#0ea5e9" radius={[8, 8, 0, 0]} maxBarSize={48} />
                                    <Line yAxisId="revenue" type="monotone" dataKey="revenue" name={t('executive.revenue')} stroke="#10b981" strokeWidth={4} dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} />
                                </ComposedChart>
                            </ResponsiveContainer></div>
                        </ChartData>
                    ) : <ChartEmpty />}
                    <ChartLegend items={[[t('executive.scans'), '#0ea5e9'], [t('executive.revenue'), '#10b981']]} />
                </PagePanel>
                <DistributionPanel data={distribution} title={t('executive.modalityMix')} description={t('executive.modalityDescription')} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
                <QuickActions actions={[
                    { icon: UsersRound, label: t('actions.manageStaff'), description: t('actions.manageStaffDescription'), onClick: () => navigate('/users') },
                    { icon: WalletCards, label: t('actions.financials'), description: t('actions.financialsDescription'), onClick: () => navigate('/financials') },
                    { icon: Package, label: t('actions.inventory'), description: t('actions.inventoryDescription'), onClick: () => navigate('/inventory') },
                    { icon: Gauge, label: t('actions.openAnalytics'), description: t('actions.openAnalyticsDescription'), onClick: () => navigate('/analytics') },
                ]} />
                <ActivityPanel activities={stats.recentActivity} language={language} />
            </div>
        </DashboardShell>
    );
};

const MetricGrid = ({ children }) => <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{children}</section>;

const PanelBadge = ({ children }) => <span className="shrink-0 rounded-full border border-cyan-100 dark:border-cyan-900/50 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">{children}</span>;

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
                        <div className="h-56"><ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} cornerRadius={4}>
                                    {data.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={entry.color} />)}
                                </Pie>
                                <Tooltip contentStyle={chartTooltipStyle} />
                            </PieChart>
                        </ResponsiveContainer></div>
                    </ChartData>
                    <div className="mt-4 grid gap-2 grid-cols-2">
                        {data.map(item => (
                            <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
                                <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-semibold truncate"><span className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />{item.name}</span>
                                <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : <ChartEmpty label={t('common.noDistribution')} />}
        </PagePanel>
    );
};

const ActivityPanel = ({ activities = [], language }) => {
    const { t } = useTranslation('dashboard');
    return (
        <PagePanel title={t('activity.title')} description={t('activity.description')} action={<span className="flex items-center gap-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />{t('common.live')}</span>}>
            {activities.length > 0 ? (
                <div className="flex-1 overflow-auto pe-2 mt-2">
                    <ol className="relative border-s border-slate-100 dark:border-slate-800 ms-3">
                        {activities.map((activity, index) => (
                            <li key={`${activity.timestamp || activity.time}-${index}`} className="mb-6 ms-6 last:mb-0">
                                <span className="absolute -start-[11px] flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 ring-4 ring-white dark:ring-[#0b1426]"><CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" /></span>
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{activity.message || t('activity.scanFinalized', { modality: activity.modality || t('common.imagingStudy'), mrn: activity.mrn || '—' })}</p>
                                <time className="mt-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500" dateTime={activity.timestamp}>{formatRelativeTime(activity.timestamp, language, activity.time)}</time>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : <div className="flex-1 flex flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500"><Activity size={24} /></span><p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{t('activity.empty')}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('activity.emptyDescription')}</p></div>}
        </PagePanel>
    );
};

const QuickActionButton = ({ icon: Icon, label, description, onClick }) => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    return (
        <button
            type="button"
            onClick={onClick}
            onMouseMove={handleMouseMove}
            className="group relative overflow-hidden flex min-h-[100px] items-center gap-4 rounded-2xl border border-slate-200/60 bg-white/50 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/40 p-4 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 dark:hover:border-cyan-800 hover:bg-white/80 dark:hover:bg-slate-900/80 hover:shadow-lg hover:shadow-cyan-900/5"
        >
            <div
                className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    background: `radial-gradient(300px circle at ${mousePos.x}px ${mousePos.y}px, rgba(8, 145, 178, 0.12), transparent 40%)`,
                }}
            />
            <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 shadow-sm ring-1 ring-slate-100/50 dark:ring-slate-800 transition-colors group-hover:bg-cyan-50 dark:group-hover:bg-cyan-900/30 group-hover:text-cyan-700 dark:group-hover:text-cyan-400">
                <Icon size={20} />
            </span>
            <span className="relative z-10 min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-200">{label}</span>
                <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{description}</span>
            </span>
            <ArrowUpRight size={18} className="relative z-10 shrink-0 text-slate-300 dark:text-slate-600 transition-colors group-hover:text-cyan-700 dark:group-hover:text-cyan-400 rtl-flip" />
        </button>
    );
};

const QuickActions = ({ actions }) => {
    const { t } = useTranslation('dashboard');
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

const PrimaryAction = ({ icon: Icon, label, onClick }) => <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-slate-900 to-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] dark:from-white dark:to-slate-100 dark:text-slate-950"><Icon size={18} /><span>{label}</span></button>;

const ChartLegend = ({ items }) => <div className="mt-4 flex flex-wrap justify-center gap-5">{items.map(([label, color]) => <span key={label} className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />{label}</span>)}</div>;

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
    return <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-slate-50/50 dark:bg-slate-900/30 text-center p-6"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-[#0b1426] text-slate-400 dark:text-slate-500 shadow-sm"><Gauge size={24} /></span><p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{label || t('common.noChartData')}</p><p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('common.noChartDataDescription')}</p></div>;
};

const DashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        <div className="h-48 rounded-3xl bg-slate-200/50 dark:bg-slate-800/50" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-36 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50" />)}</div>
        <div className="grid gap-5 xl:grid-cols-3"><div className="h-96 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50 xl:col-span-2" /><div className="h-96 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50" /></div>
    </div>
);

const DashboardError = ({ error, onRetry }) => {
    const { t } = useTranslation('dashboard');
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="w-full max-w-md rounded-3xl border border-red-100 dark:border-red-900/50 bg-white dark:bg-[#0b1426] p-8 text-center shadow-lg shadow-red-500/5"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400"><AlertTriangle size={28} /></span><h1 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">{t('error.title')}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error?.data?.message || t('error.description')}</p><button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-red-400 hover:shadow-lg hover:shadow-red-500/20"><RefreshCw size={18} />{t('error.retry')}</button></div></div>;
};

const normalizeDistribution = data => (data || []).map((item, index) => ({
    name: item.name || 'N/A', value: toNumber(item.value), color: item.color || modalityColors[index % modalityColors.length],
})).filter(item => item.value > 0);

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
