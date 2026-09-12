import { useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    CalendarDays,
    Download,
    PieChart as PieChartIcon,
    RefreshCw,
    Stethoscope,
    TrendingUp,
    Users,
    Banknote,
    Search,
    MapPin,
    Award
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { downloadAuthenticatedFile } from '../../utils/authenticatedFetch';
import { useGetReferralAnalyticsQuery } from '../../store/api';

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (date) => date.toISOString().split('T')[0];

const formatMetric = (value, formatter, suffix = '') => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${formatter.format(numeric)}${suffix}` : '—';
};

const ReferralsTab = () => {
    const { t, i18n } = useTranslation('admin');
    const [startDate, setStartDate] = useState(isoDate(new Date(Date.now() - 30 * DAY)));
    const [endDate, setEndDate] = useState(isoDate(new Date()));
    const [tableSearch, setTableSearch] = useState('');

    const query = { startDate, endDate };
    const dateInvalid = Boolean(startDate && endDate && startDate > endDate);
    const { data, isLoading, isError, refetch } = useGetReferralAnalyticsQuery(query, { skip: dateInvalid });

    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
    const formatMoney = (val) => {
        const formatted = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'EGP',
            maximumFractionDigits: 0
        }).format(Number(val || 0));
        return formatted.replace(/\s+/g, '\u00A0');
    };

    const setPreset = (days) => {
        setEndDate(isoDate(new Date()));
        setStartDate(isoDate(new Date(Date.now() - days * DAY)));
    };

    const handleExport = async () => {
        if (dateInvalid) return;
        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const params = new URLSearchParams({ type: 'referrals', startDate, endDate });
        try {
            await downloadAuthenticatedFile(`${baseUrl}/analytics/export?${params.toString()}`, 'referral-analytics.csv');
            toast.success(t('analytics.exportStarted', 'Export started successfully'));
        } catch (error) {
            toast.error(error.message);
        }
    };

    const sourcesData = data?.sources || [];
    const doctorsData = useMemo(() => data?.topDoctors || [], [data?.topDoctors]);
    const totalReferrals = doctorsData.reduce((acc, curr) => acc + curr.totalExams, 0);
    const totalReferralRevenue = doctorsData.reduce((acc, curr) => acc + curr.totalRevenue, 0);
    const topDoctor = doctorsData.length > 0 ? doctorsData[0] : null;
    const bestChannel = sourcesData.length > 0 ? sourcesData[0] : null;


    const filteredDoctorsTable = useMemo(() => {
        return doctorsData.filter(doc =>
            doc.doctorName?.toLowerCase().includes(tableSearch.toLowerCase()) ||
            doc.clinicName?.toLowerCase().includes(tableSearch.toLowerCase())
        );
    }, [doctorsData, tableSearch]);

    const kpis = [
        {
            key: 'total_referrals',
            icon: Users,
            label: t('analytics.kpis.totalReferrals', 'Total Referrals'),
            value: formatMetric(totalReferrals, number),
            note: t('analytics.kpis.totalReferralsNote', 'Exams sourced from doctors'),
            tone: 'blue'
        },
        {
            key: 'total_revenue',
            icon: Banknote,
            label: t('analytics.kpis.totalRevenue', 'Total Revenue'),
            value: formatMoney(totalReferralRevenue),
            note: t('analytics.kpis.totalRevenueNote', 'Generated from referrals'),
            tone: 'emerald'
        },
        {
            key: 'top_doctor',
            icon: Stethoscope,
            label: t('analytics.kpis.topDoctor', 'Top Referring Doctor'),
            value: topDoctor ? topDoctor.doctorName : '—',
            note: topDoctor ? `${formatMoney(topDoctor.totalRevenue)} generated` : t('analytics.kpis.noData', 'No data available'),
            tone: 'cyan'
        },
        {
            key: 'best_channel',
            icon: TrendingUp,
            label: t('analytics.kpis.bestChannel', 'Top Acquisition Channel'),
            value: bestChannel ? bestChannel.label : '—',
            note: bestChannel ? `${number.format(bestChannel.value)} bookings` : t('analytics.kpis.noData', 'No data available'),
            tone: 'slate'
        }
    ];

    return (
        <div className="space-y-6 pb-10">
            {/* Filter & Action Bar */}
            <section className="sticky top-0 z-10 -mx-4 px-4 py-3 sm:mx-0 sm:px-0 sm:py-0">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/80 shadow-md backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/80 p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400">
                            <CalendarDays size={18} aria-hidden="true" />
                        </div>
                        <div className="flex flex-1 items-center gap-2">
                            <div className="flex-1 sm:flex-initial">
                                <DateField label={t('analytics.startDate', 'Start Date')} value={startDate} onChange={setStartDate} />
                            </div>
                            <span className="text-slate-300 dark:text-slate-600 font-bold">—</span>
                            <div className="flex-1 sm:flex-initial">
                                <DateField label={t('analytics.endDate', 'End Date')} value={endDate} onChange={setEndDate} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Presets */}
                        <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950/40 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
                            {[7, 30, 90, 365].map((days) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setPreset(days)}
                                    className="shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-white hover:text-slate-900 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                                >
                                    {t('analytics.lastDays', { count: days, defaultValue: `${days}d` })}
                                </button>
                            ))}
                        </div>

                        {/* Export Button */}
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={dateInvalid || isLoading}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-cyan-500 disabled:opacity-50 transition active:scale-98"
                        >
                            <Download size={14} />
                            <span>{t('analytics.actions.export', 'Export CSV')}</span>
                        </button>
                    </div>
                </div>
            </section>

            {dateInvalid && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-900/10 p-4 text-sm text-rose-900 dark:text-rose-200 shadow-sm">
                    <AlertTriangle className="mt-0.5 shrink-0 text-rose-500" size={18} aria-hidden="true" />
                    <div>
                        <p className="font-bold">{t('analytics.invalidPeriod', 'Invalid Date Range')}</p>
                        <p className="mt-0.5 text-rose-700 dark:text-rose-400">{t('analytics.invalidPeriodHelp', 'The start date must be before the end date.')}</p>
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            <section aria-labelledby="kpi-heading">
                <div className="mb-3">
                    <h2 id="kpi-heading" className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('analytics.overview', 'Overview')}</h2>
                </div>

                {isError ? (
                    <ErrorState label={t('analytics.error', 'Failed to load data')} onRetry={refetch} t={t} />
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {kpis.map((item) => <MetricCard key={item.key} {...item} loading={isLoading} />)}
                    </div>
                )}
            </section>

            {/* Charts section */}
            <div className="grid gap-6 xl:grid-cols-[1fr_1.35fr]">
                {/* Acquisition Channels */}
                <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/30">
                    <div className="border-b border-slate-100 dark:border-slate-800/80 p-5 bg-slate-50/50 dark:bg-slate-950/20">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                                <PieChartIcon size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('analytics.channelsTitle', 'Acquisition Channels')}</h2>
                                <p className="text-[10px] text-slate-400">{t('analytics.channelsDesc', 'Where patients book from')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 flex-1">
                        {isLoading ? <ChartSkeleton label={t('analytics.states.loading', 'Loading')} /> : isError ? <ErrorState label={t('analytics.states.error', 'Error')} onRetry={refetch} t={t} /> : sourcesData.length === 0 ? <EmptyChart label={t('analytics.states.noData', 'No Data')} /> : (
                            <AcquisitionChannelsBreakdown data={sourcesData} t={t} />
                        )}
                    </div>
                </section>

                {/* Top Doctors Leaderboard */}
                <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/30">
                    <div className="border-b border-slate-100 dark:border-slate-800/80 p-5 bg-slate-50/50 dark:bg-slate-950/20">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                                <BarChart3 size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('analytics.doctorsTitle', 'Top Referring Doctors')}</h2>
                                <p className="text-[10px] text-slate-400">{t('analytics.doctorsDesc', 'By total revenue generated')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 flex-1">
                        {isLoading ? <ChartSkeleton label={t('analytics.states.loading', 'Loading')} /> : isError ? <ErrorState label={t('analytics.states.error', 'Error')} onRetry={refetch} t={t} /> : doctorsData.length === 0 ? <EmptyChart label={t('analytics.states.noData', 'No Data')} /> : (
                            <TopDoctorsLeaderboard data={doctorsData} money={formatMoney(totalReferralRevenue)} t={t} />
                        )}
                    </div>
                </section>
            </div>

            {/* Referrers Details Table */}
            {!isLoading && !isError && (
                <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/30">
                    <div className="border-b border-slate-100 dark:border-slate-800/80 p-5 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                <Users size={18} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('analytics.allDoctorsTitle', 'Referrer Performance')}</h2>
                                <p className="text-[10px] text-slate-400">{t('analytics.allDoctorsDesc', 'Detailed breakdown of referring physicians')}</p>
                            </div>
                        </div>

                        {/* Search Filter inside Table */}
                        <div className="relative">
                            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by doctor or clinic..."
                                value={tableSearch}
                                onChange={(e) => setTableSearch(e.target.value)}
                                className="h-9 w-60 rounded-xl border border-slate-200 bg-white ps-8 pe-4 text-xs outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full table-auto text-start text-xs">
                            <thead className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-850 dark:bg-slate-900/40">
                                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <th className="px-6 py-4 text-slate-500 text-start">Doctor Name</th>
                                    <th className="px-6 py-4 text-slate-500 text-start">Clinic / Hospital</th>
                                    <th className="px-6 py-4 text-slate-500 text-end">Total Referrals</th>
                                    <th className="px-6 py-4 text-slate-500 text-end">Revenue Generated</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {filteredDoctorsTable.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">No referring doctors found matching criteria.</td>
                                    </tr>
                                ) : filteredDoctorsTable.map((doc, idx) => {
                                    const isTopReferrer = idx === 0 && doc.totalExams > 3;
                                    const initials = doc.doctorName ? doc.doctorName.replace(/^(dr|mr|ms|mrs)\.?\s+/i, '').slice(0, 2).toUpperCase() : 'DR';

                                    return (
                                        <tr key={idx} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-800/20">
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-[10px] font-bold text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400">
                                                        {initials}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-900 dark:text-slate-100">{doc.doctorName}</span>
                                                            {isTopReferrer && (
                                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                                                    <Award size={10} />
                                                                    Top Partner
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin size={12} className="text-slate-400" />
                                                    <span>{doc.clinicName || 'Independent Clinic'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 font-mono font-bold text-slate-700 dark:text-slate-300 text-end">
                                                {doc.totalExams}
                                            </td>
                                            <td className="px-6 py-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-end whitespace-nowrap">
                                                <span>{formatMoney(doc.totalRevenue)}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
};

const DateField = ({ label, value, onChange }) => (
    <label className="block w-full">
        <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</span>
        <input
            type="date"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            className="w-full sm:w-36 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:[color-scheme:dark]"
        />
    </label>
);

const MetricCard = ({ icon: Icon, label, value, note, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 ring-cyan-200/50 dark:ring-cyan-800/50',
        blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 ring-blue-200/50 dark:ring-blue-800/50',
        amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-800/50',
        emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-800/50',
        slate: 'bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-300 ring-slate-200/50 dark:ring-slate-750'
    };
    return (
        <article className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40 transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
            <div className="relative flex items-start justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${tones[tone]}`}>
                    <Icon size={16} aria-hidden="true" />
                </span>
            </div>
            <p className={`relative mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`} aria-live="polite">
                {loading ? '—' : value}
            </p>
            <p className="relative mt-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">{note}</p>
        </article>
    );
};

const ErrorState = ({ label, onRetry, t }) => (
    <div role="alert" className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-900/10 p-6 text-center">
        <AlertTriangle className="text-rose-500" size={22} aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-rose-800 dark:text-rose-200">{label}</p>
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white dark:bg-[#0b1426] px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-400 shadow-sm ring-1 ring-rose-200 dark:ring-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/30"><RefreshCw size={14} aria-hidden="true" /> {t ? t('analytics.actions.retry', 'Retry') : 'Retry'}</button>
    </div>
);

const EmptyChart = ({ label }) => <div className="flex h-[300px] flex-col items-center justify-center rounded-2xl bg-slate-50 dark:bg-[#0b1426]/30 text-center border border-dashed border-slate-200 dark:border-slate-800/80"><BarChart3 size={32} className="text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" /><p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p></div>;
const ChartSkeleton = ({ label }) => <div className="flex h-[300px] animate-pulse items-end gap-4 rounded-2xl bg-slate-50 dark:bg-[#0b1426]/30 p-8 border border-dashed border-slate-200 dark:border-slate-800/80" aria-label={label}>{[45, 70, 52, 88, 62, 78, 48].map((height, index) => <span key={index} className="flex-1 rounded-t-lg bg-slate-200 dark:bg-slate-800" style={{ height: `${height}%` }} />)}</div>;

const AcquisitionChannelsBreakdown = ({ data, t }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);

    const gradients = [
        'from-violet-400 to-violet-500',
        'from-cyan-400 to-cyan-500',
        'from-pink-400 to-pink-500',
        'from-amber-400 to-amber-500',
        'from-emerald-400 to-emerald-500',
        'from-blue-400 to-blue-500'
    ];

    const badges = [
        'bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:ring-violet-800/50',
        'bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:ring-cyan-800/50',
        'bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:ring-pink-800/50',
        'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-800/50',
        'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-800/50',
        'bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800/50'
    ];

    return (
        <div className="space-y-3 h-[300px] overflow-y-auto overflow-x-hidden pe-2">
            {data.map((item, index) => {
                const percentage = total > 0 ? (item.value / total) * 100 : 0;
                const grad = gradients[index % gradients.length];
                const badge = badges[index % badges.length];

                return (
                    <div key={index} className="group flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white/40 p-3.5 transition-all hover:bg-white hover:shadow-sm dark:border-slate-800/60 dark:bg-slate-900/20 dark:hover:bg-slate-900/60">
                        <div className="flex w-full flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                                <span className={`flex h-6 items-center justify-center rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${badge}`}>
                                    {item.label}
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{item.value}</span>
                                    <div className="w-14 text-end">
                                        <span className="font-mono text-base font-bold text-slate-900 dark:text-white" dir="ltr">{percentage.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-850">
                                <div
                                    className={`h-full rounded-full bg-gradient-to-r ${grad} transition-all duration-1000 ease-out`}
                                    style={{ width: `${Math.max(1.5, percentage)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const TopDoctorsLeaderboard = ({ data, money, t }) => {
    const top10 = data.slice(0, 10);
    const maxRevenue = top10.length > 0 ? top10[0].totalRevenue : 1;

    return (
        <div className="space-y-1.5 h-[300px] overflow-y-auto overflow-x-hidden pe-2">
            {top10.map((doc, index) => {
                const percentage = Math.max(2, (doc.totalRevenue / maxRevenue) * 100);
                return (
                    <div key={index} className="group relative flex items-center gap-3 rounded-xl p-2 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-xs ${index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                            index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' :
                                index === 2 ? 'bg-orange-100 text-orange-850 dark:bg-orange-900/40 dark:text-orange-400' :
                                    'bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400'
                            }`}>
                            #{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{doc.doctorName}</p>
                                    <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">{doc.clinicName || '—'} • {doc.totalExams} referrals</p>
                                </div>
                                <div className="text-end shrink-0">
                                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-white"><span dir="ltr">{doc.totalRevenue}</span></p>
                                </div>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/85">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ease-out ${index === 0 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                        index === 1 ? 'bg-gradient-to-r from-slate-400 to-slate-500' :
                                            index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                                                'bg-gradient-to-r from-cyan-400 to-cyan-500'
                                        }`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ReferralsTab;
