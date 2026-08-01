import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Building2,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    DollarSign,
    ExternalLink,
    FileText,
    Mail,
    MapPin,
    MessageCircle,
    Percent,
    Phone,
    RefreshCw,
    Send,
    Stethoscope,
    Target,
    TrendingUp,
    UserRound,
    Users,
    XCircle
} from 'lucide-react';
import { useGetReferringDoctorStatsQuery } from '../store/api';
import { Button, EmptyState, MetricCard, PageHeader, Skeleton } from '../components/ui';

const formatDate = (value, locale, withTime = false) => {
    if (!value) return '-';
    try {
        return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value));
    } catch {
        return '-';
    }
};

const formatCurrency = (value, locale) => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0
}).format(Number(value || 0));

const getInitials = (name = '') => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'DR';

const fallback = '-';

export default function DoctorDetailPage() {
    const { doctorId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['admin', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { data, isLoading, isFetching, isError, refetch } = useGetReferringDoctorStatsQuery(doctorId);

    if (isLoading) {
        return (
            <div className="space-y-5 p-4 sm:p-6 lg:p-8">
                <Skeleton className="h-36 w-full rounded-2xl" />
                <div className="grid gap-4 md:grid-cols-4">
                    {[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-32 rounded-2xl" />)}
                </div>
                <Skeleton className="h-80 w-full rounded-2xl" />
            </div>
        );
    }

    const doctor = data?.doctor;
    const stats = data?.stats || {};
    const recentReferrals = data?.recentReferrals || [];

    if (isError || !doctor) {
        return (
            <div className="p-4 sm:p-6 lg:p-8">
                <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <EmptyState
                        icon={Stethoscope}
                        title={t('doctors.notFound', 'Doctor not found')}
                        description={t('doctors.notFoundDesc', 'The requested referring doctor record could not be found.')}
                    />
                    <Button className="mt-4" onClick={() => navigate('/referring-doctors')}>
                        {isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                        {t('actions.back', { ns: 'common', defaultValue: 'Back' })}
                    </Button>
                </section>
            </div>
        );
    }

    const statusTone = doctor.is_active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
        : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
    const conversionRate = Number(stats.appointment_count || 0) > 0
        ? Math.round((Number(stats.exam_count || 0) / Number(stats.appointment_count || 1)) * 100)
        : 0;
    const appointmentCount = Number(stats.appointment_count || 0);
    const examCount = Number(stats.exam_count || 0);
    const pendingConversionCount = Math.max(appointmentCount - examCount, 0);
    const averageRevenue = appointmentCount > 0 ? Number(stats.total_revenue || 0) / appointmentCount : 0;
    const lastReferralAt = stats.last_referral_at || recentReferrals[0]?.start_time;

    return (
        <div className="space-y-5">
            <PageHeader
                icon={Stethoscope}
                eyebrow={t('doctors.profileEyebrow', { defaultValue: 'Referral partner profile' })}
                title={doctor.full_name}
                description={t('doctors.profileDescription', {
                    specialty: doctor.specialty || t('referringDoctors.values.general', { defaultValue: 'General' }),
                    clinic: doctor.clinic_hospital || t('referringDoctors.values.independent', { defaultValue: 'Independent practice' }),
                    defaultValue: '{{specialty}} at {{clinic}}'
                })}
                meta={(
                    <>
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 text-sm font-black text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-900/60">
                            {getInitials(doctor.full_name)}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone}`}>
                            {doctor.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            {doctor.is_active ? t('referringDoctors.status.active', { defaultValue: 'Active' }) : t('referringDoctors.status.inactive', { defaultValue: 'Inactive' })}
                        </span>
                        <MetaPill icon={Building2}>{doctor.clinic_hospital || t('referringDoctors.values.independent', { defaultValue: 'Independent practice' })}</MetaPill>
                        <MetaPill icon={Activity}>{doctor.specialty || t('referringDoctors.values.general', { defaultValue: 'General' })}</MetaPill>
                    </>
                )}
                actions={(
                    <>
                        <Button variant="secondary" onClick={() => navigate('/communications')}>
                            <Mail size={15} />
                            {t('doctors.sendMessage', { defaultValue: 'Message' })}
                        </Button>
                        <Button onClick={() => navigate('/analytics')}>
                            <ExternalLink size={15} />
                            {t('doctors.analytics', { defaultValue: 'Referral analytics' })}
                        </Button>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {isRtl ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                            {t('actions.back', { ns: 'common', defaultValue: 'Back' })}
                        </button>
                        <button
                            type="button"
                            onClick={refetch}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            {t('actions.refresh', { ns: 'common', defaultValue: 'Refresh' })}
                        </button>
                    </>
                )}
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label={t('doctors.performanceSummary', { defaultValue: 'Doctor referral performance summary' })}>
                <MetricCard
                    icon={Users}
                    tone="cyan"
                    label={t('doctors.totalReferrals', { defaultValue: 'Total appointments' })}
                    value={Number(stats.appointment_count || 0).toLocaleString(locale)}
                    detail={t('doctors.totalReferralsDetail', { defaultValue: 'Appointments attributed to this partner' })}
                />
                <MetricCard
                    icon={FileText}
                    tone="blue"
                    label={t('doctors.examCount', { defaultValue: 'Completed exams' })}
                    value={Number(stats.exam_count || 0).toLocaleString(locale)}
                    detail={t('doctors.examCountDetail', { rate: conversionRate, defaultValue: '{{rate}}% appointment-to-exam completion' })}
                />
                <MetricCard
                    icon={DollarSign}
                    tone="emerald"
                    label={t('doctors.revenue', { defaultValue: 'Generated revenue' })}
                    value={formatCurrency(stats.total_revenue, locale)}
                    detail={t('doctors.revenueDetail', { defaultValue: 'Recorded referral revenue' })}
                />
                <MetricCard
                    icon={Percent}
                    tone="amber"
                    label={t('doctors.commission', { defaultValue: 'Estimated commission' })}
                    value={formatCurrency(stats.commission_est, locale)}
                    detail={t('doctors.commissionDetail', { percent: Number(doctor.commission_percentage || 0), defaultValue: '{{percent}}% configured commission' })}
                />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60">
                                <ClipboardList size={18} />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('doctors.recentReferrals', { defaultValue: 'Recent patient referrals' })}</h2>
                                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{t('doctors.recentReferralsDesc', { defaultValue: 'Latest appointments and examinations sourced from this doctor.' })}</p>
                            </div>
                        </div>
                        <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('doctors.recordsCount', { count: recentReferrals.length, defaultValue: '{{count}} records' })}
                        </span>
                    </header>

                    {recentReferrals.length === 0 ? (
                        <div className="px-5 py-12">
                            <EmptyState
                                icon={CalendarDays}
                                title={t('doctors.noReferrals', { defaultValue: 'No recent referrals recorded' })}
                                description={t('doctors.noReferralsDesc', { defaultValue: 'New referred appointments will appear here once they are scheduled.' })}
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-start text-sm">
                                <thead className="border-b border-slate-100 bg-white text-[10px] font-black uppercase tracking-[.14em] text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                                    <tr>
                                        <th className="px-5 py-4 text-start">{t('doctors.table.date', { defaultValue: 'Date' })}</th>
                                        <th className="px-5 py-4 text-start">{t('doctors.table.patient', { defaultValue: 'Patient' })}</th>
                                        <th className="px-5 py-4 text-start">{t('doctors.table.exam', { defaultValue: 'Exam' })}</th>
                                        <th className="px-5 py-4 text-start">{t('doctors.table.modality', { defaultValue: 'Modality' })}</th>
                                        <th className="px-5 py-4 text-start">{t('doctors.table.status', { defaultValue: 'Status' })}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {recentReferrals.map((ref, index) => (
                                        <tr key={ref.appointment_id || index} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                            <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-slate-500">{formatDate(ref.start_time, locale, true)}</td>
                                            <td className="whitespace-nowrap px-5 py-4">
                                                <p className="font-mono text-xs font-black text-teal-700 dark:text-teal-300">{ref.mrn || fallback}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="font-bold text-slate-950 dark:text-white">{ref.exam_type_name || t('doctors.generalExam', { defaultValue: 'General examination' })}</p>
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500">{ref.machine_name || fallback}</td>
                                            <td className="whitespace-nowrap px-5 py-4">
                                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                    {ref.status ? t(`doctors.statuses.${ref.status}`, { defaultValue: ref.status }) : t('doctors.scheduled', { defaultValue: 'Scheduled' })}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60">
                                <Send size={18} />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('doctors.quickActions', { defaultValue: 'Quick actions' })}</h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('doctors.quickActionsDesc', { defaultValue: 'Reach the clinic contact or open related workspaces.' })}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2">
                            <ActionLink icon={Phone} href={doctor.phone ? `tel:${doctor.phone}` : undefined} disabled={!doctor.phone}>
                                {t('doctors.callDoctor', { defaultValue: 'Call doctor' })}
                            </ActionLink>
                            <ActionLink icon={Mail} href={doctor.email ? `mailto:${doctor.email}` : undefined} disabled={!doctor.email}>
                                {t('doctors.emailDoctor', { defaultValue: 'Email doctor' })}
                            </ActionLink>
                            <button
                                type="button"
                                onClick={() => navigate('/communications')}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <MessageCircle size={15} />
                                {t('doctors.openConversation', { defaultValue: 'Open conversation center' })}
                            </button>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <UserRound size={18} />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('doctors.partnerProfile', { defaultValue: 'Partner profile' })}</h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('doctors.partnerProfileDesc', { defaultValue: 'Contact, clinic, and contract identifiers.' })}</p>
                            </div>
                        </div>
                        <dl className="mt-5 space-y-4">
                            <Detail icon={Phone} label={t('referringDoctors.form.phone', { defaultValue: 'Phone' })} value={doctor.phone} />
                            <Detail icon={Mail} label={t('referringDoctors.form.email', { defaultValue: 'Email' })} value={doctor.email} />
                            <Detail icon={MapPin} label={t('referringDoctors.form.address', { defaultValue: 'Address' })} value={doctor.address} />
                            <Detail icon={FileText} label={t('referringDoctors.form.contractId', { defaultValue: 'Contract ID' })} value={doctor.contract_id} />
                            <Detail icon={TrendingUp} label={t('referringDoctors.form.source', { defaultValue: 'Source category' })} value={doctor.referral_source_category} />
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <BarChart3 size={18} />
                            </span>
                            <div>
                                <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('doctors.relationshipHealth', { defaultValue: 'Relationship health' })}</h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('doctors.relationshipHealthDesc', { defaultValue: 'Recent activity and financial signal quality.' })}</p>
                            </div>
                        </div>
                        <div className="mt-4 space-y-3">
                            <HealthRow label={t('doctors.completionRate', { defaultValue: 'Completion rate' })} value={`${conversionRate}%`} />
                            <HealthRow label={t('doctors.pendingConversion', { defaultValue: 'Pending conversion' })} value={pendingConversionCount.toLocaleString(locale)} />
                            <HealthRow label={t('doctors.avgRevenue', { defaultValue: 'Revenue per appointment' })} value={formatCurrency(averageRevenue, locale)} />
                            <HealthRow label={t('doctors.commissionRate', { defaultValue: 'Commission rate' })} value={`${Number(doctor.commission_percentage || 0)}%`} />
                            <HealthRow label={t('doctors.lastReferral', { defaultValue: 'Last referral' })} value={formatDate(lastReferralAt, locale, true)} />
                        </div>
                        <div className="mt-5 space-y-2">
                            <ProgressSignal
                                icon={Target}
                                label={t('doctors.completionSignal', { defaultValue: 'Appointment completion' })}
                                value={conversionRate}
                                detail={t('doctors.completionSignalDetail', { completed: examCount, total: appointmentCount, defaultValue: '{{completed}} of {{total}} completed' })}
                            />
                        </div>
                        {doctor.notes && (
                            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{t('referringDoctors.form.notes', { defaultValue: 'Notes' })}</p>
                                <p className="mt-1 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">{doctor.notes}</p>
                            </div>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}

const MetaPill = ({ icon: Icon, children }) => (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Icon size={13} className="shrink-0 text-slate-400" />
        <span className="truncate">{children}</span>
    </span>
);

const Detail = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Icon size={15} />
        </span>
        <div className="min-w-0">
            <dt className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-200">{value || fallback}</dd>
        </div>
    </div>
);

const ActionLink = ({ icon: Icon, href, disabled, children }) => {
    const className = `inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${disabled
        ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-600'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 dark:hover:bg-slate-800'
        }`;

    if (disabled) {
        return (
            <span className={className}>
                <Icon size={15} />
                {children}
            </span>
        );
    }

    return (
        <a href={href} className={className}>
            <Icon size={15} />
            {children}
        </a>
    );
};

const ProgressSignal = ({ icon: Icon, label, value, detail }) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
        <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <Icon size={14} className="text-teal-600 dark:text-teal-300" />
                {label}
            </span>
            <span className="font-mono text-xs font-black text-slate-950 dark:text-white">{value}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
);

const HealthRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/30">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-mono text-sm font-black text-slate-950 dark:text-white">{value}</span>
    </div>
);
