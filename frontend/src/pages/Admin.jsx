import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    Activity, AlertTriangle, ArrowUpRight, BadgeDollarSign, CalendarRange,
    CheckCircle2, CircleDollarSign, RefreshCw, ShieldCheck, Stethoscope,
    TrendingUp, UsersRound, WalletCards,
} from 'lucide-react';
import { useGetDoctorCommissionsQuery, useGetRevenueReportQuery } from '../store/api';
import { PageHeader, MetricCard, PagePanel, EmptyState } from '../components/ui';

const chartTooltipStyle = {
    background: 'rgba(255, 255, 255, 0.96)',
    backdropFilter: 'blur(10px)',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    boxShadow: '0 18px 40px -14px rgba(15, 23, 42, .24)',
    color: '#0f172a',
    fontSize: '12px',
    fontWeight: 700,
};

const toNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const Admin = () => {
    const { t: translate, i18n } = useTranslation('admin');
    const t = (key, options) => translate(key.replace(/^dashboard\./, 'adminDashboard.'), options);
    const year = new Date().getFullYear();
    const reportRange = useMemo(() => ({
        startDate: `${year}-01-01`,
        endDate: new Date().toISOString().slice(0, 10),
    }), [year]);
    const {
        data: revenueData = [], isLoading: revLoading, isFetching: revFetching,
        isError: revenueError, refetch: refetchRevenue,
    } = useGetRevenueReportQuery(reportRange);
    const {
        data: commissionsData = [], isLoading: commLoading, isFetching: commFetching,
        isError: commissionsError, refetch: refetchCommissions,
    } = useGetDoctorCommissionsQuery();

    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
    const currency = value => new Intl.NumberFormat(locale, {
        style: 'currency', currency: 'EGP', maximumFractionDigits: 0,
    }).format(toNumber(value));
    const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNumber(value));
    const date = value => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));

    const revenueRows = Array.isArray(revenueData) ? revenueData : [];
    const commissionRows = Array.isArray(commissionsData) ? commissionsData : [];
    const totals = revenueRows.reduce((result, row) => ({
        revenue: result.revenue + toNumber(row.total_revenue),
        patientPaid: result.patientPaid + toNumber(row.patient_paid),
        insurance: result.insurance + toNumber(row.insurance_claimable),
    }), { revenue: 0, patientPaid: 0, insurance: 0 });
    const commissionTotals = commissionRows.reduce((result, row) => ({
        exams: result.exams + toNumber(row.total_exams),
        pending: result.pending + toNumber(row.commission_pending ?? row.commission_est),
    }), { exams: 0, pending: 0 });
    const chartData = revenueRows.map(row => ({
        ...row,
        label: date(row.date),
        total_revenue: toNumber(row.total_revenue),
        patient_paid: toNumber(row.patient_paid),
        insurance_claimable: toNumber(row.insurance_claimable),
    }));
    const isFetching = revFetching || commFetching;
    const isError = revenueError || commissionsError;

    const refreshAll = () => {
        refetchRevenue();
        refetchCommissions();
    };

    return (
        <div className="space-y-5 sm:space-y-6">
            <PageHeader
                icon={ShieldCheck}
                eyebrowIcon={Activity}
                eyebrow={t('dashboard.eyebrow')}
                title={t('dashboard.title')}
                description={t('dashboard.subtitle')}
                actions={
                    <>
                        <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <CalendarRange size={15} className="text-teal-600 dark:text-teal-300" />
                            {t('dashboard.period', { year })}
                        </div>
                        <button type="button" onClick={refreshAll} disabled={isFetching} aria-label={isFetching ? t('dashboard.refreshing') : t('dashboard.refresh')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-teal-100">
                            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                            {isFetching ? t('dashboard.refreshing') : t('dashboard.refresh')}
                        </button>
                    </>
                }
            />

            {isError && (
                <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/10 p-4 text-rose-900 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-3 text-sm font-semibold"><AlertTriangle size={19} className="shrink-0 text-rose-600 dark:text-rose-400" />{t('dashboard.loadError')}</span>
                    <button type="button" onClick={refreshAll} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-rose-950 px-3.5 py-2 text-sm font-bold text-rose-700 dark:text-rose-400 shadow-sm ring-1 ring-rose-200 dark:ring-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/50"><RefreshCw size={15} />{t('dashboard.tryAgain')}</button>
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('dashboard.metricsLabel')}>
                <MetricCard icon={BadgeDollarSign} tone="cyan" label={t('dashboard.revenue')} value={currency(totals.revenue)} detail={t('dashboard.revenueDetail')} loading={revLoading} />
                <MetricCard icon={WalletCards} tone="emerald" label={t('dashboard.patientPaid')} value={currency(totals.patientPaid)} detail={t('dashboard.patientPaidDetail')} loading={revLoading} />
                <MetricCard icon={CircleDollarSign} tone="blue" label={t('dashboard.claims')} value={currency(totals.insurance)} detail={t('dashboard.claimsDetail')} loading={revLoading} />
                <MetricCard icon={Stethoscope} tone="violet" label={t('dashboard.commissions')} value={currency(commissionTotals.pending)} detail={t('dashboard.commissionsDetail', { count: number(commissionRows.length) })} loading={commLoading} />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.75fr)]">
                <PagePanel title={t('dashboard.revenueOverview')} description={t('dashboard.revenueOverviewDescription')} icon={TrendingUp} action={<PanelBadge>{t('dashboard.yearToDate')}</PanelBadge>}>
                    {revLoading ? <PanelSkeleton /> : chartData.length > 0 ? (
                        <>
                            <div className="h-72 min-w-0 sm:h-80" role="img" aria-label={t('dashboard.revenueOverview')}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={chartData} margin={{ top: 12, right: 4, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="adminRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.28} /><stop offset="95%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient>
                                            <linearGradient id="adminInsurance" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 5" stroke="#e2e8f0" vertical={false} />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={compactNumber} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                                        <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [currency(value), name]} />
                                        <Area type="monotone" dataKey="total_revenue" name={t('dashboard.revenue')} stroke="#06b6d4" strokeWidth={3} fill="url(#adminRevenue)" />
                                        <Area type="monotone" dataKey="insurance_claimable" name={t('dashboard.claims')} stroke="#3b82f6" strokeWidth={2.5} fill="url(#adminInsurance)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 flex flex-wrap justify-center gap-5 border-t border-slate-100 dark:border-slate-800 pt-4">
                                <LegendItem color="bg-cyan-500" label={t('dashboard.revenue')} />
                                <LegendItem color="bg-blue-500" label={t('dashboard.claims')} />
                            </div>
                        </>
                    ) : <EmptyState icon={TrendingUp} title={t('dashboard.noRevenue')} description={t('dashboard.noRevenueDescription')} />}
                </PagePanel>

                <PagePanel title={t('dashboard.performance')} description={t('dashboard.performanceDescription')} icon={UsersRound} action={<PanelBadge>{t('dashboard.doctorCount', { count: number(commissionRows.length) })}</PanelBadge>}>
                    {commLoading ? <PanelSkeleton compact /> : commissionRows.length > 0 ? (
                        <div className="-mx-2 overflow-x-auto">
                            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-start">
                                <thead>
                                    <tr className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                        <th className="border-b border-slate-200 dark:border-slate-800 px-3 py-3 text-start">{t('dashboard.doctor')}</th>
                                        <th className="border-b border-slate-200 dark:border-slate-800 px-3 py-3 text-center">{t('dashboard.exams')}</th>
                                        <th className="border-b border-slate-200 dark:border-slate-800 px-3 py-3 text-end">{t('dashboard.value')}</th>
                                        <th className="border-b border-slate-200 dark:border-slate-800 px-3 py-3 text-end">{t('dashboard.commission')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commissionRows.map((doctor, index) => (
                                        <tr key={doctor.doctor_id || `${doctor.doctor_name}-${index}`} className="group transition hover:bg-cyan-50/40 dark:hover:bg-cyan-900/10">
                                            <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold text-slate-600 dark:text-slate-400 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/40 group-hover:text-cyan-700 dark:group-hover:text-cyan-400">{initials(doctor.doctor_name)}</span>
                                                    <span className="min-w-0 truncate text-sm font-bold text-slate-800 dark:text-slate-200">{doctor.doctor_name}</span>
                                                </div>
                                            </td>
                                            <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-3.5 text-center text-sm font-semibold text-slate-600 dark:text-slate-400">{number(doctor.total_exams)}</td>
                                            <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-3.5 text-end text-sm font-semibold text-slate-600 dark:text-slate-400">{currency(doctor.total_exam_value)}</td>
                                            <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-3.5 text-end text-sm font-extrabold text-emerald-700 dark:text-emerald-400">{currency(doctor.commission_pending ?? doctor.commission_est)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <EmptyState icon={Stethoscope} title={t('dashboard.noPerformance')} description={t('dashboard.noPerformanceDescription')} />}
                </PagePanel>
            </div>

            <section className="grid gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0b1426] p-5 shadow-sm sm:grid-cols-3 sm:p-6" aria-label={t('dashboard.financialSnapshot')}>
                <Snapshot icon={CheckCircle2} label={t('dashboard.examinations')} value={number(commissionTotals.exams)} />
                <Snapshot icon={CircleDollarSign} label={t('dashboard.insuranceShare')} value={totals.revenue > 0 ? `${number((totals.insurance / totals.revenue) * 100)}%` : '0%'} />
                <Snapshot icon={ArrowUpRight} label={t('dashboard.averageRevenue')} value={currency(chartData.length > 0 ? totals.revenue / chartData.length : 0)} />
            </section>
        </div>
    );
};

const PanelBadge = ({ children }) => <span className="shrink-0 rounded-full border border-cyan-100 dark:border-cyan-900/50 bg-cyan-50 dark:bg-cyan-900/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">{children}</span>;
const LegendItem = ({ color, label }) => <span className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
const PanelSkeleton = ({ compact = false }) => <div className={`flex-1 animate-pulse rounded-xl bg-slate-100/70 dark:bg-slate-800/70 ${compact ? 'min-h-56' : 'min-h-72'}`} />;

const Snapshot = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 p-4 ring-1 ring-slate-100 dark:ring-slate-800">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 shadow-sm"><Icon size={18} /></span>
        <div className="min-w-0"><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-0.5 truncate text-lg font-extrabold text-slate-900 dark:text-white">{value}</p></div>
    </div>
);

const compactNumber = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(toNumber(value));
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export default Admin;
