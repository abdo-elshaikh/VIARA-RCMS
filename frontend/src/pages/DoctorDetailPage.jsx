import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Briefcase,
    Building2,
    Calendar,
    CalendarCheck2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleDollarSign,
    ClipboardList,
    Clock,
    Copy,
    DollarSign,
    Edit3,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Filter,
    KeyRound,
    Layers,
    Mail,
    MapPin,
    MessageCircle,
    Package,
    Percent,
    Phone,
    PieChart,
    Plus,
    RefreshCw,
    Search,
    Send,
    Share2,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Target,
    TrendingUp,
    UserCheck,
    UserRound,
    Users,
    WalletCards,
    X,
    XCircle, BadgePercent,
    Zap
} from 'lucide-react';
import {
    useGetReferringDoctorStatsQuery,
    useGetDoctorInteractionsQuery,
    useCreateDoctorInteractionMutation,
    useUpdateReferringDoctorMutation,
    useSetDoctorPortalPasswordMutation
} from '../store/api';
import { Button, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import { inputClass, secondaryBtn } from '../utils/designTokens';
import { getDoctorPortalLoginUrl } from '../utils/portalUrls';
import CredentialHandoffDialog from '../components/CredentialHandoffDialog';
import { getErrorMessage } from '../utils/getErrorMessage';

const formatDate = (value, locale, withTime = false) => {
    if (!value) return '—';
    try {
        return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value));
    } catch {
        return '—';
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

const fallback = '—';

const getAvatarGradient = (seed = 0) => {
    const gradients = [
        'from-teal-600 via-teal-700 to-cyan-800 shadow-teal-500/20 text-white',
        'from-cyan-600 via-blue-700 to-indigo-800 shadow-cyan-500/20 text-white',
        'from-emerald-600 via-teal-700 to-slate-900 shadow-emerald-500/20 text-white',
        'from-blue-600 via-indigo-700 to-violet-900 shadow-blue-500/20 text-white',
        'from-slate-700 via-slate-800 to-teal-950 shadow-slate-500/20 text-white'
    ];
    const num = typeof seed === 'number' ? seed : String(seed).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return gradients[Math.abs(num) % gradients.length];
};

const getWhatsAppUrl = (phone, doctorName = '') => {
    if (!phone) return null;
    const cleanNumber = phone.replace(/[^+\d]/g, '').replace(/^\+/, '');
    const greeting = encodeURIComponent(`مرحباً د. ${doctorName || ''}، تحياتنا من المركز الطبي.`);
    return `https://wa.me/${cleanNumber}?text=${greeting}`;
};

export default function DoctorDetailPage() {
    const { doctorId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['admin', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const currentUser = useSelector(selectCurrentUser);
    const isAdmin = hasDeveloperOrAdminRole(currentUser?.role);

    const [activeTab, setActiveTab] = useState('referrals'); // 'referrals' | 'interactions' | 'analytics'
    const [referralSearch, setReferralSearch] = useState('');
    const [referralStatusFilter, setReferralStatusFilter] = useState('all');
    const [interactionTypeFilter, setInteractionTypeFilter] = useState('all');

    const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [credentialDialog, setCredentialDialog] = useState(null);

    const [interactionForm, setInteractionForm] = useState({
        interactionType: 'Visit',
        purpose: 'Routine Liaison',
        interactionDate: new Date().toISOString().slice(0, 16),
        materialsDelivered: '',
        notes: '',
        nextFollowUpDate: ''
    });

    const [editForm, setEditForm] = useState({
        fullName: '',
        specialty: '',
        clinicHospital: '',
        phone: '',
        email: '',
        address: '',
        taxId: '',
        contractId: '',
        commissionPercentage: 0,
        referralSourceCategory: 'Doctor',
        notes: '',
        isActive: true
    });

    const { data, isLoading, isFetching, isError, refetch } = useGetReferringDoctorStatsQuery(doctorId);
    const { data: interactions = [], isLoading: isLoadingInteractions, isFetching: isFetchingInteractions, refetch: refetchInteractions } = useGetDoctorInteractionsQuery(doctorId);
    const [createDoctorInteraction, { isLoading: isSubmittingInteraction }] = useCreateDoctorInteractionMutation();
    const [updateDoctor, { isLoading: isUpdatingDoctor }] = useUpdateReferringDoctorMutation();
    const [setDoctorPortalPassword, { isLoading: isGeneratingCredentials }] = useSetDoctorPortalPasswordMutation();

    const doctor = data?.doctor;
    const stats = data?.stats || {};
    const recentReferrals = useMemo(() => data?.recentReferrals || [], [data?.recentReferrals]);

    // Filtered referrals
    const filteredReferrals = useMemo(() => {
        return recentReferrals.filter(ref => {
            const matchesStatus = referralStatusFilter === 'all' || (ref.status && ref.status.toLowerCase() === referralStatusFilter.toLowerCase());
            const term = referralSearch.trim().toLowerCase();
            if (!term) return matchesStatus;
            const matchesSearch =
                (ref.patient_name && ref.patient_name.toLowerCase().includes(term)) ||
                (ref.mrn && ref.mrn.toLowerCase().includes(term)) ||
                (ref.exam_type_name && ref.exam_type_name.toLowerCase().includes(term)) ||
                (ref.machine_name && ref.machine_name.toLowerCase().includes(term));
            return matchesStatus && matchesSearch;
        });
    }, [recentReferrals, referralSearch, referralStatusFilter]);

    // Filtered interactions
    const filteredInteractions = useMemo(() => {
        if (interactionTypeFilter === 'all') return interactions;
        return interactions.filter(item => item.interaction_type === interactionTypeFilter);
    }, [interactions, interactionTypeFilter]);

    // Modality breakdown for analytics
    const modalityBreakdown = useMemo(() => {
        const counts = {};
        recentReferrals.forEach(ref => {
            const mod = ref.modality || ref.machine_name?.split(' ')?.[0] || 'General';
            counts[mod] = (counts[mod] || 0) + 1;
        });
        const total = recentReferrals.length || 1;
        return Object.entries(counts).map(([name, count]) => ({
            name,
            count,
            percentage: Math.round((count / total) * 100)
        })).sort((a, b) => b.count - a.count);
    }, [recentReferrals]);

    const handleOpenEdit = () => {
        if (!doctor) return;
        setEditForm({
            fullName: doctor.full_name || '',
            specialty: doctor.specialty || '',
            clinicHospital: doctor.clinic_hospital || '',
            phone: doctor.phone || '',
            email: doctor.email || '',
            address: doctor.address || '',
            taxId: doctor.tax_id || '',
            contractId: doctor.contract_id || '',
            commissionPercentage: doctor.commission_percentage || 0,
            referralSourceCategory: doctor.referral_source_category || 'Doctor',
            notes: doctor.notes || '',
            isActive: Boolean(doctor.is_active)
        });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editForm.fullName.trim()) {
            toast.error(t('referringDoctors.messages.nameRequired', { defaultValue: 'اسم الطبيب مطلوب' }));
            return;
        }
        try {
            await updateDoctor({
                id: doctor.doctor_id,
                fullName: editForm.fullName.trim(),
                specialty: editForm.specialty.trim() || undefined,
                clinicHospital: editForm.clinicHospital.trim() || undefined,
                phone: editForm.phone.trim() || undefined,
                email: editForm.email.trim() || undefined,
                address: editForm.address.trim() || undefined,
                taxId: editForm.taxId.trim() || undefined,
                contractId: editForm.contractId.trim() || undefined,
                commissionPercentage: Number(editForm.commissionPercentage || 0),
                referralSourceCategory: editForm.referralSourceCategory.trim() || undefined,
                notes: editForm.notes.trim() || undefined,
                isActive: Boolean(editForm.isActive)
            }).unwrap();

            toast.success(t('referringDoctors.messages.updated', { defaultValue: 'تم تحديث بيانات الطبيب بنجاح' }));
            setIsEditModalOpen(false);
            refetch();
        } catch (err) {
            toast.error(getErrorMessage(err, t('referringDoctors.messages.saveFailed', { defaultValue: 'فشل حفظ التعديلات' })));
        }
    };

    const handleGenerateCredentials = async () => {
        if (!doctor?.doctor_id) return;
        if (!doctor.email) {
            toast.error(t('referringDoctors.portal.emailRequired', { defaultValue: 'يرجى إضافة بريد إلكتروني أولاً قبل إنشاء بيانات البوابة.' }));
            return;
        }
        try {
            const result = await setDoctorPortalPassword({ id: doctor.doctor_id }).unwrap();
            setCredentialDialog({
                title: t('referringDoctors.portal.credentialsTitle', { defaultValue: 'Doctor portal credentials' }),
                portalLabel: t('referringDoctors.portal.portalLabel', { defaultValue: 'Referring doctor portal' }),
                subjectLabel: t('referringDoctors.table.doctor', { defaultValue: 'طبيب محول' }),
                subjectName: result.doctorName || doctor.full_name,
                email: result.email || doctor.email,
                password: result.portalPassword,
                loginUrl: getDoctorPortalLoginUrl(),
                deliveryHint: t('referringDoctors.portal.credentialsHint', {
                    defaultValue: 'Give these credentials directly to the referring doctor or authorized clinic contact. Ask them to keep the password private.'
                })
            });
        } catch (error) {
            toast.error(getErrorMessage(error, t('referringDoctors.portal.generateFailed', { defaultValue: 'تعذر إنشاء بيانات دخول البوابة.' })));
        }
    };

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

            toast.success(t('doctors.interactionSuccess', { defaultValue: 'تم تسجيل الزيارة الميدانية والتواصل بنجاح' }));
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
                <Skeleton className="h-32 w-full rounded-3xl" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(item => <Skeleton key={item} className="h-24 rounded-2xl" />)}
                </div>
                <Skeleton className="h-96 w-full rounded-3xl" />
            </div>
        );
    }

    if (isError || !doctor) {
        return (
            <div className="p-4 sm:p-6 lg:p-8">
                <section className="rounded-3xl border border-slate-200/80 bg-white/80 p-10 text-center shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-900">
                    <EmptyState
                        icon={Stethoscope}
                        title={t('doctors.notFound', 'Doctor not found')}
                        description={t('doctors.notFoundDesc', 'The requested referring doctor record could not be found.')}
                    />
                    <Button className="mt-5" onClick={() => navigate('/referring-doctors')}>
                        {isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                        {t('actions.back', { ns: 'common', defaultValue: 'Back to Doctors' })}
                    </Button>
                </section>
            </div>
        );
    }

    const appointmentCount = Number(stats.appointment_count || 0);
    const examCount = Number(stats.exam_count || 0);
    const conversionRate = appointmentCount > 0 ? Math.round((examCount / appointmentCount) * 100) : 0;
    const pendingConversionCount = Math.max(appointmentCount - examCount, 0);
    const averageRevenue = examCount > 0 ? Number(stats.total_revenue || 0) / examCount : 0;
    const lastReferralAt = stats.last_referral_at || recentReferrals[0]?.start_time;

    return (
        <div className="doctor-detail-page space-y-5 pb-16">
            {/* Executive Partner Page Header */}
            <PageHeader
                compact
                icon={Stethoscope}
                eyebrow={t('doctors.profileEyebrow', { defaultValue: 'شريك إحالات معتمد · الملف الطبي والتعاقدي' })}
                eyebrowIcon={Activity}
                title={doctor.full_name}
                description={t('doctors.profileDescription', {
                    specialty: doctor.specialty || t('referringDoctors.values.general', { defaultValue: 'طب عام' }),
                    clinic: doctor.clinic_hospital || t('referringDoctors.values.independent', { defaultValue: 'عيادة خاصة' }),
                    defaultValue: '{{specialty}} · {{clinic}}'
                })}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${doctor.is_active
                                ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                                : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                            <span className={`h-2 w-2 rounded-full ${doctor.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400'}`} />
                            {doctor.is_active ? t('referringDoctors.status.active', { defaultValue: 'شريك نشط' }) : t('referringDoctors.status.inactive', { defaultValue: 'غير نشط' })}
                        </span>
                        <MetaPill icon={Building2}>{doctor.clinic_hospital || t('referringDoctors.values.independent', { defaultValue: 'عيادة مستقلة' })}</MetaPill>
                        <MetaPill icon={Briefcase}>{doctor.specialty || t('referringDoctors.values.general', { defaultValue: 'طب عام' })}</MetaPill>
                        {doctor.contract_id && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                                <ShieldCheck size={13} />
                                <span>{t('referringDoctors.form.contractId', { defaultValue: 'العقد:' })} {doctor.contract_id}</span>
                            </span>
                        )}
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsInteractionModalOpen(true)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-4 text-xs font-black text-white shadow-sm shadow-teal-700/25 transition hover:from-teal-800 hover:to-cyan-800 active:scale-95"
                        >
                            <Plus size={14} />
                            {t('doctors.logVisit', { defaultValue: 'تسجيل زيارة' })}
                        </button>
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={handleGenerateCredentials}
                                disabled={isGeneratingCredentials}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-200/80 bg-cyan-50 px-3 text-xs font-bold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                            >
                                <KeyRound size={13} />
                                {t('referringDoctors.portal.portalLabel', { defaultValue: 'بوابة الطبيب' })}
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={handleOpenEdit}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <Edit3 size={13} />
                                {t('referringDoctors.actions.edit', { defaultValue: 'تعديل' })}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => navigate('/communications')}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <Mail size={13} />
                            {t('doctors.sendMessage', { defaultValue: 'المحادثات' })}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {isRtl ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                            {t('actions.back', { ns: 'common', defaultValue: 'رجوع' })}
                        </button>
                        <button
                            type="button"
                            onClick={() => { refetch(); refetchInteractions(); }}
                            title={t('actions.refresh', { ns: 'common', defaultValue: 'تحديث' })}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={(isFetching || isFetchingInteractions) ? 'animate-spin' : ''} />
                        </button>
                    </div>
                }
                metrics={[
                    { key: 'appointments', icon: Users, tone: 'cyan', label: t('doctors.totalReferrals', { defaultValue: 'إجمالي المواعيد' }), value: appointmentCount.toLocaleString(locale), detail: t('doctors.totalReferralsDetail', { defaultValue: 'إجمالي الحالات المحولة للمركز' }), loading: isLoading, error: isError },
                    { key: 'exams', icon: FileText, tone: 'blue', label: t('doctors.examCount', { defaultValue: 'الفحوصات المنفذة' }), value: examCount.toLocaleString(locale), detail: t('doctors.examCountDetail', { rate: conversionRate, defaultValue: `معدل إنجاز ${conversionRate}%` }), loading: isLoading, error: isError },
                    { key: 'revenue', icon: CircleDollarSign, tone: 'emerald', label: t('doctors.revenue', { defaultValue: 'الإيرادات المحققة' }), value: formatCurrency(stats.total_revenue, locale), detail: t('doctors.revenueDetail', { defaultValue: 'إجمالي عوائد الفحوصات' }), loading: isLoading, error: isError },
                    { key: 'commission', icon: BadgePercent, tone: 'amber', label: t('doctors.commission', { defaultValue: 'العمولات التقديرية' }), value: formatCurrency(stats.commission_est, locale), detail: t('doctors.commissionDetail', { percent: Number(doctor.commission_percentage || 0), defaultValue: `نسبة تعاقدية ${Number(doctor.commission_percentage || 0)}%` }), loading: isLoading, error: isError },
                ]}
                metricsLabel={t('doctors.performanceSummary', { defaultValue: 'Doctor referral performance summary' })}
            />

            {/* Executive Intelligence Signal Bar (No duplicate metric cards) */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80">
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                            <Target size={13} />
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{t('doctors.completionRate', { defaultValue: 'معدل الإنجاز:' })}</span>
                        <span className="font-mono font-black text-teal-600 dark:text-teal-400">{conversionRate}%</span>
                        <span className="text-[11px] text-slate-400">({examCount}/{appointmentCount} {t('doctors.exams', { defaultValue: 'فحص' })})</span>
                    </div>

                    <span className="hidden h-4 w-px bg-slate-200 dark:bg-white/10 sm:block" />

                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            <TrendingUp size={13} />
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{t('doctors.avgRevenue', { defaultValue: 'متوسط الفحص:' })}</span>
                        <span className="font-mono font-black text-slate-900 dark:text-white" dir="ltr">{formatCurrency(averageRevenue, locale)}</span>
                    </div>

                    <span className="hidden h-4 w-px bg-slate-200 dark:bg-white/10 sm:block" />

                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            <Clock size={13} />
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{t('doctors.lastReferral', { defaultValue: 'آخر إحالة:' })}</span>
                        <span className="font-mono text-slate-800 dark:text-slate-200">{formatDate(lastReferralAt, locale, true)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-white/5 dark:text-slate-300">
                        <Layers size={12} className="text-cyan-600" />
                        <span>{modalityBreakdown.length} {t('doctors.modalitiesUsed', { defaultValue: 'أجهزة مستخدمة' })}</span>
                    </span>
                </div>
            </div>

            {/* Main Command Center: Tabbed Content + Sidebar Console */}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
                {/* Left/Main Column: Tabs (Referrals / Visits / Analytics) */}
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-md shadow-slate-200/20 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    {/* Modern Tabs Bar */}
                    <header className="flex flex-col gap-3 border-b border-slate-100/80 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('referrals')}
                                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${activeTab === 'referrals'
                                        ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-teal-300 dark:ring-white/10'
                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                            >
                                <ClipboardList size={15} />
                                <span>{t('doctors.recentReferrals', { defaultValue: 'إحالات المرضى' })}</span>
                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                                    {recentReferrals.length}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('interactions')}
                                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${activeTab === 'interactions'
                                        ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-teal-300 dark:ring-white/10'
                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                            >
                                <MapPin size={15} />
                                <span>{t('doctors.fieldVisits', { defaultValue: 'سجل الزيارات والتواصل' })}</span>
                                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-black text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                                    {interactions.length}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('analytics')}
                                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition ${activeTab === 'analytics'
                                        ? 'bg-white text-teal-800 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-teal-300 dark:ring-white/10'
                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                            >
                                <PieChart size={15} />
                                <span>{t('doctors.analyticsTab', { defaultValue: 'التحليل المالي والموداليتي' })}</span>
                            </button>
                        </div>

                        {activeTab === 'interactions' && (
                            <button
                                type="button"
                                onClick={() => setIsInteractionModalOpen(true)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-3 text-xs font-black text-white shadow-sm transition hover:from-teal-800 hover:to-cyan-800"
                            >
                                <Plus size={13} />
                                <span>{t('doctors.logVisitShort', { defaultValue: 'زيارة جديدة' })}</span>
                            </button>
                        )}
                    </header>

                    {/* Tab 1: Patient Referrals */}
                    {activeTab === 'referrals' && (
                        <div className="p-4 sm:p-5 space-y-4">
                            {/* In-table Search and Filters */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                                    <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input
                                        type="text"
                                        value={referralSearch}
                                        onChange={(e) => setReferralSearch(e.target.value)}
                                        placeholder={t('doctors.searchReferrals', { defaultValue: 'بحث بالمريض، الرقم الطبي، الفحص...' })}
                                        className="h-8 w-full rounded-xl border border-slate-200/80 bg-white/90 ps-8 pe-7 text-xs font-medium text-slate-800 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                                    />
                                    {referralSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setReferralSearch('')}
                                            className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <Filter size={13} className="text-slate-400" />
                                    <select
                                        value={referralStatusFilter}
                                        onChange={(e) => setReferralStatusFilter(e.target.value)}
                                        className="h-8 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300"
                                    >
                                        <option value="all">{t('doctors.filters.allStatuses', { defaultValue: 'جميع الحالات' })}</option>
                                        <option value="completed">{t('doctors.statuses.completed', { defaultValue: 'مكتمل' })}</option>
                                        <option value="scheduled">{t('doctors.statuses.scheduled', { defaultValue: 'مجدول' })}</option>
                                        <option value="in_progress">{t('doctors.statuses.in_progress', { defaultValue: 'قيد الإجراء' })}</option>
                                        <option value="cancelled">{t('doctors.statuses.cancelled', { defaultValue: 'ملغي' })}</option>
                                    </select>
                                    <span className="text-xs font-bold text-slate-400">
                                        ({filteredReferrals.length} {t('doctors.records', { defaultValue: 'سجل' })})
                                    </span>
                                </div>
                            </div>

                            {/* Referrals Table */}
                            {filteredReferrals.length === 0 ? (
                                <div className="py-12 text-center">
                                    <EmptyState
                                        icon={CalendarDays}
                                        title={referralSearch || referralStatusFilter !== 'all' ? t('doctors.noFilteredReferrals', { defaultValue: 'لا توجد إحالات تطابق معايير البحث' }) : t('doctors.noReferrals', { defaultValue: 'No recent referrals recorded' })}
                                        description={referralSearch || referralStatusFilter !== 'all' ? t('doctors.tryClearingFilters', { defaultValue: 'جرب مسح شريط البحث أو تغيير فلتر الحالة.' }) : t('doctors.noReferralsDesc', { defaultValue: 'New referred appointments will appear here once they are scheduled.' })}
                                    />
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/5">
                                    <table className="w-full border-collapse text-start text-xs">
                                        <thead className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5 dark:bg-slate-900/80">
                                            <tr>
                                                <th className="px-4 py-3 text-start">{t('doctors.table.date', { defaultValue: 'تاريخ الموعد' })}</th>
                                                <th className="px-4 py-3 text-start">{t('doctors.table.patient', { defaultValue: 'المريض' })}</th>
                                                <th className="px-4 py-3 text-start">{t('doctors.table.exam', { defaultValue: 'نوع الفحص' })}</th>
                                                <th className="px-3 py-3 text-start">{t('doctors.table.modality', { defaultValue: 'الجهاز / الموداليتي' })}</th>
                                                <th className="px-4 py-3 text-end">{t('doctors.table.status', { defaultValue: 'حالة الفحص' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                            {filteredReferrals.map((ref, index) => {
                                                const status = (ref.status || 'scheduled').toLowerCase();
                                                const statusConfig = {
                                                    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
                                                    finished: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
                                                    in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
                                                    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
                                                    cancelled: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                                                }[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

                                                return (
                                                    <tr key={ref.appointment_id || index} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                                                        <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-slate-500 dark:text-slate-400">
                                                            {formatDate(ref.start_time, locale, true)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="font-bold text-slate-900 dark:text-white">
                                                                {ref.patient_name || fallback}
                                                            </p>
                                                            {ref.mrn && (
                                                                <p className="font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                                                                    MRN: {ref.mrn}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="font-bold text-slate-800 dark:text-slate-200">
                                                                {ref.exam_type_name || t('doctors.generalExam', { defaultValue: 'فحص إشعاعي عام' })}
                                                            </p>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:border-white/5 dark:bg-white/5 dark:text-slate-300">
                                                                {ref.machine_name || ref.modality || fallback}
                                                            </span>
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-3 text-end">
                                                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusConfig}`}>
                                                                {t(`doctors.statuses.${status}`, { defaultValue: ref.status || 'مجدول' })}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 2: Field Visits & Physician Liaison Timeline */}
                    {activeTab === 'interactions' && (
                        <div className="p-4 sm:p-5 space-y-4">
                            {/* Filter Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/80 pb-3 dark:border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400">{t('doctors.filterByType', { defaultValue: 'نوع النشاط:' })}</span>
                                    <select
                                        value={interactionTypeFilter}
                                        onChange={(e) => setInteractionTypeFilter(e.target.value)}
                                        className="h-8 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300"
                                    >
                                        <option value="all">{t('doctors.types.all', { defaultValue: 'جميع الأنشطة' })}</option>
                                        <option value="Visit">{t('doctors.types.visit', { defaultValue: 'زيارة عيادة' })}</option>
                                        <option value="Call">{t('doctors.types.call', { defaultValue: 'اتصال هاتفي' })}</option>
                                        <option value="Meeting">{t('doctors.types.meeting', { defaultValue: 'اجتماع رسمي' })}</option>
                                        <option value="WhatsApp">{t('doctors.types.whatsapp', { defaultValue: 'مراسلة واتساب' })}</option>
                                        <option value="Note">{t('doctors.types.note', { defaultValue: 'ملاحظة' })}</option>
                                    </select>
                                </div>
                                <span className="text-xs font-semibold text-slate-400">
                                    {filteredInteractions.length} {t('doctors.activitiesRecorded', { defaultValue: 'نشاط مسجل' })}
                                </span>
                            </div>

                            {isLoadingInteractions ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                                </div>
                            ) : filteredInteractions.length === 0 ? (
                                <div className="py-12 text-center">
                                    <EmptyState
                                        icon={MapPin}
                                        title={t('doctors.noInteractions', { defaultValue: 'لا توجد زيارات أو اتصالات مسجلة' })}
                                        description={t('doctors.noInteractionsDesc', { defaultValue: 'سجل أول زيارة ميدانية لمسؤول العلاقات الطبية (Physician Liaison) لمتابعة الطبيب والمواد المسلّمة.' })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsInteractionModalOpen(true)}
                                        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800"
                                    >
                                        <Plus size={14} />
                                        {t('doctors.logFirstVisit', { defaultValue: 'تسجيل أول زيارة ميدانية' })}
                                    </button>
                                </div>
                            ) : (
                                <div className="relative ps-4 before:absolute before:bottom-2 before:start-2 before:top-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800 space-y-4">
                                    {filteredInteractions.map((item) => {
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
                                            <div key={item.interaction_id} className="relative rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900/70">
                                                <span className="absolute -start-6 top-4 h-3 w-3 rounded-full border-2 border-white bg-teal-500 shadow-sm dark:border-slate-900" />
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold ${typeConfig.color}`}>
                                                            <IconComponent size={13} />
                                                            <span>{typeConfig.label}</span>
                                                        </span>
                                                        <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${purposeConfig.bg}`}>
                                                            {purposeConfig.label}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                        <Clock size={12} />
                                                        <span className="font-mono">{formatDate(item.interaction_date, locale, true)}</span>
                                                        {item.user_name && (
                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                                {item.user_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {item.notes && (
                                                    <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200 bg-slate-50/60 p-3 rounded-xl border border-slate-100 dark:border-white/5 dark:bg-white/[0.02]">
                                                        {item.notes}
                                                    </p>
                                                )}

                                                <div className="mt-3 flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
                                                    {item.materials_delivered && (
                                                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                            <Package size={13} className="text-teal-600 dark:text-teal-400" />
                                                            <span className="font-bold">{t('doctors.materialsDelivered', { defaultValue: 'المواد المسلّمة:' })}</span>
                                                            <span className="font-semibold text-slate-800 dark:text-slate-200">{item.materials_delivered}</span>
                                                        </div>
                                                    )}
                                                    {item.next_follow_up_date && (
                                                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                                                            <Calendar size={12} />
                                                            <span>{t('doctors.nextFollowUp', { defaultValue: 'موعد المتابعة:' })}</span>
                                                            <span className="font-mono">{formatDate(item.next_follow_up_date, locale)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 3: Financial & Modality Analytics */}
                    {activeTab === 'analytics' && (
                        <div className="p-4 sm:p-5 space-y-6">
                            {/* Modality Distribution */}
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-3">
                                    <PieChart size={15} className="text-teal-600" />
                                    {t('doctors.modalityBreakdown', { defaultValue: 'توزيع الإحالات حسب الموداليتي والأجهزة' })}
                                </h3>
                                <div className="space-y-2.5">
                                    {modalityBreakdown.length === 0 ? (
                                        <p className="text-xs text-slate-400">{t('doctors.noAnalyticsData', { defaultValue: 'لا توجد بيانات فحوصات كافية للتحليل.' })}</p>
                                    ) : (
                                        modalityBreakdown.map(mod => (
                                            <div key={mod.name} className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/[0.02]">
                                                <div className="flex items-center justify-between text-xs font-bold">
                                                    <span className="text-slate-800 dark:text-slate-200">{mod.name}</span>
                                                    <span className="font-mono text-teal-700 dark:text-teal-300">{mod.count} {t('doctors.exams', { defaultValue: 'فحص' })} ({mod.percentage}%)</span>
                                                </div>
                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${mod.percentage}%` }} />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Financial Terms & Breakdown */}
                            <div className="border-t border-slate-100/80 pt-4 dark:border-white/5">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-3">
                                    <CircleDollarSign size={15} className="text-emerald-600" />
                                    {t('doctors.financialSummary', { defaultValue: 'ملخص الحسابات والعمولات' })}
                                </h3>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/60">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('doctors.revenue', { defaultValue: 'إجمالي إيراد الفحوصات' })}</p>
                                        <p className="mt-1 font-mono text-lg font-black text-emerald-600 dark:text-emerald-400" dir="ltr">{formatCurrency(stats.total_revenue, locale)}</p>
                                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{t('doctors.recordedExams', { count: examCount, defaultValue: 'مبني على {{count}} فحص مكتمل' })}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/60">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('doctors.commission', { defaultValue: 'العمولات المستحقة' })}</p>
                                        <p className="mt-1 font-mono text-lg font-black text-amber-600 dark:text-amber-400" dir="ltr">{formatCurrency(stats.commission_est, locale)}</p>
                                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{t('doctors.contractRate', { percent: Number(doctor.commission_percentage || 0), defaultValue: 'وفق نسبة العمولة التعاقدية {{percent}}%' })}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Right Column: Doctor Profile & Liaison Sidebar Console */}
                <aside className="space-y-5">
                    {/* Direct Liaison & Communication Card */}
                    <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-md shadow-slate-200/20 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80">
                        {/* Profile Banner */}
                        <div className="relative -mx-5 -mt-5 mb-4 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white">
                            <div className="pointer-events-none absolute top-0 end-0 h-32 w-32 bg-teal-500/20 blur-2xl" />
                            <div className="relative flex items-center gap-3.5">
                                <span className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-black text-lg shadow-md ring-2 ring-white/20 ${getAvatarGradient(doctor.doctor_id || doctor.full_name)}`}>
                                    {getInitials(doctor.full_name)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h3 className="truncate font-black text-white text-sm">{doctor.full_name}</h3>
                                    <p className="truncate text-xs font-semibold text-teal-300">
                                        {doctor.specialty || t('referringDoctors.values.general', { defaultValue: 'طب عام' })}
                                    </p>
                                    <p className="truncate text-[11px] text-slate-300">
                                        {doctor.clinic_hospital || t('referringDoctors.values.independent', { defaultValue: 'عيادة خاصة' })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Quick Direct Actions */}
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                {doctor.phone ? (
                                    <a
                                        href={`tel:${doctor.phone.replace(/[^+\d]/g, '')}`}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                                    >
                                        <Phone size={13} className="text-teal-600" />
                                        <span>{t('doctors.callDoctor', { defaultValue: 'اتصال' })}</span>
                                    </a>
                                ) : (
                                    <button disabled className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/50 bg-slate-50 text-xs font-medium text-slate-400 opacity-50 dark:border-white/5 dark:bg-white/5">
                                        <Phone size={13} />
                                        <span>{t('doctors.callDoctor', { defaultValue: 'اتصال' })}</span>
                                    </button>
                                )}

                                {getWhatsAppUrl(doctor.phone, doctor.full_name) ? (
                                    <a
                                        href={getWhatsAppUrl(doctor.phone, doctor.full_name)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    >
                                        <MessageCircle size={13} className="text-emerald-600" />
                                        <span>{t('doctors.whatsapp', { defaultValue: 'واتساب' })}</span>
                                    </a>
                                ) : (
                                    <button disabled className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/50 bg-slate-50 text-xs font-medium text-slate-400 opacity-50 dark:border-white/5 dark:bg-white/5">
                                        <MessageCircle size={13} />
                                        <span>{t('doctors.whatsapp', { defaultValue: 'واتساب' })}</span>
                                    </button>
                                )}
                            </div>

                            {doctor.email ? (
                                <a
                                    href={`mailto:${doctor.email}`}
                                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                                >
                                    <Mail size={13} className="text-cyan-600" />
                                    <span>{t('doctors.emailDoctor', { defaultValue: 'إرسال بريد إلكتروني' })}</span>
                                </a>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => setIsInteractionModalOpen(true)}
                                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-3 text-xs font-black text-white shadow-sm transition hover:from-teal-800 hover:to-cyan-800"
                            >
                                <MapPin size={13} />
                                <span>{t('doctors.logVisit', { defaultValue: 'تسجيل زيارة ميدانية' })}</span>
                            </button>
                        </div>
                    </section>

                    {/* Doctor Portal Provisioning Widget */}
                    {isAdmin && (
                        <section className="rounded-3xl border border-cyan-200/80 bg-cyan-50/60 p-5 backdrop-blur-xl dark:border-cyan-500/20 dark:bg-cyan-950/20">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs font-black text-cyan-950 dark:text-cyan-100">
                                    <KeyRound size={16} className="text-cyan-700 dark:text-cyan-400" />
                                    <span>{t('referringDoctors.portal.portalLabel', { defaultValue: 'بوابة الطبيب المحول' })}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doctor.email ? 'bg-cyan-200/80 text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    {doctor.email ? t('referringDoctors.portal.ready', { defaultValue: 'جاهز' }) : t('referringDoctors.portal.noEmail', { defaultValue: 'بدون بريد' })}
                                </span>
                            </div>
                            <p className="mt-1.5 text-xs font-medium text-cyan-800 dark:text-cyan-200 leading-relaxed">
                                {t('referringDoctors.portal.boxHint', { defaultValue: 'تتيح البوابة للطبيب استعراض تقارير مرضاه، تحميل الصور، ومتابعة حالات الإحالة لحظياً.' })}
                            </p>
                            <button
                                type="button"
                                onClick={handleGenerateCredentials}
                                disabled={isGeneratingCredentials || !doctor.email}
                                className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-700 px-3 text-xs font-black text-white shadow-sm transition hover:bg-cyan-800 disabled:opacity-50"
                            >
                                <KeyRound size={13} />
                                {isGeneratingCredentials ? t('referringDoctors.portal.generating', { defaultValue: 'Generating credentials...' }) : t('referringDoctors.portal.generate', { defaultValue: 'إنشاء / إعادة تعيين بيانات الدخول' })}
                            </button>
                        </section>
                    )}

                    {/* Clinical & Contract Details Card */}
                    <section className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80">
                        <div className="flex items-center justify-between border-b border-slate-100/80 pb-3 dark:border-white/5">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                <UserRound size={14} className="text-teal-600" />
                                {t('doctors.partnerProfile', { defaultValue: 'البيانات التعاقدية والإدارية' })}
                            </h3>
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={handleOpenEdit}
                                    title={t('referringDoctors.actions.edit')}
                                    className="text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 transition"
                                >
                                    <Edit3 size={13} />
                                </button>
                            )}
                        </div>
                        <dl className="mt-3.5 space-y-3">
                            <Detail icon={Phone} label={t('referringDoctors.form.phone', { defaultValue: 'الهاتف' })} value={doctor.phone} />
                            <Detail icon={Mail} label={t('referringDoctors.form.email', { defaultValue: 'البريد الإلكتروني' })} value={doctor.email} />
                            <Detail icon={MapPin} label={t('referringDoctors.form.address', { defaultValue: 'العنوان' })} value={doctor.address} />
                            <Detail icon={FileText} label={t('referringDoctors.form.contractId', { defaultValue: 'رقم العقد' })} value={doctor.contract_id} />
                            <Detail icon={FileSpreadsheet} label={t('referringDoctors.form.taxId', { defaultValue: 'الرقم الضريبي' })} value={doctor.tax_id} />
                            <Detail icon={TrendingUp} label={t('referringDoctors.form.source', { defaultValue: 'فئة الإحالة' })} value={doctor.referral_source_category} />
                        </dl>
                        {doctor.notes && (
                            <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-white/[0.02]">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.form.notes', { defaultValue: 'ملاحظات الإدارة' })}</p>
                                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700 dark:text-slate-300">{doctor.notes}</p>
                            </div>
                        )}
                    </section>
                </aside>
            </div>

            {/* Modal: Log Field Visit / Interaction */}
            <Modal
                isOpen={isInteractionModalOpen}
                onClose={() => setIsInteractionModalOpen(false)}
                title={t('doctors.logVisitModalTitle', { defaultValue: 'تسجيل زيارة ميدانية أو تواصل مع الطبيب' })}
                size="default"
            >
                <form onSubmit={handleSaveInteraction} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('doctors.interactionType', { defaultValue: 'نوع النشاط' })}
                            </label>
                            <select
                                value={interactionForm.interactionType}
                                onChange={(e) => setInteractionForm({ ...interactionForm, interactionType: e.target.value })}
                                className={inputClass}
                            >
                                <option value="Visit">{t('doctors.types.visit', { defaultValue: 'زيارة عيادة (Field Visit)' })}</option>
                                <option value="Call">{t('doctors.types.call', { defaultValue: 'مكالمة هاتفية (Phone Call)' })}</option>
                                <option value="Meeting">{t('doctors.types.meeting', { defaultValue: 'اجتماع رسمي (Meeting)' })}</option>
                                <option value="WhatsApp">{t('doctors.types.whatsapp', { defaultValue: 'مراسلة واتساب (WhatsApp)' })}</option>
                                <option value="Note">{t('doctors.types.note', { defaultValue: 'ملاحظة داخلية (Internal Note)' })}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('doctors.purpose', { defaultValue: 'الغرض من النشاط' })}
                            </label>
                            <select
                                value={interactionForm.purpose}
                                onChange={(e) => setInteractionForm({ ...interactionForm, purpose: e.target.value })}
                                className={inputClass}
                            >
                                <option value="Routine Liaison">{t('doctors.purposes.routine', { defaultValue: 'زيارة دورية وتعريفية' })}</option>
                                <option value="Marketing Materials">{t('doctors.purposes.materials', { defaultValue: 'تسليم مطبوعات وبروشورات' })}</option>
                                <option value="Feedback/Issue">{t('doctors.purposes.feedback', { defaultValue: 'متابعة ملاحظة أو شكوى' })}</option>
                                <option value="Contract Discussion">{t('doctors.purposes.contract', { defaultValue: 'مراجعة تعاقد أو عمولات' })}</option>
                                <option value="Modality Intro">{t('doctors.purposes.modality', { defaultValue: 'تقديم فحوصات وأجهزة جديدة' })}</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('doctors.interactionDate', { defaultValue: 'تاريخ ووقت النشاط' })}
                            </label>
                            <input
                                type="datetime-local"
                                value={interactionForm.interactionDate}
                                onChange={(e) => setInteractionForm({ ...interactionForm, interactionDate: e.target.value })}
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('doctors.nextFollowUp', { defaultValue: 'موعد المتابعة القادمة' })}
                            </label>
                            <input
                                type="date"
                                value={interactionForm.nextFollowUpDate}
                                onChange={(e) => setInteractionForm({ ...interactionForm, nextFollowUpDate: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {t('doctors.materialsDelivered', { defaultValue: 'المواد والمطبوعات المسلّمة' })}
                        </label>
                        <input
                            type="text"
                            value={interactionForm.materialsDelivered}
                            onChange={(e) => setInteractionForm({ ...interactionForm, materialsDelivered: e.target.value })}
                            placeholder={t('doctors.materialsPlaceholder', { defaultValue: 'مثال: كتالوج الخدمات، نماذج طلب فحص، بروشورات MRI...' })}
                            className={inputClass}
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
                                    className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    + {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {t('doctors.notesAndFeedback', { defaultValue: 'الملاحظات ومخرجات الزيارة' })}
                        </label>
                        <textarea
                            rows={3}
                            value={interactionForm.notes}
                            onChange={(e) => setInteractionForm({ ...interactionForm, notes: e.target.value })}
                            placeholder={t('doctors.notesPlaceholder', { defaultValue: 'سجل تفاصيل المحادثة، رأي الطبيب، اقتراحاته، أو أي صعوبات واجهها...' })}
                            className={`${inputClass} h-auto py-2 resize-y`}
                        />
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                        <button type="button" onClick={() => setIsInteractionModalOpen(false)} className={secondaryBtn}>
                            {t('actions.cancel', { ns: 'common', defaultValue: 'إلغاء' })}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmittingInteraction}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-5 text-xs font-black text-white shadow-sm transition hover:from-teal-800 hover:to-cyan-800 disabled:opacity-50"
                        >
                            {isSubmittingInteraction ? t('doctors.savingInteraction', { defaultValue: 'جارِ الحفظ...' }) : t('doctors.saveInteraction', { defaultValue: 'حفظ النشاط' })}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal: Edit Doctor Details */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={t('referringDoctors.form.editTitle', { defaultValue: 'تعديل بيانات الطبيب المحول' })}
                size="default"
            >
                <form onSubmit={handleSaveEdit} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.fullName', { defaultValue: 'اسم الطبيب' })} *
                            </label>
                            <input
                                type="text"
                                value={editForm.fullName}
                                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                                required
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.specialty', { defaultValue: 'التخصص' })}
                            </label>
                            <input
                                type="text"
                                value={editForm.specialty}
                                onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.clinic', { defaultValue: 'العيادة / المستشفى' })}
                            </label>
                            <input
                                type="text"
                                value={editForm.clinicHospital}
                                onChange={(e) => setEditForm({ ...editForm, clinicHospital: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.commission', { defaultValue: 'نسبة العمولة (%)' })}
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={editForm.commissionPercentage}
                                onChange={(e) => setEditForm({ ...editForm, commissionPercentage: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.phone', { defaultValue: 'الهاتف' })}
                            </label>
                            <input
                                type="tel"
                                dir="ltr"
                                value={editForm.phone}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.email', { defaultValue: 'البريد الإلكتروني' })}
                            </label>
                            <input
                                type="email"
                                dir="ltr"
                                value={editForm.email}
                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                {t('referringDoctors.form.address', { defaultValue: 'العنوان' })}
                            </label>
                            <input
                                type="text"
                                value={editForm.address}
                                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editForm.isActive}
                                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                />
                                <span>{t('referringDoctors.form.active', { defaultValue: 'شريك إحالات نشط' })}</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                        <button type="button" onClick={() => setIsEditModalOpen(false)} className={secondaryBtn}>
                            {t('actions.cancel', { ns: 'common', defaultValue: 'إلغاء' })}
                        </button>
                        <button
                            type="submit"
                            disabled={isUpdatingDoctor}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-5 text-xs font-black text-white shadow-sm transition hover:from-teal-800 hover:to-cyan-800 disabled:opacity-50"
                        >
                            {isUpdatingDoctor ? t('referringDoctors.actions.saving', { defaultValue: 'جارِ الحفظ...' }) : t('referringDoctors.actions.save', { defaultValue: 'حفظ التعديلات' })}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Credential Handoff Dialog for Doctor Portal */}
            <CredentialHandoffDialog
                isOpen={Boolean(credentialDialog)}
                credentials={credentialDialog}
                onClose={() => setCredentialDialog(null)}
            />
        </div>
    );
}

const MetaPill = ({ icon: Icon, children }) => (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
        <Icon size={12} className="shrink-0 text-slate-400" />
        <span className="truncate">{children}</span>
    </span>
);

const Detail = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <Icon size={13} />
        </span>
        <div className="min-w-0">
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className="mt-0.5 break-words text-xs font-semibold text-slate-800 dark:text-slate-200">{value || fallback}</dd>
        </div>
    </div>
);
