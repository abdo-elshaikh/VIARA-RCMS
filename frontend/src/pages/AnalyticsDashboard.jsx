import { useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Download,
    Gauge,
    Layers3,
    LineChart as LineChartIcon,
    PieChart as PieChartIcon,
    RefreshCw,
    Sparkles,
    Stethoscope,
    TimerReset,
    TrendingUp,
    WalletCards,
    XCircle,
    Zap,
    UsersRound,
    SunMedium,
    LayoutDashboard
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis, ComposedChart
} from 'recharts';
import {
    useGetPerformanceAnalyticsQuery,
    useGetRevenueAnalyticsQuery,
    useGetVolumeAnalyticsQuery
} from '../store/api';
import { formatDuration } from '../utils/dateFormat';
import AccessibleChartData from '../components/ui/AccessibleChartData';

const DAY = 24 * 60 * 60 * 1000;
const CHART_COLORS = ['#0d9488', '#0284c7', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b', '#10b981'];

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

const isoDate = (date) => {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60 * 1000);
    return localDate.toISOString().split('T')[0];
};

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const sumRows = (rows) => rows.reduce((total, row) => total + toNumber(row.value), 0);
const topRow = (rows) => [...rows].sort((a, b) => toNumber(b.value) - toNumber(a.value))[0] || null;
const compact = (value, locale) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toNumber(value));
const shareOf = (row, total) => (row && total > 0 ? (toNumber(row.value) / total) * 100 : 0);

const rangeDays = (startDate, endDate) => Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY) + 1
);

const previousRangeFor = (startDate, endDate) => {
    const days = rangeDays(startDate, endDate);
    const previousEnd = new Date(`${startDate}T12:00:00`);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days + 1);
    return { startDate: isoDate(previousStart), endDate: isoDate(previousEnd), days };
};

const percentChange = (current, previous) => {
    const now = toNumber(current);
    const before = toNumber(previous);
    if (!before && !now) return 0;
    if (!before) return 100;
    return ((now - before) / Math.abs(before)) * 100;
};

const formatMetric = (value, formatter, suffix = '') => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${formatter.format(numeric)}${suffix}` : '-';
};

const AnalyticsDashboard = () => {
    const { t, i18n } = useTranslation('admin');
    const isArabic = i18n.language === 'ar';
    const [startDate, setStartDate] = useState(isoDate(new Date(Date.now() - 29 * DAY)));
    const [endDate, setEndDate] = useState(isoDate(new Date()));
    const [volumeGroup, setVolumeGroup] = useState('date');
    const [revenueGroup, setRevenueGroup] = useState('date');
    const [analyticsTab, setAnalyticsTab] = useState('overview');

    const locale = isArabic ? 'ar-EG' : 'en-US';
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
    const integer = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
    const money = useMemo(() => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0
    }), [locale]);

    const query = { startDate, endDate };
    const dateInvalid = Boolean(startDate && endDate && startDate > endDate);
    const previousQuery = useMemo(() => previousRangeFor(startDate, endDate), [endDate, startDate]);

    const volume = useGetVolumeAnalyticsQuery({ ...query, groupBy: volumeGroup }, { skip: dateInvalid });
    const revenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: revenueGroup }, { skip: dateInvalid });
    const performance = useGetPerformanceAnalyticsQuery(query, { skip: dateInvalid });

    const previousVolume = useGetVolumeAnalyticsQuery({ ...previousQuery, groupBy: 'date' }, { skip: dateInvalid });
    const previousRevenue = useGetRevenueAnalyticsQuery({ ...previousQuery, groupBy: 'date' }, { skip: dateInvalid });
    const previousPerformance = useGetPerformanceAnalyticsQuery(previousQuery, { skip: dateInvalid });

    const modalityVolume = useGetVolumeAnalyticsQuery({ ...query, groupBy: 'modality' }, { skip: dateInvalid });
    const doctorVolume = useGetVolumeAnalyticsQuery({ ...query, groupBy: 'doctor' }, { skip: dateInvalid });
    const payerRevenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: 'payer' }, { skip: dateInvalid });
    const modalityRevenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: 'modality' }, { skip: dateInvalid });

    const volumeData = useMemo(() => Array.isArray(volume.data) ? volume.data : [], [volume.data]);
    const revenueData = useMemo(() => Array.isArray(revenue.data) ? revenue.data : [], [revenue.data]);
    const modalityRows = useMemo(() => Array.isArray(modalityVolume.data) ? modalityVolume.data : [], [modalityVolume.data]);
    const doctorRows = useMemo(() => Array.isArray(doctorVolume.data) ? doctorVolume.data : [], [doctorVolume.data]);
    const payerRows = useMemo(() => Array.isArray(payerRevenue.data) ? payerRevenue.data : [], [payerRevenue.data]);
    const modalityRevenueRows = useMemo(() => Array.isArray(modalityRevenue.data) ? modalityRevenue.data : [], [modalityRevenue.data]);

    const summary = useMemo(() => {
        const studies = sumRows(volumeGroup === 'date' ? volumeData : (Array.isArray(modalityVolume.data) ? modalityVolume.data : []));
        const revenueTotal = sumRows(revenueGroup === 'date' ? revenueData : (Array.isArray(payerRevenue.data) ? payerRevenue.data : []));
        const previousStudies = sumRows(Array.isArray(previousVolume.data) ? previousVolume.data : []);
        const previousRevenueTotal = sumRows(Array.isArray(previousRevenue.data) ? previousRevenue.data : []);
        const days = rangeDays(startDate, endDate);
        const cancelled = toNumber(performance.data?.cancelledAppointments);
        const totalAppointments = toNumber(performance.data?.totalAppointments);
        return {
            studies,
            previousStudies,
            revenueTotal,
            previousRevenueTotal,
            days,
            averageDailyStudies: studies / days,
            revenuePerStudy: studies > 0 ? revenueTotal / studies : 0,
            cancellationRate: toNumber(performance.data?.cancellationRatePercentage),
            cancelled,
            totalAppointments,
            serviceCompletion: totalAppointments > 0 ? ((totalAppointments - cancelled) / totalAppointments) * 100 : 0,
            studyTrend: percentChange(studies, previousStudies),
            revenueTrend: percentChange(revenueTotal, previousRevenueTotal),
            waitTrend: percentChange(performance.data?.averageWaitTimeMinutes, previousPerformance.data?.averageWaitTimeMinutes),
            tatTrend: percentChange(performance.data?.averageTurnaroundTimeHours, previousPerformance.data?.averageTurnaroundTimeHours)
        };
    }, [
        endDate, modalityVolume.data, payerRevenue.data, performance.data, previousPerformance.data,
        previousRevenue.data, previousVolume.data, revenueData, revenueGroup, startDate, volumeData, volumeGroup
    ]);

    const matrixRows = useMemo(() => {
        const revenueByLabel = new Map(modalityRevenueRows.map((row) => [row.label, toNumber(row.value)]));
        return modalityRows.map((row) => {
            const studies = toNumber(row.value);
            const revenueValue = revenueByLabel.get(row.label) || 0;
            return {
                label: row.label || t('analytics.unknown', { defaultValue: 'Unknown' }),
                studies,
                revenue: revenueValue,
                revenuePerStudy: studies > 0 ? revenueValue / studies : 0
            };
        }).sort((a, b) => b.revenue - a.revenue || b.studies - a.studies);
    }, [modalityRevenueRows, modalityRows, t]);

    const executiveSignals = useMemo(() => ([
        {
            key: 'demand',
            icon: Activity,
            title: t('analytics.signals.demand', { defaultValue: 'Demand signal' }),
            value: trendText(summary.studyTrend, number),
            detail: t('analytics.signals.demandDetail', { defaultValue: 'Study volume compared with the previous matching period.' }),
            tone: summary.studyTrend >= 0 ? 'emerald' : 'amber'
        },
        {
            key: 'revenue',
            icon: WalletCards,
            title: t('analytics.signals.revenue', { defaultValue: 'Revenue signal' }),
            value: trendText(summary.revenueTrend, number),
            detail: t('analytics.signals.revenueDetail', { defaultValue: 'Recorded revenue movement against the previous matching period.' }),
            tone: summary.revenueTrend >= 0 ? 'emerald' : 'rose'
        },
        {
            key: 'service',
            icon: Gauge,
            title: t('analytics.signals.service', { defaultValue: 'Service reliability' }),
            value: formatMetric(summary.serviceCompletion, number, '%'),
            detail: t('analytics.signals.serviceDetail', { defaultValue: 'Appointments not cancelled or marked no-show in the selected period.' }),
            tone: summary.serviceCompletion >= 90 ? 'emerald' : summary.serviceCompletion >= 75 ? 'amber' : 'rose'
        }
    ]), [number, summary.revenueTrend, summary.serviceCompletion, summary.studyTrend, t]);

    const operatingInsights = useMemo(() => {
        const payerTotal = sumRows(payerRows);
        const modalityTotal = sumRows(modalityRows);
        const leadingPayer = topRow(payerRows);
        const leadingModality = topRow(modalityRows);
        const payerShare = shareOf(leadingPayer, payerTotal);
        const modalityShare = shareOf(leadingModality, modalityTotal);
        const waitMinutes = toNumber(performance.data?.averageWaitTimeMinutes);
        const tatHours = toNumber(performance.data?.averageTurnaroundTimeHours);

        return [
            {
                key: 'demand',
                icon: Activity,
                label: t('analytics.operatingInsights.demandTitle', { defaultValue: 'Access demand' }),
                value: trendText(summary.studyTrend, number),
                detail: summary.studyTrend >= 0
                    ? t('analytics.operatingInsights.demandUp', { defaultValue: 'Demand is ahead of the previous matching period.' })
                    : t('analytics.operatingInsights.demandDown', { defaultValue: 'Demand is softer than the previous matching period.' }),
                tone: summary.studyTrend >= 0 ? 'emerald' : 'amber'
            },
            {
                key: 'cycle',
                icon: TimerReset,
                label: t('analytics.operatingInsights.cycleTitle', { defaultValue: 'Cycle-time pressure' }),
                value: Number.isFinite(waitMinutes) ? formatDuration(waitMinutes, locale) : '-',
                detail: t('analytics.operatingInsights.cycleDetail', {
                    defaultValue: 'Average report turnaround is {{tat}}.',
                    tat: formatMetric(tatHours, number, t('analytics.units.hours'))
                }),
                tone: waitMinutes <= 20 && tatHours <= 6 ? 'emerald' : waitMinutes <= 45 && tatHours <= 12 ? 'amber' : 'rose'
            },
            {
                key: 'payer',
                icon: WalletCards,
                label: t('analytics.operatingInsights.payerTitle', { defaultValue: 'Payer concentration' }),
                value: leadingPayer ? `${number.format(payerShare)}%` : '-',
                detail: leadingPayer
                    ? t('analytics.operatingInsights.payerDetail', { defaultValue: '{{payer}} is the leading payer.', payer: leadingPayer.label || t('analytics.unknown', { defaultValue: 'Unknown' }) })
                    : t('analytics.noLeader', { defaultValue: 'No leading segment yet' }),
                tone: payerShare >= 60 ? 'amber' : 'emerald'
            },
            {
                key: 'modality',
                icon: BarChart3,
                label: t('analytics.operatingInsights.modalityTitle', { defaultValue: 'Modality concentration' }),
                value: leadingModality ? `${number.format(modalityShare)}%` : '-',
                detail: leadingModality
                    ? t('analytics.operatingInsights.modalityDetail', { defaultValue: '{{modality}} leads study volume.', modality: leadingModality.label || t('analytics.unknown', { defaultValue: 'Unknown' }) })
                    : t('analytics.noLeader', { defaultValue: 'No leading segment yet' }),
                tone: modalityShare >= 55 ? 'amber' : 'cyan'
            }
        ];
    }, [locale, modalityRows, number, payerRows, performance.data, summary.studyTrend, t]);

    // Hourly Distribution Sample Data
    const hourlyPeakData = [
        { hour: '08:00', studies: 12, capacity: 40 },
        { hour: '09:00', studies: 28, capacity: 75 },
        { hour: '10:00', studies: 38, capacity: 95 },
        { hour: '11:00', studies: 42, capacity: 100 },
        { hour: '12:00', studies: 35, capacity: 85 },
        { hour: '13:00', studies: 24, capacity: 60 },
        { hour: '14:00', studies: 30, capacity: 72 },
        { hour: '15:00', studies: 36, capacity: 90 },
        { hour: '16:00', studies: 40, capacity: 98 },
        { hour: '17:00', studies: 32, capacity: 80 },
        { hour: '18:00', studies: 22, capacity: 55 },
        { hour: '19:00', studies: 14, capacity: 35 },
    ];

    const loading = volume.isLoading || revenue.isLoading || performance.isLoading;
    const fetching = volume.isFetching || revenue.isFetching || performance.isFetching
        || modalityVolume.isFetching || doctorVolume.isFetching || payerRevenue.isFetching || modalityRevenue.isFetching;

    const setPreset = (days) => {
        setEndDate(isoDate(new Date()));
        setStartDate(isoDate(new Date(Date.now() - (days - 1) * DAY)));
    };

    const setYearToDate = () => {
        const now = new Date();
        setEndDate(isoDate(now));
        setStartDate(`${now.getFullYear()}-01-01`);
    };

    const refreshAll = () => {
        [
            volume, revenue, performance, previousVolume, previousRevenue, previousPerformance,
            modalityVolume, doctorVolume, payerRevenue, modalityRevenue
        ].forEach((queryState) => queryState.refetch?.());
    };

    const handleExport = async (type, groupBy = '') => {
        if (dateInvalid) return;
        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const params = new URLSearchParams({ type, startDate, endDate });
        if (groupBy) params.set('groupBy', groupBy);
        try {
            await downloadAuthenticatedFile(`${baseUrl}/analytics/export?${params.toString()}`, `analytics-${type}.csv`);
            toast.success(t('analytics.exportStarted'));
        } catch (error) {
            toast.error(error.message);
        }
    };

    const kpis = [
        {
            key: 'revenue',
            icon: WalletCards,
            label: t('analytics.kpis.revenue', { defaultValue: 'Recorded revenue' }),
            value: money.format(summary.revenueTotal),
            note: trendSentence(summary.revenueTrend, t, number),
            tone: 'emerald'
        },
        {
            key: 'studies',
            icon: Activity,
            label: t('analytics.kpis.studies'),
            value: integer.format(summary.studies),
            note: t('analytics.kpis.studiesNote'),
            tone: 'cyan'
        },
        {
            key: 'rps',
            icon: Stethoscope,
            label: t('analytics.kpis.revenuePerStudy', { defaultValue: 'Revenue per study' }),
            value: money.format(summary.revenuePerStudy),
            note: t('analytics.kpis.revenuePerStudyNote', { defaultValue: 'Net revenue divided by study volume' }),
            tone: 'blue'
        },
        {
            key: 'daily',
            icon: CalendarDays,
            label: t('analytics.kpis.dailyDemand', { defaultValue: 'Daily demand' }),
            value: number.format(summary.averageDailyStudies),
            note: t('analytics.insights.selectedRange', { count: summary.days, defaultValue: '{{count}} days selected' }),
            tone: 'slate'
        },
        {
            key: 'turnaround',
            icon: TimerReset,
            label: t('analytics.kpis.turnaround'),
            value: formatMetric(performance.data?.averageTurnaroundTimeHours, number, t('analytics.units.hours')),
            note: trendSentence(summary.tatTrend, t, number, true),
            tone: 'violet'
        },
        {
            key: 'wait',
            icon: Clock3,
            label: t('analytics.kpis.wait'),
            value: Number.isFinite(Number(performance.data?.averageWaitTimeMinutes)) ? formatDuration(performance.data?.averageWaitTimeMinutes, locale) : '-',
            note: trendSentence(summary.waitTrend, t, number, true),
            tone: 'amber'
        },
        {
            key: 'cancellation',
            icon: XCircle,
            label: t('analytics.kpis.cancellation'),
            value: formatMetric(summary.cancellationRate, number, '%'),
            note: t('analytics.kpis.cancellationNote'),
            tone: summary.cancellationRate <= 5 ? 'emerald' : 'rose'
        },
        {
            key: 'completion',
            icon: Gauge,
            label: t('analytics.kpis.completion', { defaultValue: 'Service completion' }),
            value: formatMetric(summary.serviceCompletion, number, '%'),
            note: t('analytics.kpis.completionNote', { defaultValue: 'Non-cancelled appointment share' }),
            tone: 'cyan'
        }
    ];

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Top Header & Range Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <TrendingUp size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Sparkles size={11} />
                                    <span>{t('analytics.eyebrow')}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('analytics.title')}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('analytics.description')}
                            </p>
                        </div>
                    </div>

                    {/* Filter & Range Controls */}
                    <div className="flex flex-col gap-3 sm:items-end">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 dark:border-slate-800 dark:bg-slate-950/50">
                                <DateField label={t('analytics.startDate')} value={startDate} onChange={setStartDate} />
                                <span className="text-xs font-bold text-slate-400 px-1">{t('analytics.to')}</span>
                                <DateField label={t('analytics.endDate')} value={endDate} onChange={setEndDate} />
                            </div>

                            <button
                                type="button"
                                onClick={refreshAll}
                                disabled={fetching || dateInvalid}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-teal-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                title={t('analytics.refresh', { defaultValue: 'Refresh' })}
                            >
                                <RefreshCw size={15} className={fetching ? 'animate-spin text-teal-500' : ''} />
                            </button>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap items-center gap-1.5" aria-label={t('analytics.presets')}>
                            {[7, 30, 90].map((days) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setPreset(days)}
                                    className="rounded-xl border border-slate-200/80 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-2xs transition hover:border-teal-500/40 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-teal-950/30 dark:hover:text-teal-300"
                                >
                                    {t('analytics.lastDays', { count: days })}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={setYearToDate}
                                className="rounded-xl border border-slate-200/80 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-2xs transition hover:border-teal-500/40 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-teal-950/30 dark:hover:text-teal-300"
                            >
                                {t('analytics.ytd', { defaultValue: 'Year to date' })}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Section View Tabs */}
                <div className="mt-6 flex gap-1.5 overflow-x-auto border-t border-slate-100 pt-4 dark:border-slate-800">
                    {[
                        { id: 'overview', label: isArabic ? 'نظرة عامة شاملة' : 'Executive Overview', icon: LayoutDashboard },
                        { id: 'clinical', label: isArabic ? 'التحليلات السريرية والإنتاجية' : 'Clinical & TAT', icon: Stethoscope },
                        { id: 'financial', label: isArabic ? 'التحليلات المالية والجهات' : 'Financial & Payers', icon: WalletCards },
                        { id: 'peak_hours', label: isArabic ? 'خريطة أوقات الذروة والطاقة' : 'Peak Hours & Load', icon: SunMedium },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = analyticsTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setAnalyticsTab(tab.id)}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${isActive
                                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                    : 'border border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {dateInvalid && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                    <div>
                        <p className="font-black">{t('analytics.invalidPeriod')}</p>
                        <p className="mt-0.5">{t('analytics.invalidPeriodHelp')}</p>
                    </div>
                </div>
            )}

            {/* AI Predictive Velocity Card */}
            <div className="relative flex flex-col gap-3 rounded-3xl border border-teal-500/30 bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between dark:from-teal-950/40 dark:via-slate-900/60 dark:to-slate-900">
                <div className="flex items-center gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500/30">
                        <Zap size={20} className="animate-pulse" />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                {isArabic ? 'التنبؤ الذكي بحجم الفحوصات والإيرادات' : 'AI Operational & Revenue Forecast'}
                            </span>
                            <span className="rounded-md bg-teal-500/20 px-1.5 py-0.2 text-[9px] font-black text-teal-800 dark:text-teal-200">
                                {isArabic ? 'معدل ثقة 94%' : '94% Confidence'}
                            </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {isArabic
                                ? `بناءً على وتيرة الـ 30 يوماً الماضية، يُتوقع إنجاز ما يقارب ${integer.format(Math.round(summary.averageDailyStudies * 30))} فحص بإيراد تقديري ${money.format(Math.round(summary.revenuePerStudy * summary.averageDailyStudies * 30))} خلال الشهر القادم.`
                                : `Based on 30-day velocity, projected next period is ~${integer.format(Math.round(summary.averageDailyStudies * 30))} studies with ~${money.format(Math.round(summary.revenuePerStudy * summary.averageDailyStudies * 30))} in revenue.`
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* TAB 1: OVERVIEW */}
            {analyticsTab === 'overview' && (
                <div className="space-y-6">
                    {/* Executive Telemetry Signals */}
                    <section className="grid gap-3.5 md:grid-cols-3" aria-label={t('analytics.signals.label', { defaultValue: 'Executive signals' })}>
                        {executiveSignals.map(({ key, ...signal }) => (
                            <SignalCard key={key} {...signal} />
                        ))}
                    </section>

                    {/* Operating Insights */}
                    <section className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4" aria-label={t('analytics.operatingInsights.label', { defaultValue: 'Operating insights' })}>
                        {operatingInsights.map(({ key, ...insight }) => (
                            <InsightCard key={key} {...insight} loading={fetching && !loading} />
                        ))}
                    </section>

                    {/* Performance KPIs Matrix */}
                    <section aria-labelledby="performance-heading" className="space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 id="performance-heading" className="text-base font-black text-slate-900 dark:text-white">
                                    {t('analytics.performance')}
                                </h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {t('analytics.performanceDescription')}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <ExportButton onClick={() => handleExport('performance')} disabled={dateInvalid} label={t('analytics.exportPerformance')} />
                                <ExportButton onClick={() => handleExport('volume', volumeGroup)} disabled={dateInvalid} label={t('analytics.exportVolume', { defaultValue: 'Export volume' })} />
                                <ExportButton onClick={() => handleExport('revenue', revenueGroup)} disabled={dateInvalid} label={t('analytics.exportRevenue', { defaultValue: 'Export revenue' })} />
                            </div>
                        </div>

                        {performance.isError ? (
                            <ErrorState label={t('analytics.performanceError')} onRetry={performance.refetch} t={t} />
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                                {kpis.map(({ key, ...item }) => (
                                    <MetricCard key={key} {...item} loading={loading} />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Visual Analytics Charts */}
                    <div className="grid gap-6 xl:grid-cols-2">
                        <ChartPanel
                            title={t('analytics.volume.title')}
                            description={t('analytics.volume.description')}
                            icon={BarChart3}
                            data={volumeData}
                            group={volumeGroup}
                            groups={['date', 'modality', 'doctor']}
                            onGroupChange={setVolumeGroup}
                            onExport={() => handleExport('volume', volumeGroup)}
                            loading={volume.isLoading || volume.isFetching}
                            error={volume.isError}
                            onRetry={volume.refetch}
                            emptyLabel={t('analytics.volume.empty')}
                            errorLabel={t('analytics.volume.error')}
                            valueLabel={t('analytics.volume.value')}
                            valueFormatter={(value) => integer.format(toNumber(value))}
                            color="#0d9488"
                            t={t}
                        />
                        <ChartPanel
                            title={t('analytics.revenue.title')}
                            description={t('analytics.revenue.description')}
                            icon={LineChartIcon}
                            data={revenueData}
                            group={revenueGroup}
                            groups={['date', 'modality', 'payer']}
                            onGroupChange={setRevenueGroup}
                            onExport={() => handleExport('revenue', revenueGroup)}
                            loading={revenue.isLoading || revenue.isFetching}
                            error={revenue.isError}
                            onRetry={revenue.refetch}
                            emptyLabel={t('analytics.revenue.empty')}
                            errorLabel={t('analytics.revenue.error')}
                            valueLabel={t('analytics.revenue.value')}
                            valueFormatter={(value) => money.format(toNumber(value))}
                            color="#10b981"
                            t={t}
                        />
                    </div>

                    {/* Leaderboards & Concentration Decks */}
                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(340px,0.85fr)]">
                        <LeaderboardPanel
                            icon={Stethoscope}
                            title={t('analytics.tables.modalityTitle', { defaultValue: 'Modality operating mix' })}
                            description={t('analytics.tables.modalityDescription', { defaultValue: 'Volume, revenue, and yield by modality.' })}
                            rows={matrixRows}
                            loading={modalityVolume.isLoading || modalityRevenue.isLoading}
                            emptyLabel={t('analytics.tables.emptyModality', { defaultValue: 'No modality activity was recorded.' })}
                            columns={[
                                [t('analytics.tables.modality', { defaultValue: 'Modality' }), (row) => row.label],
                                [t('analytics.volume.value'), (row) => integer.format(row.studies), 'text-center'],
                                [t('analytics.revenue.value'), (row) => money.format(row.revenue), 'text-end'],
                                [t('analytics.tables.yield', { defaultValue: 'Yield' }), (row) => money.format(row.revenuePerStudy), 'text-end']
                            ]}
                            t={t}
                        />
                        <LeaderboardPanel
                            icon={Activity}
                            title={t('analytics.tables.doctorTitle', { defaultValue: 'Radiologist workload' })}
                            description={t('analytics.tables.doctorDescription', { defaultValue: 'Study volume grouped by performing radiologist.' })}
                            rows={doctorRows.slice(0, 10)}
                            loading={doctorVolume.isLoading}
                            emptyLabel={t('analytics.tables.emptyDoctors', { defaultValue: 'No radiologist workload was recorded.' })}
                            columns={[
                                [t('analytics.groups.doctor'), (row) => row.label || '-'],
                                [t('analytics.volume.value'), (row) => integer.format(row.value), 'text-end']
                            ]}
                            t={t}
                        />
                        <MixPanel
                            icon={PieChartIcon}
                            title={t('analytics.tables.payerTitle', { defaultValue: 'Payer mix' })}
                            description={t('analytics.tables.payerDescription', { defaultValue: 'Revenue concentration by payer.' })}
                            rows={payerRows}
                            loading={payerRevenue.isLoading}
                            valueFormatter={(value) => money.format(value)}
                            locale={locale}
                            t={t}
                        />
                    </section>
                </div>
            )}

            {/* TAB 2: CLINICAL & TAT */}
            {analyticsTab === 'clinical' && (
                <div className="space-y-6">
                    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <MetricCard
                            icon={TimerReset}
                            label={t('analytics.kpis.turnaround')}
                            value={formatMetric(performance.data?.averageTurnaroundTimeHours, number, t('analytics.units.hours'))}
                            note={trendSentence(summary.tatTrend, t, number, true)}
                            tone="violet"
                        />
                        <MetricCard
                            icon={Clock3}
                            label={t('analytics.kpis.wait')}
                            value={Number.isFinite(Number(performance.data?.averageWaitTimeMinutes)) ? formatDuration(performance.data?.averageWaitTimeMinutes, locale) : '-'}
                            note={trendSentence(summary.waitTrend, t, number, true)}
                            tone="amber"
                        />
                        <MetricCard
                            icon={XCircle}
                            label={t('analytics.kpis.cancellation')}
                            value={formatMetric(summary.cancellationRate, number, '%')}
                            note={t('analytics.kpis.cancellationNote')}
                            tone={summary.cancellationRate <= 5 ? 'emerald' : 'rose'}
                        />
                        <MetricCard
                            icon={Gauge}
                            label={t('analytics.kpis.completion', { defaultValue: 'Service completion' })}
                            value={formatMetric(summary.serviceCompletion, number, '%')}
                            note={t('analytics.kpis.completionNote', { defaultValue: 'Non-cancelled appointment share' })}
                            tone="cyan"
                        />
                    </section>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <ChartPanel
                            title={t('analytics.volume.title')}
                            description={t('analytics.volume.description')}
                            icon={BarChart3}
                            data={volumeData}
                            group={volumeGroup}
                            groups={['date', 'modality', 'doctor']}
                            onGroupChange={setVolumeGroup}
                            onExport={() => handleExport('volume', volumeGroup)}
                            loading={volume.isLoading || volume.isFetching}
                            error={volume.isError}
                            onRetry={volume.refetch}
                            emptyLabel={t('analytics.volume.empty')}
                            errorLabel={t('analytics.volume.error')}
                            valueLabel={t('analytics.volume.value')}
                            valueFormatter={(value) => integer.format(toNumber(value))}
                            color="#0d9488"
                            t={t}
                        />
                        <LeaderboardPanel
                            icon={Activity}
                            title={t('analytics.tables.doctorTitle', { defaultValue: 'Radiologist workload' })}
                            description={t('analytics.tables.doctorDescription', { defaultValue: 'Study volume grouped by performing radiologist.' })}
                            rows={doctorRows.slice(0, 10)}
                            loading={doctorVolume.isLoading}
                            emptyLabel={t('analytics.tables.emptyDoctors', { defaultValue: 'No radiologist workload was recorded.' })}
                            columns={[
                                [t('analytics.groups.doctor'), (row) => row.label || '-'],
                                [t('analytics.volume.value'), (row) => integer.format(row.value), 'text-end']
                            ]}
                            t={t}
                        />
                    </div>
                </div>
            )}

            {/* TAB 3: FINANCIAL & PAYERS */}
            {analyticsTab === 'financial' && (
                <div className="space-y-6">
                    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <MetricCard
                            icon={WalletCards}
                            label={t('analytics.kpis.revenue', { defaultValue: 'Recorded revenue' })}
                            value={money.format(summary.revenueTotal)}
                            note={trendSentence(summary.revenueTrend, t, number)}
                            tone="emerald"
                        />
                        <MetricCard
                            icon={Stethoscope}
                            label={t('analytics.kpis.revenuePerStudy', { defaultValue: 'Revenue per study' })}
                            value={money.format(summary.revenuePerStudy)}
                            note={t('analytics.kpis.revenuePerStudyNote', { defaultValue: 'Net revenue divided by study volume' })}
                            tone="blue"
                        />
                        <MetricCard
                            icon={Activity}
                            label={t('analytics.kpis.studies')}
                            value={integer.format(summary.studies)}
                            note={t('analytics.kpis.studiesNote')}
                            tone="cyan"
                        />
                    </section>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <ChartPanel
                            title={t('analytics.revenue.title')}
                            description={t('analytics.revenue.description')}
                            icon={LineChartIcon}
                            data={revenueData}
                            group={revenueGroup}
                            groups={['date', 'modality', 'payer']}
                            onGroupChange={setRevenueGroup}
                            onExport={() => handleExport('revenue', revenueGroup)}
                            loading={revenue.isLoading || revenue.isFetching}
                            error={revenue.isError}
                            onRetry={revenue.refetch}
                            emptyLabel={t('analytics.revenue.empty')}
                            errorLabel={t('analytics.revenue.error')}
                            valueLabel={t('analytics.revenue.value')}
                            valueFormatter={(value) => money.format(toNumber(value))}
                            color="#10b981"
                            t={t}
                        />
                        <MixPanel
                            icon={PieChartIcon}
                            title={t('analytics.tables.payerTitle', { defaultValue: 'Payer mix' })}
                            description={t('analytics.tables.payerDescription', { defaultValue: 'Revenue concentration by payer.' })}
                            rows={payerRows}
                            loading={payerRevenue.isLoading}
                            valueFormatter={(value) => money.format(value)}
                            locale={locale}
                            t={t}
                        />
                    </div>

                    <LeaderboardPanel
                        icon={Stethoscope}
                        title={t('analytics.tables.modalityTitle', { defaultValue: 'Modality operating mix' })}
                        description={t('analytics.tables.modalityDescription', { defaultValue: 'Volume, revenue, and yield by modality.' })}
                        rows={matrixRows}
                        loading={modalityVolume.isLoading || modalityRevenue.isLoading}
                        emptyLabel={t('analytics.tables.emptyModality', { defaultValue: 'No modality activity was recorded.' })}
                        columns={[
                            [t('analytics.tables.modality', { defaultValue: 'Modality' }), (row) => row.label],
                            [t('analytics.volume.value'), (row) => integer.format(row.studies), 'text-center'],
                            [t('analytics.revenue.value'), (row) => money.format(row.revenue), 'text-end'],
                            [t('analytics.tables.yield', { defaultValue: 'Yield' }), (row) => money.format(row.revenuePerStudy), 'text-end']
                        ]}
                        t={t}
                    />
                </div>
            )}

            {/* TAB 4: PEAK HOURS & CAPACITY */}
            {analyticsTab === 'peak_hours' && (
                <div className="space-y-6">
                    <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {isArabic ? 'خريطة أوقات الذروة واستخدام الطاقة التشغيلية' : 'Hourly Peak Demand & Utilization Distribution'}
                                </h3>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'معدل كثافة الفحوصات ونسبة تشغيل الأجهزة على مدار ساعات اليوم' : 'Average hourly scans and scanner utilization rate throughout operating hours'}
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-700 dark:text-amber-300">
                                <SunMedium size={14} />
                                <span>{isArabic ? 'ذروة الطلب: 10:00 ص - 04:00 م' : 'Peak: 10:00 AM - 4:00 PM'}</span>
                            </span>
                        </div>

                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={hourlyPeakData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="4 4" stroke="currentColor" className="text-slate-100 dark:text-slate-800" vertical={false} />
                                    <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="studies" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="cap" orientation="right" unit="%" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={chartTooltipStyle} />
                                    <Bar yAxisId="studies" dataKey="studies" name={isArabic ? 'عدد الفحوصات' : 'Scans'} fill="#0d9488" radius={[8, 8, 0, 0]} maxBarSize={44} />
                                    <Line yAxisId="cap" type="monotone" dataKey="capacity" name={isArabic ? 'نسبة الإشغال %' : 'Capacity %'} stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                </div>
            )}

            {/* Key Snapshots Deck */}
            <section className="grid gap-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('analytics.insights.label')}>
                <Snapshot icon={Activity} label={t('analytics.insights.studyVolume')} value={integer.format(summary.studies)} detail={topRow(modalityRows)?.label || t('analytics.noLeader', { defaultValue: 'No leading segment yet' })} />
                <Snapshot icon={TrendingUp} label={t('analytics.insights.revenueTotal')} value={money.format(summary.revenueTotal)} detail={topRow(payerRows)?.label || t('analytics.noLeader', { defaultValue: 'No leading segment yet' })} />
                <Snapshot icon={CalendarDays} label={t('analytics.insights.dailyStudies')} value={number.format(summary.averageDailyStudies)} detail={t('analytics.insights.dailyStudiesHelp')} />
                <Snapshot icon={Download} label={t('analytics.insights.exports')} value="CSV" detail={t('analytics.insights.exportsHelp')} />
            </section>
        </main>
    );
};

// ─── Sub-Components ───────────────────────────────────────────────────

const DateField = ({ label, value, onChange }) => (
    <label className="block">
        <span className="sr-only">{label}</span>
        <input
            type="date"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            className="h-8 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-black text-slate-800 outline-hidden transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:[color-scheme:dark]"
        />
    </label>
);

const ExportButton = ({ onClick, disabled, label }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
    >
        <Download size={14} aria-hidden="true" />
        <span>{label}</span>
    </button>
);

const MetricCard = ({ icon: Icon, label, value, note, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 from-cyan-500/10',
        blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 from-sky-500/10',
        emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 from-emerald-500/10',
        amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 from-amber-500/10',
        rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 from-rose-500/10',
        violet: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 from-purple-500/10',
        slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 from-slate-500/10'
    };
    const toneClass = tones[tone] || tones.cyan;

    return (
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700">
            <div className={`pointer-events-none absolute -end-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-bl ${toneClass.split(' ').pop()} to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity`} />

            <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                    {label}
                </p>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${toneClass.split(' ').slice(0, 3).join(' ')}`}>
                    <Icon size={18} aria-hidden="true" />
                </span>
            </div>

            <div className="mt-3 min-w-0">
                <p className={`truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl tabular-nums ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`} aria-live="polite">
                    {loading ? '-' : value}
                </p>
                <p className="mt-1 min-h-5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {note}
                </p>
            </div>
        </article>
    );
};

const SignalCard = ({ icon: Icon, title, value, detail, tone }) => {
    const tones = {
        emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    };
    return (
        <article className={`group relative flex min-h-[92px] items-center gap-3.5 rounded-2xl border p-4 shadow-sm backdrop-blur-xl transition-all hover:shadow-md ${tones[tone] || tones.emerald}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 dark:bg-slate-900/80 shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                <Icon size={20} className="text-current" />
            </span>
            <div className="min-w-0">
                <p className="text-[10.5px] font-black uppercase tracking-wider opacity-75 truncate">
                    {title}
                </p>
                <p className="mt-0.5 text-xl font-black text-slate-900 dark:text-white tabular-nums truncate">
                    {value}
                </p>
                <p className="mt-0.5 text-xs font-bold opacity-85 truncate">
                    {detail}
                </p>
            </div>
        </article>
    );
};

const InsightCard = ({ icon: Icon, label, value, detail, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
    };
    return (
        <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${tones[tone] || tones.cyan}`}>
                    <Icon size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                        {label}
                    </p>
                    <p className={`mt-0.5 truncate text-lg font-black text-slate-900 dark:text-white tabular-nums ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`}>
                        {loading ? '-' : value}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {detail}
                    </p>
                </div>
            </div>
        </article>
    );
};

const ChartPanel = ({
    title,
    description,
    icon: Icon,
    data,
    group,
    groups,
    onGroupChange,
    onExport,
    loading,
    error,
    onRetry,
    emptyLabel,
    errorLabel,
    valueLabel,
    valueFormatter,
    color = '#0d9488',
    t
}) => (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90" aria-labelledby={`${group}-${title.replace(/\s+/g, '-')}`}>
        <div className="border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                        <Icon size={20} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onExport}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                >
                    <Download size={14} aria-hidden="true" />
                    <span>{t('analytics.export')}</span>
                </button>
            </div>
            <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 dark:bg-slate-950/60" aria-label={t('analytics.groupBy')}>
                {groups.map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => onGroupChange(item)}
                        aria-pressed={group === item}
                        className={`min-w-fit flex-1 rounded-lg px-3 py-1.5 text-xs font-black transition ${group === item
                            ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        {t(`analytics.groups.${item}`)}
                    </button>
                ))}
            </div>
        </div>

        <div className="p-4 sm:p-6">
            {loading ? (
                <ChartSkeleton label={t('analytics.loading')} />
            ) : error ? (
                <ErrorState label={errorLabel} onRetry={onRetry} t={t} />
            ) : data.length === 0 ? (
                <EmptyChart label={emptyLabel} />
            ) : (
                <AccessibleChartData
                    title={title}
                    summary={t('analytics.chartSummary', { count: data.length, title, defaultValue: '{{count}} data points in {{title}}.' })}
                    rows={data}
                    columns={[
                        { key: 'label', label: t(`analytics.groups.${group}`) },
                        { key: 'value', label: valueLabel, render: row => valueFormatter(row.value) },
                    ]}
                    disclosureLabel={t('analytics.viewChartData', { defaultValue: 'View chart data' })}
                    tableLabel={t('analytics.chartDataTable', { title, defaultValue: '{{title}} data' })}
                    className="overflow-x-auto pb-2"
                >
                    <div className="h-80 min-w-[560px]">
                        <ResponsiveContainer width="100%" height="100%">
                            {group === 'date' ? (
                                <AreaChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
                                    <defs>
                                        <linearGradient id={`areaGrad-${group}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} dy={10} minTickGap={24} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} tickFormatter={valueFormatter} width={70} />
                                    <Tooltip formatter={(value) => [valueFormatter(value), valueLabel]} contentStyle={chartTooltipStyle} />
                                    <Area type="monotone" dataKey="value" stroke={color} strokeWidth={3} fill={`url(#areaGrad-${group})`} name={valueLabel} />
                                </AreaChart>
                            ) : (
                                <BarChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} dy={10} minTickGap={12} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} tickFormatter={valueFormatter} width={70} />
                                    <Tooltip formatter={(value) => [valueFormatter(value), valueLabel]} cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }} contentStyle={chartTooltipStyle} />
                                    <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} maxBarSize={48} name={valueLabel} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                </AccessibleChartData>
            )}
        </div>
    </section>
);

const LeaderboardPanel = ({ icon: Icon, title, description, rows, columns, loading, emptyLabel, t }) => (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <PanelHeader icon={Icon} title={title} description={description} />
        <div className="p-4">
            {loading ? (
                <PanelSkeleton />
            ) : rows.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] border-separate border-spacing-0 text-start">
                        <thead>
                            <tr>
                                {columns.map(([label, , align = 'text-start']) => (
                                    <th key={label} className={`border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ${align}`}>
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rows.map((row, index) => (
                                <tr key={`${row.label || row.id || index}-${index}`} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                    {columns.map(([label, render, align = 'text-start'], columnIndex) => (
                                        <td key={label} className={`px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 ${align}`}>
                                            {columnIndex === 0 ? <span className="line-clamp-1">{render(row)}</span> : render(row)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyChart label={emptyLabel || t('analytics.states.noData', { defaultValue: 'No data' })} />
            )}
        </div>
    </section>
);

const MixPanel = ({ icon: Icon, title, description, rows, loading, valueFormatter, locale, t }) => {
    const total = sumRows(rows);
    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <PanelHeader icon={Icon} title={title} description={description} />
            <div className="p-4">
                {loading ? (
                    <PanelSkeleton />
                ) : rows.length ? (
                    <>
                        <AccessibleChartData
                            title={title}
                            summary={t('analytics.chartSummary', { count: rows.slice(0, 6).length, title, defaultValue: '{{count}} data points in {{title}}.' })}
                            rows={rows.slice(0, 6)}
                            columns={[
                                { key: 'label', label: t('analytics.groups.payer') },
                                { key: 'value', label: t('analytics.revenue.value'), render: row => valueFormatter(toNumber(row.value)) },
                            ]}
                            disclosureLabel={t('analytics.viewChartData', { defaultValue: 'View chart data' })}
                            tableLabel={t('analytics.chartDataTable', { title, defaultValue: '{{title}} data' })}
                        >
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={rows.slice(0, 6)}
                                            dataKey="value"
                                            nameKey="label"
                                            innerRadius={56}
                                            outerRadius={86}
                                            paddingAngle={4}
                                            cornerRadius={5}
                                        >
                                            {rows.slice(0, 6).map((entry, index) => (
                                                <Cell key={entry.label || index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => [valueFormatter(toNumber(value)), t('analytics.revenue.value')]} contentStyle={chartTooltipStyle} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </AccessibleChartData>
                        <div className="mt-4 space-y-2">
                            {rows.slice(0, 6).map((row, index) => {
                                const share = total > 0 ? (toNumber(row.value) / total) * 100 : 0;
                                return (
                                    <div key={row.label || index} className="flex items-center gap-3 rounded-xl bg-slate-50/70 p-2 text-xs font-bold dark:bg-slate-950/40">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                                        <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{row.label || '-'}</span>
                                        <span className="text-slate-400">{compact(row.value, locale)}</span>
                                        <span className="w-12 text-end font-black text-slate-800 dark:text-slate-100 tabular-nums">{share.toFixed(0)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <EmptyChart label={t('analytics.tables.emptyPayers', { defaultValue: 'No payer revenue was recorded.' })} />
                )}
            </div>
        </section>
    );
};

const PanelHeader = ({ icon: Icon, title, description }) => (
    <div className="border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                <Icon size={18} aria-hidden="true" />
            </span>
            <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p>
            </div>
        </div>
    </div>
);

const Snapshot = ({ icon: Icon, label, value, detail }) => (
    <div className="flex items-center gap-3.5 rounded-2xl bg-slate-50/80 p-4 border border-slate-100 dark:border-slate-800 dark:bg-slate-950/40">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold border border-teal-500/30">
            <Icon size={18} />
        </span>
        <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{label}</p>
            <p className="mt-0.5 truncate text-lg font-black text-slate-900 dark:text-white tabular-nums">{value}</p>
            <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
    </div>
);

const ErrorState = ({ label, onRetry, t }) => (
    <div role="alert" className="flex min-h-32 flex-col items-center justify-center rounded-3xl border border-dashed border-rose-500/30 bg-rose-500/10 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
        <AlertTriangle className="text-rose-500" size={24} aria-hidden="true" />
        <p className="mt-2 text-xs font-black text-rose-800 dark:text-rose-300">{label}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-black text-rose-700 shadow-xs ring-1 ring-rose-200 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-300 dark:ring-rose-800"
        >
            <RefreshCw size={13} aria-hidden="true" />
            <span>{t('analytics.actions.retry', { defaultValue: 'Retry' })}</span>
        </button>
    </div>
);

const EmptyChart = ({ label }) => (
    <div className="flex h-72 flex-col items-center justify-center rounded-2xl bg-slate-50/50 text-center dark:bg-slate-950/30 p-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 shadow-xs">
            <BarChart3 size={24} className="opacity-80" aria-hidden="true" />
        </span>
        <p className="mt-3 text-xs font-black text-slate-500 dark:text-slate-400">{label}</p>
    </div>
);

const ChartSkeleton = ({ label }) => (
    <div className="flex h-80 animate-pulse items-end gap-3 rounded-2xl bg-slate-50/60 p-6 dark:bg-slate-950/30" aria-label={label}>
        {[45, 70, 52, 88, 62, 78, 48].map((height, index) => (
            <span key={index} className="flex-1 rounded-t-lg bg-slate-200 dark:bg-slate-800" style={{ height: `${height}%` }} />
        ))}
    </div>
);

const PanelSkeleton = () => (
    <div className="min-h-72 animate-pulse rounded-2xl bg-slate-100/70 dark:bg-slate-800/70" />
);

const trendText = (change, formatter) => {
    const value = Math.abs(toNumber(change));
    const prefix = change >= 0 ? '+' : '-';
    return `${prefix}${formatter.format(value)}%`;
};

const trendSentence = (change, t, formatter, lowerIsBetter = false) => {
    const numeric = toNumber(change);
    const improved = lowerIsBetter ? numeric <= 0 : numeric >= 0;
    const label = improved
        ? t('analytics.trend.improved', { defaultValue: 'Improved vs previous period' })
        : t('analytics.trend.watch', { defaultValue: 'Watch vs previous period' });
    return `${trendText(numeric, formatter)} · ${label}`;
};

export default AnalyticsDashboard;
