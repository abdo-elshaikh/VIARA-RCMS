import { useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    CalendarDays,
    Clock3,
    Download,
    Gauge,
    LineChart as LineChartIcon,
    PieChart as PieChartIcon,
    RefreshCw,
    Stethoscope,
    TimerReset,
    TrendingUp,
    WalletCards,
    XCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import {
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
    YAxis
} from 'recharts';
import {
    useGetPerformanceAnalyticsQuery,
    useGetRevenueAnalyticsQuery,
    useGetVolumeAnalyticsQuery
} from '../store/api';
import { formatDuration } from '../utils/dateFormat';
import PageHeader from '../components/ui/PageHeader';
import AccessibleChartData from '../components/ui/AccessibleChartData';

const DAY = 24 * 60 * 60 * 1000;
const CHART_COLORS = ['#0891b2', '#059669', '#7c3aed', '#f59e0b', '#dc2626', '#2563eb'];
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
    const [startDate, setStartDate] = useState(isoDate(new Date(Date.now() - 30 * DAY)));
    const [endDate, setEndDate] = useState(isoDate(new Date()));
    const [volumeGroup, setVolumeGroup] = useState('date');
    const [revenueGroup, setRevenueGroup] = useState('date');

    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
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
        <main className="mx-auto max-w-[1600px] space-y-6 pb-10">
            <PageHeader
                icon={TrendingUp}
                eyebrow={t('analytics.eyebrow')}
                title={t('analytics.title')}
                description={t('analytics.description')}
                actions={
                    <div className="w-full rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 sm:w-auto sm:p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <CalendarDays size={15} aria-hidden="true" /> {t('analytics.period')}
                            </div>
                            <button type="button" onClick={refreshAll} disabled={fetching || dateInvalid} className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-cyan-200 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                <RefreshCw size={13} className={fetching ? 'animate-spin' : ''} />
                                {fetching ? t('analytics.refreshing', { defaultValue: 'Refreshing...' }) : t('analytics.refresh', { defaultValue: 'Refresh' })}
                            </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                            <DateField label={t('analytics.startDate')} value={startDate} onChange={setStartDate} />
                            <span className="hidden text-center text-xs text-slate-400 sm:block">{t('analytics.to')}</span>
                            <DateField label={t('analytics.endDate')} value={endDate} onChange={setEndDate} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2" aria-label={t('analytics.presets')}>
                            {[7, 30, 90].map((days) => (
                                <button key={days} type="button" onClick={() => setPreset(days)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-900 dark:hover:bg-teal-950/30 dark:hover:text-teal-300">
                                    {t('analytics.lastDays', { count: days })}
                                </button>
                            ))}
                            <button type="button" onClick={setYearToDate} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-900 dark:hover:bg-teal-950/30 dark:hover:text-teal-300">
                                {t('analytics.ytd', { defaultValue: 'Year to date' })}
                            </button>
                        </div>
                    </div>
                }
            />

            {dateInvalid ? (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                    <div><p className="font-bold">{t('analytics.invalidPeriod')}</p><p className="mt-0.5 text-amber-700 dark:text-amber-300">{t('analytics.invalidPeriodHelp')}</p></div>
                </div>
            ) : null}

            <section className="grid gap-3 lg:grid-cols-3" aria-label={t('analytics.signals.label', { defaultValue: 'Executive signals' })}>
                {executiveSignals.map((signal) => <SignalCard key={signal.key} {...signal} />)}
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label={t('analytics.operatingInsights.label', { defaultValue: 'Operating insights' })}>
                {operatingInsights.map((insight) => <InsightCard key={insight.key} {...insight} loading={fetching && !loading} />)}
            </section>

            <section aria-labelledby="performance-heading">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="performance-heading" className="text-lg font-black text-slate-900 dark:text-white">{t('analytics.performance')}</h2>
                        <p className="text-sm text-slate-500">{t('analytics.performanceDescription')}</p>
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
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {kpis.map(({ key, ...item }) => <MetricCard key={key} {...item} loading={loading} />)}
                    </div>
                )}
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
                    color="#0891b2"
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
                    color="#059669"
                    t={t}
                />
            </div>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,.8fr)]">
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

            <section className="grid gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1426] sm:grid-cols-2 xl:grid-cols-4" aria-label={t('analytics.insights.label')}>
                <Snapshot icon={Activity} label={t('analytics.insights.studyVolume')} value={integer.format(summary.studies)} detail={topRow(modalityRows)?.label || t('analytics.noLeader', { defaultValue: 'No leading segment yet' })} />
                <Snapshot icon={TrendingUp} label={t('analytics.insights.revenueTotal')} value={money.format(summary.revenueTotal)} detail={topRow(payerRows)?.label || t('analytics.noLeader', { defaultValue: 'No leading segment yet' })} />
                <Snapshot icon={CalendarDays} label={t('analytics.insights.dailyStudies')} value={number.format(summary.averageDailyStudies)} detail={t('analytics.insights.dailyStudiesHelp')} />
                <Snapshot icon={Download} label={t('analytics.insights.exports')} value="CSV" detail={t('analytics.insights.exportsHelp')} />
            </section>
        </main>
    );
};

const DateField = ({ label, value, onChange }) => (
    <label className="block">
        <span className="sr-only">{label}</span>
        <input type="date" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:[color-scheme:dark]" />
    </label>
);

const ExportButton = ({ onClick, disabled, label }) => (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-800 disabled:opacity-50 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 dark:hover:border-cyan-800 dark:hover:text-cyan-400">
        <Download size={15} aria-hidden="true" /> {label}
    </button>
);

const MetricCard = ({ icon: Icon, label, value, note, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 ring-cyan-100 dark:ring-cyan-900/50',
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 ring-blue-100 dark:ring-blue-900/50',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-emerald-100 dark:ring-emerald-900/50',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 ring-amber-100 dark:ring-amber-900/50',
        rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 ring-rose-100 dark:ring-rose-900/50',
        violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 ring-violet-100 dark:ring-violet-900/50',
        slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700'
    };
    return (
        <article className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.cyan}`}><Icon size={17} aria-hidden="true" /></span>
            </div>
            <p className={`mt-4 truncate text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`} aria-live="polite">{loading ? '-' : value}</p>
            <p className="mt-1 min-h-5 text-xs leading-5 text-slate-500">{note}</p>
        </article>
    );
};

const SignalCard = ({ icon: Icon, title, value, detail, tone }) => {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200',
        amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200',
        rose: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200'
    };
    return (
        <article className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.emerald}`}>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-current shadow-sm dark:bg-white/10"><Icon size={18} /></span>
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[.16em] opacity-75">{title}</p>
                    <p className="mt-1 text-xl font-black">{value}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{detail}</p>
                </div>
            </div>
        </article>
    );
};

const InsightCard = ({ icon: Icon, label, value, detail, tone, loading }) => {
    const tones = {
        cyan: 'text-cyan-700 bg-cyan-50 ring-cyan-100 dark:text-cyan-300 dark:bg-cyan-950/25 dark:ring-cyan-900/60',
        emerald: 'text-emerald-700 bg-emerald-50 ring-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/25 dark:ring-emerald-900/60',
        amber: 'text-amber-700 bg-amber-50 ring-amber-100 dark:text-amber-300 dark:bg-amber-950/25 dark:ring-amber-900/60',
        rose: 'text-rose-700 bg-rose-50 ring-rose-100 dark:text-rose-300 dark:bg-rose-950/25 dark:ring-rose-900/60'
    };
    return (
        <article className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60">
            <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.cyan}`}>
                    <Icon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</p>
                    <p className={`mt-1 truncate text-xl font-black text-slate-950 dark:text-white ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`}>{loading ? '-' : value}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</p>
                </div>
            </div>
        </article>
    );
};

const ChartPanel = ({ title, description, icon: Icon, data, group, groups, onGroupChange, onExport, loading, error, onRetry, emptyLabel, errorLabel, valueLabel, valueFormatter, color = '#0891b2', t }) => (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60" aria-labelledby={`${group}-${title.replace(/\s+/g, '-')}`}>
        <div className="border-b border-slate-100/70 p-5 dark:border-slate-800/70 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:ring-cyan-900/50"><Icon size={19} aria-hidden="true" /></span>
                    <div><h2 className="font-black text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div>
                </div>
                <button type="button" onClick={onExport} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-800 to-slate-950 px-3.5 py-2 text-xs font-bold text-white transition hover:brightness-110 active:scale-[0.98]">
                    <Download size={15} aria-hidden="true" /> {t('analytics.export')}
                </button>
            </div>
            <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900/50" aria-label={t('analytics.groupBy')}>
                {groups.map((item) => (
                    <button key={item} type="button" onClick={() => onGroupChange(item)} aria-pressed={group === item} className={`min-w-fit flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${group === item ? 'bg-white text-cyan-800 shadow-sm dark:bg-slate-900 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}>
                        {t(`analytics.groups.${item}`)}
                    </button>
                ))}
            </div>
        </div>

        <div className="p-4 sm:p-6">
            {loading ? <ChartSkeleton label={t('analytics.loading')} /> : error ? <ErrorState label={errorLabel} onRetry={onRetry} t={t} /> : data.length === 0 ? <EmptyChart label={emptyLabel} /> : (
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
                                <LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={10} minTickGap={24} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={valueFormatter} width={70} />
                                    <Tooltip formatter={(value) => [valueFormatter(value), valueLabel]} contentStyle={tooltipStyle} />
                                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} name={valueLabel} />
                                </LineChart>
                            ) : (
                                <BarChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={10} minTickGap={12} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={valueFormatter} width={70} />
                                    <Tooltip formatter={(value) => [valueFormatter(value), valueLabel]} cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} />
                                    <Bar dataKey="value" fill={color} radius={[7, 7, 0, 0]} name={valueLabel} />
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
    <section className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60">
        <PanelHeader icon={Icon} title={title} description={description} />
        <div className="p-4">
            {loading ? <PanelSkeleton /> : rows.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-separate border-spacing-0 text-start">
                        <thead>
                            <tr>
                                {columns.map(([label, , align = 'text-start']) => (
                                    <th key={label} className={`border-b border-slate-200 px-3 py-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-400 dark:border-slate-800 ${align}`}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={`${row.label || row.id || index}-${index}`} className="transition hover:bg-cyan-50/40 dark:hover:bg-cyan-900/10">
                                    {columns.map(([label, render, align = 'text-start'], columnIndex) => (
                                        <td key={label} className={`border-b border-slate-100 px-3 py-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:text-slate-200 ${align}`}>
                                            {columnIndex === 0 ? <span className="line-clamp-1">{render(row)}</span> : render(row)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <EmptyChart label={emptyLabel || t('analytics.states.noData', { defaultValue: 'No data' })} />}
        </div>
    </section>
);

const MixPanel = ({ icon: Icon, title, description, rows, loading, valueFormatter, locale, t }) => {
    const total = sumRows(rows);
    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60">
            <PanelHeader icon={Icon} title={title} description={description} />
            <div className="p-4">
                {loading ? <PanelSkeleton /> : rows.length ? (
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
                            <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={rows.slice(0, 6)} dataKey="value" nameKey="label" innerRadius={52} outerRadius={86} paddingAngle={2}>
                                        {rows.slice(0, 6).map((entry, index) => <Cell key={entry.label || index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value) => [valueFormatter(toNumber(value)), t('analytics.revenue.value')]} contentStyle={tooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer></div>
                        </AccessibleChartData>
                        <div className="mt-3 space-y-2">
                            {rows.slice(0, 6).map((row, index) => {
                                const share = total > 0 ? (toNumber(row.value) / total) * 100 : 0;
                                return (
                                    <div key={row.label || index} className="flex items-center gap-3 text-xs font-bold">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                                        <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{row.label || '-'}</span>
                                        <span className="text-slate-400">{compact(row.value, locale)}</span>
                                        <span className="w-12 text-end text-slate-500">{share.toFixed(0)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : <EmptyChart label={t('analytics.tables.emptyPayers', { defaultValue: 'No payer revenue was recorded.' })} />}
            </div>
        </section>
    );
};

const PanelHeader = ({ icon: Icon, title, description }) => (
    <div className="border-b border-slate-100/70 p-5 dark:border-slate-800/70">
        <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:ring-cyan-900/50"><Icon size={19} aria-hidden="true" /></span>
            <div>
                <h2 className="font-black text-slate-900 dark:text-white">{title}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
            </div>
        </div>
    </div>
);

const Snapshot = ({ icon: Icon, label, value, detail }) => (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-900/40 dark:ring-slate-800">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-slate-800 dark:text-cyan-400"><Icon size={18} /></span>
        <div className="min-w-0"><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-0.5 truncate text-lg font-extrabold text-slate-900 dark:text-white">{value}</p><p className="truncate text-xs text-slate-400">{detail}</p></div>
    </div>
);

const ErrorState = ({ label, onRetry, t }) => (
    <div role="alert" className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900/50 dark:bg-rose-900/20">
        <AlertTriangle className="text-rose-500" size={22} aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-rose-800 dark:text-rose-400">{label}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-700 shadow-sm ring-1 ring-rose-200 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-400 dark:ring-rose-800 dark:hover:bg-slate-700"><RefreshCw size={14} aria-hidden="true" /> {t('analytics.actions.retry', { defaultValue: 'Retry' })}</button>
    </div>
);

const EmptyChart = ({ label }) => <div className="flex h-72 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center dark:bg-slate-900/40"><BarChart3 size={28} className="text-slate-300 dark:text-slate-600" aria-hidden="true" /><p className="mt-3 text-sm font-bold text-slate-500">{label}</p></div>;
const ChartSkeleton = ({ label }) => <div className="flex h-80 animate-pulse items-end gap-3 rounded-2xl bg-slate-50 p-6 dark:bg-slate-900/40" aria-label={label}>{[45, 70, 52, 88, 62, 78, 48].map((height, index) => <span key={index} className="flex-1 rounded-t-lg bg-slate-200 dark:bg-slate-800" style={{ height: `${height}%` }} />)}</div>;
const PanelSkeleton = () => <div className="min-h-72 animate-pulse rounded-2xl bg-slate-100/70 dark:bg-slate-800/70" />;
const tooltipStyle = { borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 12px 30px -12px rgb(15 23 42 / 0.3)' };

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
    return `${trendText(numeric, formatter)} - ${label}`;
};

export default AnalyticsDashboard;
