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
    Banknote
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { useGetReferralAnalyticsQuery } from '../store/api';
import PageHeader from '../components/ui/PageHeader';

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (date) => date.toISOString().split('T')[0];

const COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

const ReferralAnalytics = () => {
    const { t, i18n } = useTranslation('admin');
    const [startDate, setStartDate] = useState(isoDate(new Date(Date.now() - 29 * DAY)));
    const [endDate, setEndDate] = useState(isoDate(new Date()));

    const query = { startDate, endDate };
    const dateInvalid = Boolean(startDate && endDate && startDate > endDate);
    const { data, isLoading, isError, refetch } = useGetReferralAnalyticsQuery(query, { skip: dateInvalid });

    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
    const money = useMemo(() => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0
    }), [locale]);

    const setPreset = (days) => {
        setEndDate(isoDate(new Date()));
        setStartDate(isoDate(new Date(Date.now() - (days - 1) * DAY)));
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
    const doctorsData = data?.topDoctors || [];
    const totalReferrals = doctorsData.reduce((acc, curr) => acc + curr.totalExams, 0);
    const totalReferralRevenue = doctorsData.reduce((acc, curr) => acc + curr.totalRevenue, 0);
    const topDoctor = doctorsData.length > 0 ? doctorsData[0] : null;
    const bestChannel = sourcesData.length > 0 ? sourcesData[0] : null;

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
            value: money.format(totalReferralRevenue),
            note: t('analytics.kpis.totalRevenueNote', 'Generated from referrals'),
            tone: 'emerald'
        },
        {
            key: 'top_doctor',
            icon: Stethoscope,
            label: t('analytics.kpis.topDoctor', 'Top Referring Doctor'),
            value: topDoctor ? topDoctor.doctorName : '—',
            note: topDoctor ? `${money.format(topDoctor.totalRevenue)} generated` : t('analytics.kpis.noData', 'No data available'),
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
        <main className="mx-auto max-w-[1500px] space-y-6 pb-10">
            <PageHeader
                icon={Users}
                eyebrow={t('analytics.referralEyebrow', 'Marketing & ROI')}
                title={t('analytics.referralTitle', 'Referral Analytics')}
                description={t('analytics.referralDescription', 'Track patient acquisition channels and the financial performance of your referring doctors network.')}
                actions={
                    <button type="button" onClick={handleExport} disabled={dateInvalid || isLoading} className="flex items-center gap-2 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 shadow-sm transition-all hover:border-cyan-200 dark:hover:border-cyan-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:text-cyan-800 dark:hover:text-cyan-400 focus:ring-4 focus:ring-cyan-500/10 disabled:opacity-50 active:scale-95">
                        <Download size={16} aria-hidden="true" /> {t('analytics.exportReferrals', 'Export Doctor Revenue')}
                    </button>
                }
            />

            {/* Filter Bar */}
            <section className="sticky top-0 z-10 -mx-4 px-4 py-3 sm:mx-0 sm:px-0 sm:py-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-2 sm:p-3">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="flex h-10 items-center justify-center rounded-xl bg-slate-100 px-3 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <CalendarDays size={18} aria-hidden="true" />
                        </div>
                        <div className="flex flex-1 items-center gap-2 sm:w-auto">
                            <DateField label={t('analytics.startDate', 'Start Date')} value={startDate} onChange={setStartDate} />
                            <span className="text-slate-300 dark:text-slate-600 font-black">—</span>
                            <DateField label={t('analytics.endDate', 'End Date')} value={endDate} onChange={setEndDate} />
                        </div>
                    </div>
                    
                    <div className="flex w-full overflow-x-auto pb-1 sm:pb-0 sm:w-auto items-center gap-1.5" aria-label={t('analytics.presets', 'Presets')}>
                        {[7, 30, 90, 365].map((days) => (
                            <button key={days} type="button" onClick={() => setPreset(days)} className="shrink-0 rounded-lg border border-slate-200/60 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700/50">
                                {t('analytics.lastDays', { count: days, defaultValue: `Last ${days}d` })}
                            </button>
                        ))}
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

            <section aria-labelledby="kpi-heading">
                <div className="mb-3">
                    <h2 id="kpi-heading" className="text-lg font-black text-slate-900 dark:text-slate-100">{t('analytics.overview', 'Overview')}</h2>
                </div>

                {isError ? (
                    <ErrorState label={t('analytics.error', 'Failed to load data')} onRetry={refetch} t={t} />
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {kpis.map((item) => <MetricCard key={item.key} {...item} loading={isLoading} />)}
                    </div>
                )}
            </section>

            <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
                {/* Acquisition Channels Donut */}
                <section className="min-w-0 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
                    <div className="border-b border-slate-100/80 dark:border-slate-800 p-5 sm:p-6 bg-slate-50/30 dark:bg-slate-900/30">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 ring-1 ring-inset ring-violet-200/50 dark:ring-violet-800/50 shadow-[inset_0_1px_0_white] dark:shadow-none">
                                <PieChartIcon size={19} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="font-black text-slate-900 dark:text-slate-100">{t('analytics.channelsTitle', 'Acquisition Channels')}</h2>
                                <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('analytics.channelsDesc', 'Where patients book from')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 sm:p-5">
                        {isLoading ? <ChartSkeleton label={t('analytics.states.loading', 'Loading')} /> : isError ? <ErrorState label={t('analytics.states.error', 'Error')} onRetry={refetch} t={t} /> : sourcesData.length === 0 ? <EmptyChart label={t('analytics.states.noData', 'No Data')} /> : (
                            <AcquisitionChannelsBreakdown data={sourcesData} t={t} />
                        )}
                    </div>
                </section>

                {/* Top Doctors Bar Chart */}
                <section className="min-w-0 flex flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
                    <div className="border-b border-slate-100/80 dark:border-slate-800 p-5 sm:p-6 bg-slate-50/30 dark:bg-slate-900/30">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-200/50 dark:ring-blue-800/50 shadow-[inset_0_1px_0_white] dark:shadow-none">
                                <BarChart3 size={19} aria-hidden="true" />
                            </span>
                            <div>
                                <h2 className="font-black text-slate-900 dark:text-slate-100">{t('analytics.doctorsTitle', 'Top 10 Referring Doctors')}</h2>
                                <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('analytics.doctorsDesc', 'By total revenue generated')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 sm:p-5">
                        {isLoading ? <ChartSkeleton label={t('analytics.states.loading', 'Loading')} /> : isError ? <ErrorState label={t('analytics.states.error', 'Error')} onRetry={refetch} t={t} /> : doctorsData.length === 0 ? <EmptyChart label={t('analytics.states.noData', 'No Data')} /> : (
                            <TopDoctorsLeaderboard data={doctorsData} money={money} t={t} />
                        )}
                    </div>
                </section>
            </div>

            {!isLoading && !isError && (
                <DoctorsTable data={doctorsData} money={money} t={t} />
            )}
        </main>
    );
};

const DateField = ({ label, value, onChange }) => (
    <label className="block">
        <span className="sr-only">{label}</span>
        <input type="date" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="w-full sm:w-36 rounded-xl border-none bg-transparent px-2 py-1.5 text-[13px] font-bold text-slate-800 outline-none transition focus:ring-2 focus:ring-teal-500/15 dark:text-slate-200 dark:[color-scheme:dark]" />
    </label>
);

const MetricCard = ({ icon: Icon, label, value, note, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 ring-cyan-200/50 dark:ring-cyan-800/50',
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-blue-200/50 dark:ring-blue-800/50',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-800/50',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-800/50',
        slate: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200/50 dark:ring-slate-700'
    };
    return (
        <article className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-5 transition-all duration-300 hover:bg-white dark:hover:bg-slate-900/80 hover:shadow-md hover:shadow-slate-200/30 dark:hover:shadow-black/20 hover:scale-[1.01]">
            <div className="relative flex items-start justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{label}</p>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset shadow-[inset_0_1px_0_white] dark:shadow-none transition-transform duration-300 group-hover:scale-110 ${tones[tone]}`}><Icon size={18} aria-hidden="true" /></span>
            </div>
            <p className={`relative mt-4 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`} aria-live="polite">{loading ? '—' : value}</p>
            <p className="relative mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">{note}</p>
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

const DoctorsTable = ({ data, money, t }) => {
    return (
        <section className="mt-6 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="border-b border-slate-100/80 bg-slate-50/30 p-5 dark:border-slate-800 dark:bg-slate-900/30 sm:p-6">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200/50 shadow-[inset_0_1px_0_white] dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-800/50 dark:shadow-none">
                        <Users size={19} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="font-black text-slate-900 dark:text-slate-100">{t('analytics.allDoctorsTitle', 'Referrer Performance')}</h2>
                        <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('analytics.allDoctorsDesc', 'Detailed breakdown of all referring doctors')}</p>
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full table-auto text-start text-sm">
                    <thead className="border-b border-slate-100/80 bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-900/50">
                        <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <th className="px-5 py-4 font-bold text-slate-500 text-start">{t('analytics.table.doctor', 'Doctor')}</th>
                            <th className="px-5 py-4 font-bold text-slate-500 text-start">{t('analytics.table.clinic', 'Clinic / Hospital')}</th>
                            <th className="px-5 py-4 font-bold text-slate-500 text-end">{t('analytics.table.totalExams', 'Referrals')}</th>
                            <th className="px-5 py-4 font-bold text-slate-500 text-end">{t('analytics.table.totalRevenue', 'Revenue')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/80">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">{t('analytics.states.noData', 'No Data')}</td>
                            </tr>
                        ) : data.map((doc, idx) => (
                            <tr key={idx} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                <td className="px-5 py-3 font-bold text-slate-900 dark:text-slate-100">{doc.doctorName}</td>
                                <td className="px-5 py-3 font-semibold text-slate-500 dark:text-slate-400">{doc.clinicName || '—'}</td>
                                <td className="px-5 py-3 font-mono font-bold text-slate-700 dark:text-slate-300 text-end">{doc.totalExams}</td>
                                <td className="px-5 py-3 font-mono font-black text-emerald-600 dark:text-emerald-400 text-end" dir="ltr">{money.format(doc.totalRevenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const EmptyChart = ({ label }) => <div className="flex h-[350px] flex-col items-center justify-center rounded-3xl bg-slate-50 dark:bg-[#0b1426] text-center border border-dashed border-slate-200 dark:border-slate-800"><BarChart3 size={32} className="text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" /><p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{label}</p></div>;
const ChartSkeleton = ({ label }) => <div className="flex h-[350px] animate-pulse items-end gap-4 rounded-3xl bg-slate-50 dark:bg-[#0b1426] p-8 border border-dashed border-slate-200 dark:border-slate-800" aria-label={label}>{[45, 70, 52, 88, 62, 78, 48].map((height, index) => <span key={index} className="flex-1 rounded-t-xl bg-slate-200 dark:bg-slate-800" style={{ height: `${height}%` }} />)}</div>;
const tooltipStyle = { borderRadius: '16px', border: '1px solid rgb(226 232 240 / 0.8)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)', fontSize: '13px', fontWeight: 'bold', color: '#0f172a', padding: '12px 16px' };

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
        <div className="space-y-3 h-[350px] overflow-y-auto overflow-x-hidden pe-2">
            {data.map((item, index) => {
                const percentage = total > 0 ? (item.value / total) * 100 : 0;
                const grad = gradients[index % gradients.length];
                const badge = badges[index % badges.length];

                return (
                    <div key={index} className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white/50 p-4 transition-all hover:bg-white hover:shadow-md hover:shadow-slate-200/50 hover:scale-[1.01] dark:border-slate-800/60 dark:bg-slate-900/30 dark:hover:bg-slate-900/80 dark:hover:shadow-black/20">
                        <div className="flex w-full flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className={`flex h-7 items-center justify-center rounded-lg px-2.5 text-[11px] font-black uppercase tracking-wider ring-1 ring-inset ${badge}`}>
                                    {item.label}
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-sm font-bold text-slate-500 dark:text-slate-400">{item.value}</span>
                                    <span className="font-mono text-xl font-black tracking-tight text-slate-900 dark:text-white w-16 text-right" dir="ltr">{percentage.toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
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
        <div className="space-y-1.5 h-[350px] overflow-y-auto overflow-x-hidden pe-2">
            {top10.map((doc, index) => {
                const percentage = Math.max(2, (doc.totalRevenue / maxRevenue) * 100);
                return (
                    <div key={index} className="group relative flex items-center gap-4 rounded-xl p-2.5 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:scale-[1.01]">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-black text-[13px] ${
                            index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 ring-2 ring-amber-400/50 shadow-sm' :
                            index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 ring-2 ring-slate-300/50 shadow-sm' :
                            index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400 ring-2 ring-orange-300/50 shadow-sm' :
                            'bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400'
                        }`}>
                            #{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{doc.doctorName}</p>
                                    <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">{doc.clinicName || '—'} • {t('analytics.values.referralsCount', { count: doc.totalExams, defaultValue: `${doc.totalExams} referrals` })}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="font-mono text-sm font-black tracking-tight text-slate-900 dark:text-white" dir="ltr">{money.format(doc.totalRevenue)}</p>
                                </div>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                                <div 
                                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                                        index === 0 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                        index === 1 ? 'bg-gradient-to-r from-slate-400 to-slate-500' :
                                        index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                                        'bg-gradient-to-r from-blue-400 to-cyan-400 dark:from-blue-500 dark:to-cyan-500'
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

const formatMetric = (value, formatter, suffix = '') => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${formatter.format(numeric)}${suffix}` : '—';
};

export default ReferralAnalytics;
