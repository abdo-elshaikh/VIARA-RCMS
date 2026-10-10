import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    Activity, AlertTriangle, ArrowUpRight, BadgeDollarSign, CalendarRange,
    CheckCircle2, CircleDollarSign, ClipboardCheck, Landmark, Percent,
    RefreshCw, ShieldCheck, Stethoscope, Target, TrendingUp, UsersRound,
    WalletCards,
} from 'lucide-react';
import { useGetDoctorCommissionsQuery, useGetRevenueReportQuery } from '../store/api';
import { AccessibleChartData, PageHeader, PagePanel, EmptyState } from '../components/ui';

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
const ratio = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const clampPercent = value => Math.max(0, Math.min(100, toNumber(value)));

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
        examValue: result.examValue + toNumber(row.total_exam_value),
    }), { exams: 0, pending: 0, examValue: 0 });
    const chartData = revenueRows.map(row => ({
        ...row,
        label: date(row.date),
        total_revenue: toNumber(row.total_revenue),
        patient_paid: toNumber(row.patient_paid),
        insurance_claimable: toNumber(row.insurance_claimable),
    }));
    const activeRevenueDays = chartData.filter(row => row.total_revenue > 0).length;
    const averageDailyRevenue = activeRevenueDays > 0 ? totals.revenue / activeRevenueDays : 0;
    const collectionRate = ratio(totals.patientPaid, totals.revenue);
    const insuranceShare = ratio(totals.insurance, totals.revenue);
    const commissionRate = ratio(commissionTotals.pending, commissionTotals.examValue);
    const sortedCommissionRows = [...commissionRows].sort((a, b) => toNumber(b.commission_pending ?? b.commission_est) - toNumber(a.commission_pending ?? a.commission_est));
    const topDoctor = sortedCommissionRows[0];
    const topDoctorCommission = topDoctor ? toNumber(topDoctor.commission_pending ?? topDoctor.commission_est) : 0;
    const peakRevenueDay = [...chartData].sort((a, b) => b.total_revenue - a.total_revenue)[0];
    const latestRevenueDay = chartData[chartData.length - 1];
    const riskItems = [
        {
            icon: Percent,
            title: t('dashboard.collectionCoverage', { defaultValue: 'Collection coverage' }),
            value: `${number(collectionRate)}%`,
            detail: t('dashboard.collectionCoverageDetail', { defaultValue: 'Patient-responsibility value against gross revenue.' }),
            tone: collectionRate >= 35 ? 'emerald' : 'amber',
        },
        {
            icon: Landmark,
            title: t('dashboard.claimExposure', { defaultValue: 'Insurance exposure' }),
            value: `${number(insuranceShare)}%`,
            detail: t('dashboard.claimExposureDetail', { defaultValue: 'Claimable revenue that needs payer follow-up.' }),
            tone: insuranceShare >= 45 ? 'blue' : 'slate',
        },
        {
            icon: Stethoscope,
            title: t('dashboard.commissionLoad', { defaultValue: 'Commission load' }),
            value: `${number(commissionRate)}%`,
            detail: t('dashboard.commissionLoadDetail', { defaultValue: 'Outstanding physician commission versus exam value.' }),
            tone: commissionRate >= 20 ? 'amber' : 'emerald',
        },
    ];
    const controlItems = [
        {
            label: t('dashboard.revenueReconciliation', { defaultValue: 'Revenue reconciliation' }),
            value: chartData.length ? t('dashboard.active', { defaultValue: 'Active' }) : t('dashboard.waitingForData', { defaultValue: 'Waiting for data' }),
            complete: chartData.length > 0,
        },
        {
            label: t('dashboard.claimMonitoring', { defaultValue: 'Claim monitoring' }),
            value: totals.insurance > 0 ? t('dashboard.coverageDetected', { defaultValue: 'Coverage detected' }) : t('dashboard.noClaimExposure', { defaultValue: 'No claim exposure' }),
            complete: totals.insurance > 0,
        },
        {
            label: t('dashboard.commissionAccrual', { defaultValue: 'Commission accrual' }),
            value: commissionRows.length ? t('dashboard.physiciansTracked', { count: number(commissionRows.length), defaultValue: '{{count}} physicians tracked' }) : t('dashboard.noAccruals', { defaultValue: 'No accruals' }),
            complete: commissionRows.length > 0,
        },
    ];
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
                metrics={[
                    { key: 'revenue', icon: BadgeDollarSign, tone: 'cyan', label: t('dashboard.revenue'), value: currency(totals.revenue), detail: t('dashboard.revenueDetail'), loading: revLoading, error: revenueError },
                    { key: 'patient', icon: WalletCards, tone: 'emerald', label: t('dashboard.patientPaid'), value: currency(totals.patientPaid), detail: t('dashboard.patientPaidDetail'), loading: revLoading, error: revenueError },
                    { key: 'claims', icon: CircleDollarSign, tone: 'blue', label: t('dashboard.claims'), value: currency(totals.insurance), detail: t('dashboard.claimsDetail'), loading: revLoading, error: revenueError },
                    { key: 'commission', icon: Stethoscope, tone: 'violet', label: t('dashboard.commissions'), value: currency(commissionTotals.pending), detail: t('dashboard.commissionsDetail', { count: number(commissionRows.length) }), loading: commLoading, error: commissionsError },
                ]}
                metricsLabel={t('dashboard.metricsLabel')}
            />

            {isError && (
                <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/10 p-4 text-rose-900 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-3 text-sm font-semibold"><AlertTriangle size={19} className="shrink-0 text-rose-600 dark:text-rose-400" />{t('dashboard.loadError')}</span>
                    <button type="button" onClick={refreshAll} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-rose-950 px-3.5 py-2 text-sm font-bold text-rose-700 dark:text-rose-400 shadow-sm ring-1 ring-rose-200 dark:ring-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/50"><RefreshCw size={15} />{t('dashboard.tryAgain')}</button>
                </div>
            )}


            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1426] sm:p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[.16em] text-teal-700 dark:text-teal-300">{t('dashboard.commandSummary', { defaultValue: 'Executive command summary' })}</p>
                            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{t('dashboard.financialControlTitle', { defaultValue: 'Financial control and operating exposure' })}</h2>
                            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">{t('dashboard.financialControlDescription', { defaultValue: 'A consolidated view of billed revenue, payer exposure, patient responsibility, and physician commission obligations.' })}</p>
                        </div>
                        <PanelBadge>{t('dashboard.liveFinance', { defaultValue: 'Finance + governance' })}</PanelBadge>
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-3">
                        {riskItems.map(item => <InsightCard key={item.title} {...item} />)}
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                            <ProgressRow label={t('dashboard.patientPaid')} value={totals.patientPaid} total={totals.revenue} display={currency(totals.patientPaid)} percent={collectionRate} tone="emerald" />
                            <ProgressRow label={t('dashboard.claims')} value={totals.insurance} total={totals.revenue} display={currency(totals.insurance)} percent={insuranceShare} tone="blue" />
                            <ProgressRow label={t('dashboard.commissions')} value={commissionTotals.pending} total={commissionTotals.examValue} display={currency(commissionTotals.pending)} percent={commissionRate} tone="violet" />
                        </div>

                        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                            <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{t('dashboard.attentionFocus', { defaultValue: 'Attention focus' })}</p>
                            <div className="mt-3 space-y-3">
                                <MiniFact label={t('dashboard.topCommissionDoctor', { defaultValue: 'Top commission' })} value={topDoctor?.doctor_name || '-'} detail={currency(topDoctorCommission)} />
                                <MiniFact label={t('dashboard.peakRevenueDay', { defaultValue: 'Peak revenue day' })} value={peakRevenueDay?.label || '-'} detail={currency(peakRevenueDay?.total_revenue)} />
                                <MiniFact label={t('dashboard.latestPostedDay', { defaultValue: 'Latest posted day' })} value={latestRevenueDay?.label || '-'} detail={currency(latestRevenueDay?.total_revenue)} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1426] sm:p-6">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60">
                            <ClipboardCheck size={18} />
                        </span>
                        <div>
                            <h2 className="text-base font-black text-slate-950 dark:text-white">{t('dashboard.controlReadiness', { defaultValue: 'Control readiness' })}</h2>
                            <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">{t('dashboard.controlReadinessDescription', { defaultValue: 'Daily checks that help administrators spot missing financial or commission activity quickly.' })}</p>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {controlItems.map(item => (
                            <div key={item.label} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">{item.label}</p>
                                    <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{item.value}</p>
                                </div>
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                                    {item.complete ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.75fr)]">
                <PagePanel title={t('dashboard.revenueOverview')} description={t('dashboard.revenueOverviewDescription')} icon={TrendingUp} action={<PanelBadge>{t('dashboard.yearToDate')}</PanelBadge>}>
                    {revLoading ? <PanelSkeleton /> : chartData.length > 0 ? (
                        <>
                            <AccessibleChartData
                                title={t('dashboard.revenueOverview')}
                                summary={t('dashboard.chartSummary', { count: chartData.length, defaultValue: '{{count}} data points showing revenue and insurance claims.' })}
                                rows={chartData}
                                columns={[
                                    { key: 'label', label: t('dashboard.date', { defaultValue: 'Date' }) },
                                    { key: 'total_revenue', label: t('dashboard.revenue'), render: row => currency(row.total_revenue) },
                                    { key: 'insurance_claimable', label: t('dashboard.claims'), render: row => currency(row.insurance_claimable) },
                                ]}
                                disclosureLabel={t('dashboard.viewChartData', { defaultValue: 'View chart data' })}
                                tableLabel={t('dashboard.chartDataTable', { defaultValue: 'Revenue overview data' })}
                            >
                                <div className="h-72 min-w-0 sm:h-80">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={chartData} margin={{ top: 12, right: 4, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="adminRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.28} /><stop offset="95%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient>
                                            <linearGradient id="adminInsurance" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 5" stroke="#e2e8f0" vertical={false} />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={value => compactNumber(value, locale)} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                                        <Tooltip contentStyle={chartTooltipStyle} formatter={(value, name) => [currency(value), name]} />
                                        <Area type="monotone" dataKey="total_revenue" name={t('dashboard.revenue')} stroke="#06b6d4" strokeWidth={3} fill="url(#adminRevenue)" />
                                        <Area type="monotone" dataKey="insurance_claimable" name={t('dashboard.claims')} stroke="#3b82f6" strokeWidth={2.5} fill="url(#adminInsurance)" />
                                    </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </AccessibleChartData>
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
                                    {sortedCommissionRows.map((doctor, index) => (
                                        <tr key={doctor.doctor_id || `${doctor.doctor_name}-${index}`} className="group transition hover:bg-cyan-50/40 dark:hover:bg-cyan-900/10">
                                            <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold text-slate-600 dark:text-slate-400 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/40 group-hover:text-cyan-700 dark:group-hover:text-cyan-400">{initials(doctor.doctor_name)}</span>
                                                    <div className="min-w-0">
                                                        <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-200">{doctor.doctor_name}</span>
                                                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                            <span className="block h-full rounded-full bg-cyan-500" style={{ width: `${clampPercent(ratio(toNumber(doctor.commission_pending ?? doctor.commission_est), topDoctorCommission || 1))}%` }} />
                                                        </span>
                                                    </div>
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

            <section className="grid gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0b1426] p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4 sm:p-6" aria-label={t('dashboard.financialSnapshot')}>
                <Snapshot icon={CheckCircle2} label={t('dashboard.examinations')} value={number(commissionTotals.exams)} />
                <Snapshot icon={CircleDollarSign} label={t('dashboard.insuranceShare')} value={`${number(insuranceShare)}%`} />
                <Snapshot icon={ArrowUpRight} label={t('dashboard.averageRevenue')} value={currency(averageDailyRevenue)} />
                <Snapshot icon={Target} label={t('dashboard.activeRevenueDays', { defaultValue: 'Active revenue days' })} value={number(activeRevenueDays)} />
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

const InsightCard = ({ icon: Icon, title, value, detail, tone = 'slate' }) => {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
        amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
        blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300',
        slate: 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    };
    return (
        <article className={`rounded-2xl border p-4 ${tones[tone] || tones.slate}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-black opacity-80">{title}</p>
                    <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75 shadow-sm dark:bg-slate-950/40">
                    <Icon size={18} />
                </span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 opacity-80">{detail}</p>
        </article>
    );
};

const ProgressRow = ({ label, display, percent, tone = 'emerald' }) => {
    const tones = {
        emerald: 'bg-emerald-500',
        blue: 'bg-blue-500',
        violet: 'bg-violet-500',
    };
    return (
        <div>
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-black text-slate-700 dark:text-slate-200">{label}</span>
                <span className="font-bold text-slate-500 dark:text-slate-400">{display} / {Math.round(clampPercent(percent))}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                <span className={`block h-full rounded-full ${tones[tone] || tones.emerald}`} style={{ width: `${clampPercent(percent)}%` }} />
            </div>
        </div>
    );
};

const MiniFact = ({ label, value, detail }) => (
    <div className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100 dark:bg-slate-950/35 dark:ring-slate-800">
        <p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</p>
        <p className="mt-1 truncate text-sm font-black text-slate-900 dark:text-white">{value}</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
);

const compactNumber = (value, locale = 'en-US') => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toNumber(value));
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export default Admin;
