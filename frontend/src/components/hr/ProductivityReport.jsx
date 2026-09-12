import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Clock, Download, Filter, Gauge, Medal, RefreshCw, Sparkles, Target, Timer, TrendingUp, Trophy, Users, Wallet, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetProductivityReportQuery } from '../../store/api';

const toDateInputValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const asCount = value => Number(value || 0);
const asMinutes = value => value === null || value === undefined ? null : Number(value);

// Utilization tone: 85–110% is the healthy band (worked roughly matches the
// roster); below means idle time, above means unplanned overtime.
const utilizationTone = (percent) => {
    if (percent === null) return { bar: 'bg-slate-300 dark:bg-slate-700', text: 'text-slate-400' };
    if (percent < 60) return { bar: 'bg-rose-400', text: 'text-rose-600 dark:text-rose-400' };
    if (percent < 85) return { bar: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
    if (percent <= 110) return { bar: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400' };
    return { bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' };
};

const ROLE_CONFIG = {
    Receptionist: {
        titleKey: 'receptionistTitle',
        metricLabelKey: 'tasksCompleted',
        metricNameKey: 'tasksCompletedLong',
        secondary: row => asMinutes(row.avg_handling_minutes) !== null
            ? { icon: Timer, key: 'avgHandling', value: row.avg_handling_minutes }
            : null
    },
    Technician: {
        titleKey: 'technicianTitle',
        metricLabelKey: 'examsCompleted',
        metricNameKey: 'examsCompletedLong',
        secondary: row => asMinutes(row.avg_exam_minutes) !== null
            ? { icon: Timer, key: 'avgExam', value: row.avg_exam_minutes }
            : null
    },
    Radiologist: {
        titleKey: 'radiologistTitle',
        metricLabelKey: 'reportsFinalized',
        metricNameKey: 'reportsFinalizedLong',
        secondary: row => asMinutes(row.avg_turnaround_minutes) !== null
            ? { icon: Timer, key: 'avgTurnaround', value: row.avg_turnaround_minutes }
            : null
    },
    Cashier: {
        titleKey: 'cashierTitle',
        metricLabelKey: 'paymentsProcessed',
        metricNameKey: 'paymentsProcessedLong',
        secondary: row => asCount(row.total_collected) > 0
            ? { icon: Wallet, key: 'collected', value: Number(row.total_collected) }
            : null
    }
};

const ProductivityReport = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`hr.productivity.${key}`, options);
    const isArabic = i18n.language.startsWith('ar');
    const now = new Date();

    const [dateRange, setDateRange] = useState({
        startDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toDateInputValue(now)
    });

    const dateRangeInvalid = Boolean(dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate);
    const { data: report = [], isLoading, isError, isFetching, refetch } = useGetProductivityReportQuery(dateRange, { skip: dateRangeInvalid });

    const [activeRole, setActiveRole] = useState('all');

    const roleGroups = useMemo(() => {
        const groups = new Map();
        for (const row of report) {
            if (!groups.has(row.role)) groups.set(row.role, []);
            groups.get(row.role).push(row);
        }
        for (const [, rows] of groups) {
            rows.sort((a, b) => asCount(b.metric_count) - asCount(a.metric_count));
        }
        return groups;
    }, [report]);

    const visibleGroups = useMemo(() => {
        if (activeRole === 'all') return [...roleGroups.entries()];
        return activeRole && roleGroups.has(activeRole) ? [[activeRole, roleGroups.get(activeRole)]] : [];
    }, [activeRole, roleGroups]);

    // Team-level rollup: total output, effort, and efficiency averages.
    const teamSummary = useMemo(() => {
        const totalOutput = report.reduce((sum, row) => sum + asCount(row.metric_count), 0);
        const totalWorkedHours = report.reduce((sum, row) => sum + Number(row.worked_hours || 0), 0);
        const totalScheduledHours = report.reduce((sum, row) => sum + Number(row.scheduled_hours || 0), 0);
        const totalLateMinutes = report.reduce((sum, row) => sum + asCount(row.late_minutes), 0);
        const workersWithOutput = report.filter(row => asCount(row.metric_count) > 0);
        const avgRate = workersWithOutput.length
            ? workersWithOutput.reduce((sum, row) => sum + (row.output_per_hour ? Number(row.output_per_hour) : 0), 0) / workersWithOutput.length
            : 0;
        const scheduledWorkers = report.filter(row => row.utilization_percent !== null && row.utilization_percent !== undefined);
        const avgUtilization = scheduledWorkers.length
            ? scheduledWorkers.reduce((sum, row) => sum + Number(row.utilization_percent), 0) / scheduledWorkers.length
            : null;
        return {
            totalOutput,
            totalWorkedHours,
            totalScheduledHours,
            totalLateMinutes,
            avgRate,
            avgUtilization
        };
    }, [report]);

    const setDate = (field, value) => setDateRange(current => ({ ...current, [field]: value }));

    const applyRangePreset = (days) => {
        const end = new Date();
        const start = new Date();
        if (days === 'month') {
            start.setDate(1);
        } else if (days === 'quarter') {
            const currentQuarterMonth = Math.floor(start.getMonth() / 3) * 3;
            start.setMonth(currentQuarterMonth, 1);
        } else {
            start.setDate(start.getDate() - days);
        }

        setDateRange({
            startDate: toDateInputValue(start),
            endDate: toDateInputValue(end)
        });
    };

    const exportToCSV = () => {
        if (report.length === 0) {
            toast.error(copy('noData'));
            return;
        }

        const headers = [
            copy('csvName'), copy('csvRole'), copy('csvOutput'),
            copy('csvWorkedHours'), copy('csvScheduledHours'),
            copy('csvOutputPerHour'), copy('csvUtilization'),
            copy('csvLateMinutes'), copy('csvSecondary')
        ];
        const rows = [headers.join(',')];

        report.forEach(r => {
            const secondary = [
                asMinutes(r.avg_handling_minutes) !== null ? `${copy('avgHandling')}: ${r.avg_handling_minutes}` : '',
                asMinutes(r.avg_exam_minutes) !== null ? `${copy('avgExam')}: ${r.avg_exam_minutes}` : '',
                asMinutes(r.avg_turnaround_minutes) !== null ? `${copy('avgTurnaround')}: ${r.avg_turnaround_minutes}` : '',
                asCount(r.total_collected) > 0 ? `${copy('collected')}: ${r.total_collected}` : ''
            ].filter(Boolean).join(' | ');
            rows.push([
                `"${r.full_name || ''}"`,
                `"${r.role || ''}"`,
                asCount(r.metric_count),
                Number(r.worked_hours || 0).toFixed(1),
                Number(r.scheduled_hours || 0).toFixed(1),
                r.output_per_hour ?? '',
                r.utilization_percent !== null && r.utilization_percent !== undefined ? `${r.utilization_percent}%` : '',
                asCount(r.late_minutes),
                `"${secondary}"`
            ].join(','));
        });

        const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Productivity_Report_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(copy('exportSuccess'));
    };

    return (
        <div className="space-y-4">
            {/* Team Summary Strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={copy('teamSummary')}>
                <SummaryCard icon={Zap} label={copy('totalOutput')} value={teamSummary.totalOutput} />
                <SummaryCard icon={Clock} label={copy('workedHours')} value={`${teamSummary.totalWorkedHours.toFixed(0)}h`} />
                <SummaryCard icon={Gauge} label={copy('outputPerHourAvg')} value={teamSummary.avgRate ? teamSummary.avgRate.toFixed(1) : '—'} tone="text-teal-600 dark:text-teal-400" />
                <SummaryCard icon={Target} label={copy('avgUtilization')} value={teamSummary.avgUtilization !== null ? `${teamSummary.avgUtilization.toFixed(0)}%` : '—'} tone={utilizationTone(teamSummary.avgUtilization !== null ? Math.round(teamSummary.avgUtilization) : null).text} />
                <SummaryCard icon={Timer} label={copy('lateMinutes')} value={`${teamSummary.totalLateMinutes}m`} tone={teamSummary.totalLateMinutes > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
            </section>

            {/* Main Panel */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60">
                            <Target size={20} />
                        </span>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white sm:text-lg">{copy('title')}</h2>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{copy('description')}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Quick Range Presets */}
                        <div className="hidden sm:flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                            <button
                                type="button"
                                onClick={() => applyRangePreset('month')}
                                className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-white hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                            >
                                {copy('thisMonth')}
                            </button>
                            <button
                                type="button"
                                onClick={() => applyRangePreset(30)}
                                className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-white hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                            >
                                {copy('last30d')}
                            </button>
                        </div>

                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950">
                            <Filter size={13} className="text-slate-400" />
                            <input
                                type="date"
                                aria-label={copy('startDate')}
                                className="border-0 bg-transparent p-0 text-xs font-bold text-slate-700 outline-none dark:text-slate-200"
                                value={dateRange.startDate}
                                onChange={event => setDate('startDate', event.target.value)}
                            />
                            <span className="px-1 text-xs font-black text-slate-400">{copy('to')}</span>
                            <input
                                type="date"
                                aria-label={copy('endDate')}
                                className="border-0 bg-transparent p-0 text-xs font-bold text-slate-700 outline-none dark:text-slate-200"
                                value={dateRange.endDate}
                                onChange={event => setDate('endDate', event.target.value)}
                            />
                        </div>

                        {/* Role filter */}
                        <select
                            value={activeRole}
                            onChange={event => setActiveRole(event.target.value)}
                            aria-label={copy('filterRole')}
                            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                        >
                            <option value="all">{copy('allRoles')}</option>
                            {[...roleGroups.keys()].map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>

                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching || dateRangeInvalid}
                            aria-label={copy('refresh')}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                        </button>

                        <button
                            type="button"
                            onClick={exportToCSV}
                            disabled={report.length === 0}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-700 disabled:opacity-50"
                        >
                            <Download size={14} />
                            <span>{copy('exportCsv')}</span>
                        </button>
                    </div>
                </div>

                {dateRangeInvalid ? (
                    <ErrorState message={copy('dateRangeInvalid')} />
                ) : isError ? (
                    <ErrorState message={copy('loadError')} onRetry={refetch} retryLabel={copy('retry')} />
                ) : (
                    <div className="mt-5 space-y-5">
                        {visibleGroups.map(([role, rows]) => (
                            <PerformancePanel
                                key={role}
                                role={role}
                                rows={rows}
                                copy={copy}
                                t={t}
                                isArabic={isArabic}
                                isLoading={isLoading}
                            />
                        ))}
                        {!isLoading && visibleGroups.length === 0 && (
                            <div className="py-10 text-center text-xs font-bold text-slate-400">{copy('empty')}</div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

const SummaryCard = ({ icon: Icon, label, value, tone = 'text-slate-900 dark:text-white' }) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1.5">
            <Icon size={12} className="text-slate-400" />
            <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
        </div>
        <p className={`mt-1.5 font-mono text-xl font-black ${tone}`}>{value}</p>
    </div>
);

const PerformancePanel = ({ role, rows, copy, t, isArabic, isLoading }) => {
    const config = ROLE_CONFIG[role] || {
        titleKey: null,
        metricLabelKey: 'output',
        metricNameKey: 'output',
        secondary: () => null
    };
    const title = config.titleKey
        ? t(`hr.productivity.${config.titleKey}`, { defaultValue: role })
        : role;
    const metricLabel = t(`hr.productivity.${config.metricLabelKey}`, { defaultValue: copy('output') });
    const maxVal = rows.length > 0 ? Math.max(...rows.map(r => asCount(r.metric_count)), 1) : 1;

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-amber-500" />
                    <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">{title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">{rows.length}</span>
                </div>
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-black uppercase text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                    {metricLabel}
                </span>
            </div>
            <div className="p-4">
                {isLoading ? (
                    <div className="animate-pulse py-8 text-center text-xs font-bold text-slate-400">{copy('loading')}</div>
                ) : rows.length === 0 ? (
                    <div className="py-8 text-center text-xs font-medium text-slate-400">{copy('empty')}</div>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {rows.map((row, index) => (
                            <StaffPerformanceCard
                                key={row.user_id}
                                row={row}
                                rank={index}
                                maxVal={maxVal}
                                config={config}
                                copy={copy}
                                t={t}
                                isArabic={isArabic}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const StaffPerformanceCard = ({ row, rank, maxVal, config, copy, t, isArabic }) => {
    const count = asCount(row.metric_count);
    const percent = Math.min(100, Math.round((count / maxVal) * 100));
    const outputPerHour = row.output_per_hour !== null && row.output_per_hour !== undefined ? Number(row.output_per_hour) : null;
    const utilization = row.utilization_percent !== null && row.utilization_percent !== undefined ? Number(row.utilization_percent) : null;
    const lateMinutes = asCount(row.late_minutes);
    const secondary = config.secondary ? config.secondary(row) : null;
    const tone = utilizationTone(utilization);

    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition hover:bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                        rank === 0
                            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
                            : rank === 1
                                ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400'
                    }`}>
                        {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">{row.full_name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {outputPerHour !== null && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-teal-700 dark:text-teal-300">
                                    <Zap size={9} />
                                    {outputPerHour.toFixed(1)}{copy('perHour')}
                                </span>
                            )}
                            {secondary && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                    <secondary.icon size={9} />
                                    {t(`hr.productivity.${secondary.key}`, { defaultValue: secondary.key })}: {secondary.value}{secondary.key !== 'collected' ? copy('minutesShort') : ''}
                                </span>
                            )}
                            {lateMinutes > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                    {copy('lateBadge', { minutes: lateMinutes })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="shrink-0 text-end">
                    <span className="font-mono text-lg font-black text-slate-900 dark:text-white">{count}</span>
                    <p className="text-[9px] font-bold text-slate-400">{copy('workedHoursShort', { hours: Number(row.worked_hours || 0).toFixed(0) })}</p>
                </div>
            </div>

            {/* Output + effort bars */}
            <div className="mt-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${rank === 0 ? 'bg-amber-500' : 'bg-teal-500'}`}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">{percent}%</span>
                </div>
                <div className="flex items-center gap-2" title={copy('utilization')}>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
                            style={{ width: `${Math.min(100, utilization ?? 0)}%` }}
                        />
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${tone.text}`}>
                        {utilization !== null ? `${utilization}%` : copy('notScheduled')}
                    </span>
                </div>
            </div>
        </div>
    );
};

const ErrorState = ({ message, onRetry, retryLabel }) => (
    <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
        <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{message}</p>
        {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2.5 rounded-xl border border-rose-200 px-3.5 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
                {retryLabel}
            </button>
        )}
    </div>
);

export default ProductivityReport;
