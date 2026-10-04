import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Building2,
    Calendar,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Clock,
    DollarSign,
    ExternalLink,
    FileText,
    Mail,
    MapPin,
    MessageCircle,
    Package,
    Percent,
    Phone,
    Plus,
    RefreshCw,
    Send,
    Stethoscope,
    Target,
    TrendingUp,
    UserRound,
    Users,
    XCircle
} from 'lucide-react';
import {
    useGetReferringDoctorStatsQuery,
    useGetDoctorInteractionsQuery,
    useCreateDoctorInteractionMutation
} from '../store/api';
import { Button, EmptyState, MetricCard, Modal, PageHeader, Skeleton } from '../components/ui';

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

    const [activeTab, setActiveTab] = useState('referrals');
    const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
    const [interactionForm, setInteractionForm] = useState({
        interactionType: 'Visit',
        purpose: 'Routine Liaison',
        interactionDate: new Date().toISOString().slice(0, 16),
        materialsDelivered: '',
        notes: '',
        nextFollowUpDate: ''
    });

    const { data, isLoading, isFetching, isError, refetch } = useGetReferringDoctorStatsQuery(doctorId);
    const { data: interactions = [], isLoading: isLoadingInteractions, isFetching: isFetchingInteractions, refetch: refetchInteractions } = useGetDoctorInteractionsQuery(doctorId);
    const [createDoctorInteraction, { isLoading: isSubmittingInteraction }] = useCreateDoctorInteractionMutation();

    const handleSaveInteraction = async (e) => {
        e.preventDefault();
        try {
            await createDoctorInteraction({
                doctorId,
                interactionType: interactionForm.interactionType,
                purpose: interactionForm.purpose,
                interactionDate: interactionForm.interactionDate ? new Date(interactionForm.interactionDate).toISOString() : new Date().toISOString(),
                materialsDelivered: interactionForm.materialsDelivered || null,
                notes: interactionForm.notes || null,
                nextFollowUpDate: interactionForm.nextFollowUpDate || null
            }).unwrap();

            toast.success(t('doctors.interactionSuccess', { defaultValue: 'تم تسجيل الزيارة الميدانية بنجاح' }));
            setIsInteractionModalOpen(false);
            setInteractionForm({
                interactionType: 'Visit',
                purpose: 'Routine Liaison',
                interactionDate: new Date().toISOString().slice(0, 16),
                materialsDelivered: '',
                notes: '',
                nextFollowUpDate: ''
            });
            refetch();
            refetchInteractions();
        } catch (err) {
            toast.error(err?.data?.message || t('doctors.interactionError', { defaultValue: 'حدث خطأ أثناء حفظ الزيارة' }));
        }
    };

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
                        <Button onClick={() => setIsInteractionModalOpen(true)}>
                            <Plus size={15} />
                            {t('doctors.logVisit', { defaultValue: 'تسجيل زيارة' })}
                        </Button>
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
                            onClick={() => { refetch(); refetchInteractions(); }}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={15} className={(isFetching || isFetchingInteractions) ? 'animate-spin' : ''} />
                            {t('actions.refresh', { ns: 'common', defaultValue: 'Refresh' })}
                        </button>
                    </>
                )}
                metrics={[
                    { key: 'appointments', icon: Users, tone: 'cyan', label: t('doctors.totalReferrals', { defaultValue: 'Total appointments' }), value: appointmentCount.toLocaleString(locale), detail: t('doctors.totalReferralsDetail', { defaultValue: 'Appointments attributed to this partner' }), loading: isLoading, error: isError },
                    { key: 'exams', icon: FileText, tone: 'blue', label: t('doctors.examCount', { defaultValue: 'Completed exams' }), value: examCount.toLocaleString(locale), detail: t('doctors.examCountDetail', { rate: conversionRate, defaultValue: '{{rate}}% appointment-to-exam completion' }), loading: isLoading, error: isError },
                    { key: 'revenue', icon: DollarSign, tone: 'emerald', label: t('doctors.revenue', { defaultValue: 'Generated revenue' }), value: formatCurrency(stats.total_revenue, locale), detail: t('doctors.revenueDetail', { defaultValue: 'Recorded referral revenue' }), loading: isLoading, error: isError },
                    { key: 'commission', icon: Percent, tone: 'amber', label: t('doctors.commission', { defaultValue: 'Estimated commission' }), value: formatCurrency(stats.commission_est, locale), detail: t('doctors.commissionDetail', { percent: Number(doctor.commission_percentage || 0), defaultValue: '{{percent}}% configured commission' }), loading: isLoading, error: isError },
                ]}
                metricsLabel={t('doctors.performanceSummary', { defaultValue: 'Doctor referral performance summary' })}
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
                    <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('referrals')}
                                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                                    activeTab === 'referrals'
                                        ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-teal-300 dark:ring-slate-700'
                                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                            >
                                <ClipboardList size={16} />
                                <span>{t('doctors.recentReferrals', { defaultValue: 'إحالات المرضى' })}</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    {recentReferrals.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('interactions')}
                                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                                    activeTab === 'interactions'
                                        ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-teal-300 dark:ring-slate-700'
                                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                            >
                                <MapPin size={16} />
                                <span>{t('doctors.fieldVisits', { defaultValue: 'الزيارات الميدانية والتواصل' })}</span>
                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                                    {interactions.length}
                                </span>
                            </button>
                        </div>
                        <Button size="sm" onClick={() => setIsInteractionModalOpen(true)}>
                            <Plus size={14} />
                            {t('doctors.logVisit', { defaultValue: 'تسجيل زيارة ميدانية' })}
                        </Button>
                    </header>

                    {activeTab === 'referrals' ? (
                        recentReferrals.length === 0 ? (
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
                        )
                    ) : (
                        isLoadingInteractions ? (
                            <div className="space-y-4 p-5">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                            </div>
                        ) : interactions.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <EmptyState
                                    icon={MapPin}
                                    title={t('doctors.noInteractions', { defaultValue: 'لا توجد زيارات أو اتصالات مسجلة' })}
                                    description={t('doctors.noInteractionsDesc', { defaultValue: 'سجل أول زيارة ميدانية لمسؤول العلاقات الطبية (Physician Liaison) لمتابعة الطبيب والمواد المسلّمة.' })}
                                />
                                <Button className="mt-4" onClick={() => setIsInteractionModalOpen(true)}>
                                    <Plus size={15} />
                                    {t('doctors.logFirstVisit', { defaultValue: 'تسجيل أول زيارة ميدانية' })}
                                </Button>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 p-5 dark:divide-slate-800 space-y-4">
                                {interactions.map((item) => {
                                    const typeConfig = {
                                        Visit: { icon: MapPin, color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50', label: t('doctors.types.visit', { defaultValue: 'زيارة عيادة' }) },
                                        Call: { icon: Phone, color: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50', label: t('doctors.types.call', { defaultValue: 'اتصال هاتفي' }) },
                                        Meeting: { icon: Users, color: 'text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/50', label: t('doctors.types.meeting', { defaultValue: 'اجتماع رسمي' }) },
                                        WhatsApp: { icon: MessageCircle, color: 'text-teal-700 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50', label: t('doctors.types.whatsapp', { defaultValue: 'مراسلة واتساب' }) },
                                        Note: { icon: FileText, color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50', label: t('doctors.types.note', { defaultValue: 'ملاحظة' }) }
                                    }[item.interaction_type] || { icon: MapPin, color: 'text-slate-700 bg-slate-50 border-slate-200', label: item.interaction_type };

                                    const IconComponent = typeConfig.icon;

                                    const purposeConfig = {
                                        'Routine Liaison': { bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', label: t('doctors.purposes.routine', { defaultValue: 'زيارة دورية وتعريفية' }) },
                                        'Marketing Materials': { bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', label: t('doctors.purposes.materials', { defaultValue: 'تسليم مطبوعات ومواد' }) },
                                        'Feedback/Issue': { bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', label: t('doctors.purposes.feedback', { defaultValue: 'متابعة شكوى / ملاحظة' }) },
                                        'Contract Discussion': { bg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300', label: t('doctors.purposes.contract', { defaultValue: 'اتفاقية / عمولات' }) },
                                        'Modality Intro': { bg: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300', label: t('doctors.purposes.modality', { defaultValue: 'تقديم خدمات جديدة' }) }
                                    }[item.purpose] || { bg: 'bg-slate-100 text-slate-700', label: item.purpose };

                                    return (
                                        <div key={item.interaction_id} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${typeConfig.color}`}>
                                                        <IconComponent size={14} />
                                                        <span>{typeConfig.label}</span>
                                                    </span>
                                                    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${purposeConfig.bg}`}>
                                                        {purposeConfig.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={13} />
                                                        {formatDate(item.interaction_date, locale, true)}
                                                    </span>
                                                    {item.user_name && (
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                            {item.user_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {item.notes && (
                                                <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                                                    {item.notes}
                                                </p>
                                            )}

                                            <div className="mt-3 flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                                {item.materials_delivered && (
                                                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                        <Package size={13} className="text-teal-600 dark:text-teal-400" />
                                                        <span className="font-bold">{t('doctors.materialsDelivered', { defaultValue: 'المواد المسلّمة:' })}</span>
                                                        <span>{item.materials_delivered}</span>
                                                    </div>
                                                )}
                                                {item.next_follow_up_date && (
                                                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                                                        <Calendar size={13} />
                                                        <span>{t('doctors.nextFollowUp', { defaultValue: 'موعد المتابعة القادمة:' })}</span>
                                                        <span>{formatDate(item.next_follow_up_date, locale)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
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
                            <button
                                type="button"
                                onClick={() => setIsInteractionModalOpen(true)}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-700 shadow-sm transition hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/60"
                            >
                                <MapPin size={15} />
                                {t('doctors.logVisit', { defaultValue: 'تسجيل زيارة ميدانية' })}
                            </button>
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

            <Modal
                isOpen={isInteractionModalOpen}
                onClose={() => setIsInteractionModalOpen(false)}
                title={t('doctors.logVisitModalTitle', { defaultValue: 'تسجيل زيارة ميدانية أو تواصل مع الطبيب' })}
                size="default"
            >
                <form onSubmit={handleSaveInteraction} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('doctors.interactionType', { defaultValue: 'نوع التواصل' })}
                            </label>
                            <select
                                value={interactionForm.interactionType}
                                onChange={(e) => setInteractionForm({ ...interactionForm, interactionType: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                            >
                                <option value="Visit">{t('doctors.types.visit', { defaultValue: 'زيارة عيادة (Field Visit)' })}</option>
                                <option value="Call">{t('doctors.types.call', { defaultValue: 'مكالمة هاتفية (Phone Call)' })}</option>
                                <option value="Meeting">{t('doctors.types.meeting', { defaultValue: 'اجتماع رسمي (Meeting)' })}</option>
                                <option value="WhatsApp">{t('doctors.types.whatsapp', { defaultValue: 'مراسلة واتساب (WhatsApp)' })}</option>
                                <option value="Note">{t('doctors.types.note', { defaultValue: 'ملاحظة داخلية (Internal Note)' })}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('doctors.purpose', { defaultValue: 'الغرض من التواصل' })}
                            </label>
                            <select
                                value={interactionForm.purpose}
                                onChange={(e) => setInteractionForm({ ...interactionForm, purpose: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                            >
                                <option value="Routine Liaison">{t('doctors.purposes.routine', { defaultValue: 'زيارة دورية وتعريفية (Routine Liaison)' })}</option>
                                <option value="Marketing Materials">{t('doctors.purposes.materials', { defaultValue: 'تسليم مطبوعات وبروشورات (Marketing Materials)' })}</option>
                                <option value="Feedback/Issue">{t('doctors.purposes.feedback', { defaultValue: 'متابعة ملاحظة أو شكوى (Feedback/Issue)' })}</option>
                                <option value="Contract Discussion">{t('doctors.purposes.contract', { defaultValue: 'مراجعة تعاقد أو عمولات (Contract Discussion)' })}</option>
                                <option value="Modality Intro">{t('doctors.purposes.modality', { defaultValue: 'تقديم فحوصات وأجهزة جديدة (Modality Intro)' })}</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('doctors.interactionDate', { defaultValue: 'تاريخ ووقت التواصل' })}
                            </label>
                            <input
                                type="datetime-local"
                                value={interactionForm.interactionDate}
                                onChange={(e) => setInteractionForm({ ...interactionForm, interactionDate: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                {t('doctors.nextFollowUp', { defaultValue: 'تاريخ المتابعة القادمة' })}
                            </label>
                            <input
                                type="date"
                                value={interactionForm.nextFollowUpDate}
                                onChange={(e) => setInteractionForm({ ...interactionForm, nextFollowUpDate: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            {t('doctors.materialsDelivered', { defaultValue: 'المواد والمطبوعات المسلّمة' })}
                        </label>
                        <input
                            type="text"
                            value={interactionForm.materialsDelivered}
                            onChange={(e) => setInteractionForm({ ...interactionForm, materialsDelivered: e.target.value })}
                            placeholder={t('doctors.materialsPlaceholder', { defaultValue: 'مثال: كتالوج الخدمات، نماذج طلب فحص، بروشورات MRI...' })}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {['كتالوج الفحوصات', 'بروشورات المرضى', 'كوبونات خصم', 'نماذج تحويل رسمية'].map((tag) => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => {
                                        const current = interactionForm.materialsDelivered ? interactionForm.materialsDelivered.split('، ') : [];
                                        if (!current.includes(tag)) {
                                            setInteractionForm({
                                                ...interactionForm,
                                                materialsDelivered: current.length ? `${interactionForm.materialsDelivered}، ${tag}` : tag
                                            });
                                        }
                                    }}
                                    className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    + {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            {t('doctors.notesAndFeedback', { defaultValue: 'الملاحظات ومخرجات الزيارة' })}
                        </label>
                        <textarea
                            rows={3}
                            value={interactionForm.notes}
                            onChange={(e) => setInteractionForm({ ...interactionForm, notes: e.target.value })}
                            placeholder={t('doctors.notesPlaceholder', { defaultValue: 'سجل تفاصيل المحادثة، رأي الطبيب، اقتراحاته، أو أي صعوبات واجهها...' })}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <Button type="button" variant="ghost" onClick={() => setIsInteractionModalOpen(false)}>
                            {t('actions.cancel', { ns: 'common', defaultValue: 'إلغاء' })}
                        </Button>
                        <Button type="submit" loading={isSubmittingInteraction}>
                            {t('doctors.saveInteraction', { defaultValue: 'حفظ الزيارة' })}
                        </Button>
                    </div>
                </form>
            </Modal>
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
