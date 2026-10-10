import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    ArrowUpDown,
    BadgePercent,
    Briefcase,
    Building2,
    CalendarCheck2,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleDollarSign,
    Copy,
    Download,
    Edit3,
    ExternalLink,
    Eye,
    FileText,
    FileUp,
    FilterX,
    KeyRound,
    LayoutGrid,
    ListFilter,
    Mail,
    MapPin,
    MessageCircle,
    PanelRight,
    PanelRightClose,
    Phone,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Trash2,
    TrendingUp,
    UserCheck,
    UserSquare2,
    Users,
    WalletCards,
    X,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useCreateReferringDoctorMutation,
    useDeleteReferringDoctorMutation,
    useGetReferringDoctorsQuery,
    useSetDoctorPortalPasswordMutation,
    useUpdateReferringDoctorMutation
} from '../store/api';
import { ConfirmDialog, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui';
import { selectCurrentUser } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import { inputClass, secondaryBtn } from '../utils/designTokens';
import { getDoctorPortalLoginUrl } from '../utils/portalUrls';
import CredentialHandoffDialog from '../components/CredentialHandoffDialog';
import useDebounce from '../hooks/useDebounce';

const emptyDoctorForm = {
    fullName: '',
    specialty: '',
    clinicHospital: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
    contractId: '',
    referralSourceCategory: 'Doctor',
    commissionPercentage: 0,
    preferredContactMethod: 'Email',
    notes: '',
    generatePortalCredentials: false,
    isActive: true
};

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

const getWhatsAppUrl = (phone) => {
    if (!phone) return null;
    const cleanNumber = phone.replace(/[^+\d]/g, '');
    return `https://wa.me/${cleanNumber.replace(/^\+/, '')}`;
};

const ReferringDoctors = () => {
    const { t, i18n } = useTranslation('admin');
    const navigate = useNavigate();
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
    const currentUser = useSelector(selectCurrentUser);
    const isAdmin = hasDeveloperOrAdminRole(currentUser?.role);
    const canCreate = hasDeveloperOrAdminRole(currentUser?.role) || currentUser?.role === 'Receptionist';
    const fileInputRef = useRef(null);

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm.trim(), 250);
    const [activeOnly, setActiveOnly] = useState(true);
    const [specialtyFilter, setSpecialtyFilter] = useState('all');
    const [sortBy, setSortBy] = useState('revenue'); // 'revenue' | 'appointments' | 'commission' | 'name'
    const [selectedId, setSelectedId] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(true);
    const [modalMode, setModalMode] = useState(null);
    const [form, setForm] = useState(emptyDoctorForm);
    const [deactivateTarget, setDeactivateTarget] = useState(null);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

    const { data: doctors = [], isLoading, isError, refetch } = useGetReferringDoctorsQuery({
        search: debouncedSearchTerm || undefined,
        active: activeOnly ? 'true' : undefined,
        limit: 500
    });
    const [createDoctor, { isLoading: isCreating }] = useCreateReferringDoctorMutation();
    const [updateDoctor, { isLoading: isUpdating }] = useUpdateReferringDoctorMutation();
    const [deleteDoctor, { isLoading: isDeleting }] = useDeleteReferringDoctorMutation();
    const [setDoctorPortalPassword, { isLoading: isGeneratingCredentials }] = useSetDoctorPortalPasswordMutation();

    const specialties = useMemo(() => Array.from(new Set(doctors.map(doctor => doctor.specialty).filter(Boolean))).sort(), [doctors]);
    
    const visibleDoctors = useMemo(() => {
        let list = specialtyFilter === 'all' ? doctors : doctors.filter(doctor => doctor.specialty === specialtyFilter);
        return list;
    }, [doctors, specialtyFilter]);

    const sortedDoctors = useMemo(() => {
        return [...visibleDoctors].sort((a, b) => {
            if (sortBy === 'revenue') return Number(b.total_revenue || 0) - Number(a.total_revenue || 0);
            if (sortBy === 'appointments') return Number(b.appointment_count || 0) - Number(a.appointment_count || 0);
            if (sortBy === 'commission') return Number(b.commission_percentage || 0) - Number(a.commission_percentage || 0);
            return (a.full_name || '').localeCompare(b.full_name || '');
        });
    }, [visibleDoctors, sortBy]);

    const selectedDoctor = sortedDoctors.find(doctor => doctor.doctor_id === selectedId) || sortedDoctors[0] || null;

    const summary = useMemo(() => {
        const total = visibleDoctors.length;
        const active = visibleDoctors.filter(doctor => doctor.is_active).length;
        const appointments = visibleDoctors.reduce((sum, doctor) => sum + Number(doctor.appointment_count || 0), 0);
        const revenue = visibleDoctors.reduce((sum, doctor) => sum + Number(doctor.total_revenue || 0), 0);
        const commissions = visibleDoctors.reduce((sum, doctor) => sum + Number(doctor.commission_est || 0), 0);
        const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;
        const avgRevenue = active > 0 ? Math.round(revenue / active) : 0;
        return { total, active, appointments, revenue, commissions, activeRate, avgRevenue };
    }, [visibleDoctors]);

    const hasFilters = Boolean(searchTerm || !activeOnly || specialtyFilter !== 'all' || sortBy !== 'revenue');

    const clearFilters = () => {
        setSearchTerm('');
        setActiveOnly(true);
        setSpecialtyFilter('all');
        setSortBy('revenue');
    };

    const openCreate = () => {
        setForm({ ...emptyDoctorForm, generatePortalCredentials: isAdmin, isActive: true });
        setModalMode('create');
    };

    const openEdit = (doctor) => {
        setSelectedId(doctor.doctor_id);
        setIsDrawerOpen(true);
        setForm(toDoctorForm(doctor));
        setModalMode('edit');
    };

    const closeModal = () => {
        setModalMode(null);
        setForm(emptyDoctorForm);
    };

    const saveDoctor = async () => {
        if (!form.fullName.trim()) {
            toast.error(t('referringDoctors.messages.nameRequired'));
            return;
        }
        if (modalMode === 'create' && form.generatePortalCredentials && !form.email.trim()) {
            toast.error(t('referringDoctors.portal.emailRequired', { defaultValue: 'Add an email address before generating doctor portal credentials.' }));
            return;
        }
        try {
            if (modalMode === 'edit' && selectedDoctor) {
                await updateDoctor({ id: selectedDoctor.doctor_id, ...cleanDoctorPayload(form) }).unwrap();
                toast.success(t('referringDoctors.messages.updated'));
            } else {
                const result = await createDoctor(cleanDoctorPayload(form)).unwrap();
                setSelectedId(result.doctor_id);
                setIsDrawerOpen(true);
                toast.success(t('referringDoctors.messages.created'));
                if (form.generatePortalCredentials && isAdmin) {
                    await generateDoctorCredentials(result);
                }
            }
            closeModal();
        } catch (error) {
            toast.error(getErrorMessage(error, t('referringDoctors.messages.saveFailed')));
        }
    };

    const deactivateDoctor = async () => {
        if (!deactivateTarget) return;
        try {
            await deleteDoctor(deactivateTarget.doctor_id).unwrap();
            toast.success(t('referringDoctors.messages.deactivated'));
            if (selectedId === deactivateTarget.doctor_id) setSelectedId(null);
            setDeactivateTarget(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('referringDoctors.messages.deactivateFailed')));
        }
    };

    const generateDoctorCredentials = async (doctor) => {
        if (!doctor?.doctor_id) return;
        if (!doctor.email) {
            toast.error(t('referringDoctors.portal.emailRequired', { defaultValue: 'Add an email address before generating doctor portal credentials.' }));
            return;
        }
        try {
            const result = await setDoctorPortalPassword({ id: doctor.doctor_id }).unwrap();
            setCredentialDialog({
                title: t('referringDoctors.portal.credentialsTitle', { defaultValue: 'Doctor portal credentials' }),
                portalLabel: t('referringDoctors.portal.portalLabel', { defaultValue: 'Referring doctor portal' }),
                subjectLabel: t('referringDoctors.table.doctor'),
                subjectName: result.doctorName || doctor.full_name,
                email: result.email || doctor.email,
                password: result.portalPassword,
                loginUrl: getDoctorPortalLoginUrl(),
                deliveryHint: t('referringDoctors.portal.credentialsHint', {
                    defaultValue: 'Give these credentials directly to the referring doctor or authorized clinic contact. Ask them to keep the password private.'
                })
            });
        } catch (error) {
            toast.error(getErrorMessage(error, t('referringDoctors.portal.generateFailed', { defaultValue: 'Could not generate doctor portal credentials.' })));
        }
    };

    const exportCsv = () => {
        const headers = ['fullName', 'specialty', 'clinicHospital', 'phone', 'email', 'commissionPercentage', 'referralSourceCategory'];
        const lines = sortedDoctors.map(doctor => [doctor.full_name, doctor.specialty, doctor.clinic_hospital, doctor.phone, doctor.email, doctor.commission_percentage, doctor.referral_source_category].map(csvEscape).join(','));
        downloadFile(`referring-doctors-${new Date().toISOString().slice(0, 10)}.csv`, [headers.join(','), ...lines].join('\n'));
        toast.success(t('referringDoctors.messages.exported', { count: sortedDoctors.length }));
    };

    const importCsv = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = (await file.text()).replace(/^\uFEFF/, '');
            const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            const dataRows = rows[0]?.toLowerCase().includes('fullname') ? rows.slice(1) : rows;
            let imported = 0;
            for (const row of dataRows) {
                const [fullName, specialty, clinicHospital, phone, email, commissionPercentage, referralSourceCategory] = parseCsvLine(row);
                if (!fullName) continue;
                await createDoctor({ fullName, specialty: specialty || undefined, clinicHospital: clinicHospital || undefined, phone: phone || undefined, email: email || undefined, commissionPercentage: commissionPercentage ? Number(commissionPercentage) : undefined, referralSourceCategory: referralSourceCategory || undefined }).unwrap();
                imported += 1;
            }
            toast.success(t('referringDoctors.messages.imported', { count: imported }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('referringDoctors.messages.importFailed')));
        } finally {
            event.target.value = '';
        }
    };

    return (
        <div className="referring-doctors-page space-y-5 pb-16">
            {/* Executive Page Header */}
            <PageHeader
                className="referring-doctors-header"
                compact
                icon={Stethoscope}
                eyebrow={t('referringDoctors.eyebrow')}
                eyebrowIcon={Activity}
                title={t('referringDoctors.title')}
                description={t('referringDoctors.description')}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/90 px-3 py-1 text-xs font-bold text-teal-800 shadow-sm dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                            <ShieldCheck size={13} className="text-teal-600 dark:text-teal-400" />
                            {t('referringDoctors.badges.governed')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                            <BadgePercent size={13} className="text-cyan-600 dark:text-cyan-400" />
                            {t('referringDoctors.badges.commissions')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Zap size={13} className="text-emerald-600 dark:text-emerald-400" />
                            {t('referringDoctors.badges.portal')}
                        </span>
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={exportCsv}
                            disabled={sortedDoctors.length === 0}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                        >
                            <Download size={13} /> {t('referringDoctors.actions.export')}
                        </button>
                        {canCreate && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                            >
                                <FileUp size={13} /> {t('referringDoctors.actions.import')}
                            </button>
                        )}
                        {canCreate && (
                            <button
                                type="button"
                                onClick={openCreate}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-4 text-xs font-black text-white shadow-sm shadow-teal-700/25 transition hover:from-teal-800 hover:to-cyan-800"
                            >
                                <Plus size={14} /> {t('referringDoctors.actions.add')}
                            </button>
                        )}
                        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="sr-only" aria-label={t('referringDoctors.actions.import')} />
                    </div>
                }
                metrics={[
                    { key: 'network', icon: Users, label: t('referringDoctors.metrics.network'), value: summary.total, detail: t('referringDoctors.metrics.networkDetail'), tone: 'cyan', loading: isLoading, error: isError },
                    { key: 'active', icon: UserCheck, label: t('referringDoctors.metrics.active'), value: summary.active, detail: t('referringDoctors.metrics.activeDetail'), tone: 'emerald', loading: isLoading, error: isError },
                    { key: 'appointments', icon: CalendarCheck2, label: t('referringDoctors.metrics.appointments'), value: summary.appointments, detail: t('referringDoctors.metrics.appointmentsDetail'), tone: 'blue', loading: isLoading, error: isError },
                    { key: 'revenue', icon: TrendingUp, label: t('referringDoctors.metrics.revenue'), value: formatCurrency(summary.revenue, locale), detail: t('referringDoctors.metrics.revenueDetail'), tone: 'emerald', loading: isLoading, error: isError },
                    { key: 'commissions', icon: CircleDollarSign, label: t('referringDoctors.metrics.commissions'), value: formatCurrency(summary.commissions, locale), detail: t('referringDoctors.metrics.commissionsDetail'), tone: 'amber', loading: isLoading, error: isError },
                ]}
                metricsLabel={t('referringDoctors.metrics.label')}
            />

            {/* Compact Executive Ratio Intelligence Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80">
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            <Activity size={13} />
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{t('referringDoctors.metrics.activeRate', { defaultValue: 'نسبة النشطين:' })}</span>
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{summary.activeRate}%</span>
                        <span className="text-[11px] text-slate-400">({summary.active}/{summary.total})</span>
                    </div>

                    <span className="hidden h-4 w-px bg-slate-200 dark:bg-white/10 sm:block" />

                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                            <TrendingUp size={13} />
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{t('referringDoctors.metrics.avgRevenue', { defaultValue: 'متوسط إيراد الشريك:' })}</span>
                        <span className="font-mono font-black text-slate-900 dark:text-white" dir="ltr">{formatCurrency(summary.avgRevenue, locale)}</span>
                    </div>

                    <span className="hidden h-4 w-px bg-slate-200 dark:bg-white/10 sm:block" />

                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            <BadgePercent size={13} />
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{t('referringDoctors.metrics.commissionsRatio', { defaultValue: 'إجمالي العمولات:' })}</span>
                        <span className="font-mono font-black text-amber-600 dark:text-amber-400" dir="ltr">{formatCurrency(summary.commissions, locale)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <Stethoscope size={13} className="text-teal-600 shrink-0" />
                    <span>{specialties.length} {t('referringDoctors.metrics.specialtyLabel', { defaultValue: 'تخصص طبي' })}</span>
                </div>
            </div>

            {/* Refined Search & Filter Toolbar */}
            <section className="referring-doctors-toolbar overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/85">
                <div className="flex flex-col gap-3 border-b border-slate-100/80 px-4 py-3.5 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/25">
                            <Users size={16} />
                        </span>
                        <div>
                            <h2 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">
                                {t('referringDoctors.directory.title')}
                            </h2>
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {t('referringDoctors.directory.description')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Sort Selector */}
                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                            <ArrowUpDown size={12} className="text-slate-400" />
                            <span className="hidden md:inline text-slate-400 text-[11px]">{t('referringDoctors.filters.sortBy', { defaultValue: 'الترتيب:' })}</span>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="bg-transparent font-bold text-slate-800 outline-none dark:text-slate-200 cursor-pointer text-xs"
                                aria-label={t('referringDoctors.filters.sortBy', { defaultValue: 'ترتيب حسب' })}
                            >
                                <option value="revenue" className="dark:bg-slate-900">{t('referringDoctors.sort.revenue', { defaultValue: 'الأعلى إيراداً' })}</option>
                                <option value="appointments" className="dark:bg-slate-900">{t('referringDoctors.sort.appointments', { defaultValue: 'الأكثر إحالة' })}</option>
                                <option value="commission" className="dark:bg-slate-900">{t('referringDoctors.sort.commission', { defaultValue: 'نسبة العمولة' })}</option>
                                <option value="name" className="dark:bg-slate-900">{t('referringDoctors.sort.name', { defaultValue: 'الاسم أبجدياً' })}</option>
                            </select>
                        </div>

                        {/* View Mode Switcher */}
                        <div role="group" aria-label={t('referringDoctors.viewMode.label')} className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-0.5 dark:border-white/10 dark:bg-slate-900">
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                aria-pressed={viewMode === 'table'}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${viewMode === 'table'
                                    ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                title={t('referringDoctors.viewMode.table')}
                            >
                                <ListFilter size={13} />
                                <span className="hidden sm:inline">{t('referringDoctors.viewMode.table')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                aria-pressed={viewMode === 'grid'}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${viewMode === 'grid'
                                    ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                title={t('referringDoctors.viewMode.cards')}
                            >
                                <LayoutGrid size={13} />
                                <span className="hidden sm:inline">{t('referringDoctors.viewMode.cards')}</span>
                            </button>
                        </div>

                        {/* Side Drawer Toggle Button */}
                        <button
                            type="button"
                            onClick={() => setIsDrawerOpen(prev => !prev)}
                            className={`hidden xl:inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition-all ${isDrawerOpen
                                ? 'border-teal-200/80 bg-teal-50/80 text-teal-800 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300'
                                : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                            title={isDrawerOpen ? t('referringDoctors.drawer.hide', { defaultValue: 'إخفاء اللوحة الجانبية' }) : t('referringDoctors.drawer.show', { defaultValue: 'عرض اللوحة الجانبية' })}
                        >
                            {isDrawerOpen ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
                            <span>{t('referringDoctors.drawer.label', { defaultValue: 'اللوحة الجانبية' })}</span>
                        </button>

                        <span className="rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                            {t('referringDoctors.filters.results', { count: sortedDoctors.length })}
                        </span>

                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200/80 bg-rose-50/80 px-2 py-0.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
                            >
                                <FilterX size={12} />
                                {t('referringDoctors.filters.reset')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-3.5 sm:p-4">
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                aria-label={t('referringDoctors.filters.searchLabel')}
                                placeholder={t('referringDoctors.filters.search')}
                                className="h-9 w-full rounded-xl border border-slate-200/80 bg-white/80 ps-9 pe-8 text-xs font-bold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:border-teal-500 dark:focus:ring-teal-500/20"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        <select
                            value={specialtyFilter}
                            onChange={event => setSpecialtyFilter(event.target.value)}
                            aria-label={t('referringDoctors.filters.specialty')}
                            className="h-9 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-teal-500 dark:focus:ring-teal-500/20 min-w-[150px]"
                        >
                            <option value="all">{t('referringDoctors.filters.allSpecialties')}</option>
                            {specialties.map(specialty => <option key={specialty} value={specialty}>{specialty}</option>)}
                        </select>

                        <div className="flex rounded-xl border border-slate-200/80 bg-slate-100/70 p-0.5 dark:border-white/10 dark:bg-slate-900">
                            <FilterToggle active={activeOnly} onClick={() => setActiveOnly(true)}>{t('referringDoctors.filters.active')}</FilterToggle>
                            <FilterToggle active={!activeOnly} onClick={() => setActiveOnly(false)}>{t('referringDoctors.filters.all')}</FilterToggle>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Section: Fluid Master Table / Cards + Collapsible Drawer */}
            <div className={`grid grid-cols-1 gap-5 ${isDrawerOpen ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
                {/* Directory Content Container */}
                <section className="referring-doctors-directory overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-md shadow-slate-200/20 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    {isLoading ? (
                        <div className="space-y-3 p-5">{[1, 2, 3, 4].map(item => <Skeleton key={item} height="76px" className="rounded-2xl" />)}</div>
                    ) : isError ? (
                        <EmptyState icon={RefreshCw} title={t('referringDoctors.states.errorTitle')} description={t('referringDoctors.states.errorDescription')} actionLabel={t('referringDoctors.actions.retry')} onAction={refetch} />
                    ) : sortedDoctors.length === 0 ? (
                        <EmptyState icon={UserSquare2} title={t('referringDoctors.states.emptyTitle')} description={hasFilters ? t('referringDoctors.states.filteredEmpty') : t('referringDoctors.states.emptyDescription')} actionLabel={hasFilters ? t('referringDoctors.filters.reset') : canCreate ? t('referringDoctors.actions.add') : undefined} onAction={hasFilters ? clearFilters : canCreate ? openCreate : undefined} />
                    ) : viewMode === 'grid' ? (
                        /* Modern Medical Grid Cards View */
                        <div className={`grid gap-4 p-4 sm:p-5 ${isDrawerOpen ? 'sm:grid-cols-1 md:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                            {sortedDoctors.map(doctor => (
                                <DoctorGridCard
                                    key={doctor.doctor_id}
                                    doctor={doctor}
                                    selected={selectedDoctor?.doctor_id === doctor.doctor_id}
                                    onSelect={() => {
                                        setSelectedId(doctor.doctor_id);
                                        setIsDrawerOpen(true);
                                    }}
                                    onViewDetails={() => navigate(`/referring-doctors/${doctor.doctor_id}`)}
                                    onEdit={isAdmin ? () => openEdit(doctor) : undefined}
                                    onGenerateCredentials={isAdmin ? () => generateDoctorCredentials(doctor) : undefined}
                                    isGeneratingCredentials={isGeneratingCredentials}
                                    t={t}
                                    locale={locale}
                                />
                            ))}
                        </div>
                    ) : (
                        /* Fluid Executive Table View (No Horizontal Overflow) */
                        <>
                            <div className="divide-y divide-slate-100/80 dark:divide-white/5 lg:hidden">
                                {sortedDoctors.map(doctor => (
                                    <DoctorMobileCard
                                        key={doctor.doctor_id}
                                        doctor={doctor}
                                        selected={selectedDoctor?.doctor_id === doctor.doctor_id}
                                        onSelect={() => {
                                            setSelectedId(doctor.doctor_id);
                                            setIsDrawerOpen(true);
                                        }}
                                        onViewDetails={() => navigate(`/referring-doctors/${doctor.doctor_id}`)}
                                        onEdit={isAdmin ? () => openEdit(doctor) : undefined}
                                        onGenerateCredentials={isAdmin ? () => generateDoctorCredentials(doctor) : undefined}
                                        isGeneratingCredentials={isGeneratingCredentials}
                                        t={t}
                                        locale={locale}
                                    />
                                ))}
                            </div>

                            <div className="hidden lg:block overflow-hidden">
                                <table className="w-full border-collapse text-start text-sm">
                                    <thead className="border-b border-slate-200/80 bg-slate-50/90 backdrop-blur-md dark:border-white/5 dark:bg-slate-900/90 dark:text-slate-400">
                                        <tr>
                                            <th className="px-4 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.doctor')}</th>
                                            <th className="px-3 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.contact')}</th>
                                            <th className="px-3 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.performance')}</th>
                                            <th className="px-3 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.commission')}</th>
                                            <th className="w-[130px] px-3 py-3.5 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                        {sortedDoctors.map((doctor, index) => (
                                            <DoctorTableRow
                                                key={doctor.doctor_id}
                                                doctor={doctor}
                                                isZebra={index % 2 !== 0}
                                                selected={selectedDoctor?.doctor_id === doctor.doctor_id}
                                                onSelect={() => {
                                                    setSelectedId(doctor.doctor_id);
                                                    setIsDrawerOpen(true);
                                                }}
                                                onViewDetails={() => navigate(`/referring-doctors/${doctor.doctor_id}`)}
                                                onEdit={() => openEdit(doctor)}
                                                onGenerateCredentials={() => generateDoctorCredentials(doctor)}
                                                onDeactivate={() => setDeactivateTarget(doctor)}
                                                isAdmin={isAdmin}
                                                isDeleting={isDeleting}
                                                isGeneratingCredentials={isGeneratingCredentials}
                                                t={t}
                                                locale={locale}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* Collapsible Side Profile Drawer (Liaison Console) */}
                {isDrawerOpen && (
                    <DoctorProfile
                        doctor={selectedDoctor}
                        onClose={() => setIsDrawerOpen(false)}
                        onViewDetails={selectedDoctor ? () => navigate(`/referring-doctors/${selectedDoctor.doctor_id}`) : undefined}
                        onEdit={selectedDoctor && isAdmin ? () => openEdit(selectedDoctor) : undefined}
                        onGenerateCredentials={selectedDoctor && isAdmin ? () => generateDoctorCredentials(selectedDoctor) : undefined}
                        isGeneratingCredentials={isGeneratingCredentials}
                        t={t}
                        locale={locale}
                    />
                )}
            </div>

            {/* Modals & Dialogs */}
            <DoctorModal
                visible={Boolean(modalMode)}
                mode={modalMode}
                title={modalMode === 'edit' ? t('referringDoctors.form.editTitle') : t('referringDoctors.form.createTitle')}
                form={form}
                setForm={setForm}
                isSaving={isCreating || isUpdating}
                onCancel={closeModal}
                onSave={saveDoctor}
                canSetActive={modalMode === 'edit' && isAdmin}
                canGenerateCredentials={isAdmin}
                onGenerateCredentials={selectedDoctor && modalMode === 'edit' ? () => generateDoctorCredentials(selectedDoctor) : undefined}
                isGeneratingCredentials={isGeneratingCredentials}
                t={t}
            />

            <ConfirmDialog
                isOpen={Boolean(deactivateTarget)}
                onClose={() => setDeactivateTarget(null)}
                onConfirm={deactivateDoctor}
                title={t('referringDoctors.deactivate.title')}
                message={t('referringDoctors.deactivate.message', { name: deactivateTarget?.full_name || '' })}
                confirmText={t('referringDoctors.actions.deactivate')}
                variant="danger"
                isLoading={isDeleting}
            />

            <CredentialHandoffDialog
                isOpen={Boolean(credentialDialog)}
                credentials={credentialDialog}
                onClose={() => setCredentialDialog(null)}
            />
        </div>
    );
};

const FilterToggle = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`min-h-7 flex-1 rounded-lg px-3 text-xs font-bold transition-all ${active
            ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
    >
        {children}
    </button>
);

/* Fluid Table Row Component */
const DoctorTableRow = ({ doctor, selected, isZebra, onSelect, onViewDetails, onEdit, onGenerateCredentials, onDeactivate, isAdmin, isDeleting, isGeneratingCredentials, t, locale }) => {
    const stripColor = doctor.is_active ? 'border-emerald-500' : 'border-slate-300';
    return (
        <tr
            tabIndex={0}
            aria-selected={selected}
            className={`group cursor-pointer transition-colors focus-visible:outline-none ${selected
                ? 'bg-teal-50/80 dark:bg-teal-950/40 ring-1 ring-inset ring-teal-500/20'
                : isZebra
                    ? 'bg-slate-50/40 dark:bg-white/[0.01] hover:bg-slate-100/70 dark:hover:bg-white/[0.04]'
                    : 'bg-white dark:bg-transparent hover:bg-slate-100/70 dark:hover:bg-white/[0.04]'
                }`}
            onClick={onSelect}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}
        >
            <td className={`px-4 py-3.5 border-s-[3px] ${stripColor}`}>
                <DoctorIdentity doctor={doctor} onClick={onViewDetails} t={t} />
            </td>
            <td className="px-3 py-3.5">
                <DoctorContactDetails doctor={doctor} t={t} />
            </td>
            <td className="px-3 py-3.5 whitespace-nowrap">
                <p className="font-bold text-xs text-slate-900 dark:text-white">
                    {t('referringDoctors.values.appointments', { count: Number(doctor.appointment_count || 0) })}
                </p>
                <p className="mt-0.5 font-mono text-xs font-black text-emerald-600 dark:text-emerald-400" dir="ltr">
                    {formatCurrency(doctor.total_revenue, locale)}
                </p>
            </td>
            <td className="px-3 py-3.5 whitespace-nowrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    {Number(doctor.commission_percentage || 0)}%
                </span>
                <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400" dir="ltr">
                    {formatCurrency(doctor.commission_est, locale)}
                </p>
            </td>
            <td className="w-[130px] px-3 py-3.5 text-end">
                <div className="flex items-center justify-end gap-1 opacity-90 transition-opacity group-hover:opacity-100" onClick={event => event.stopPropagation()}>
                    <IconButton label={t('referringDoctors.actions.viewDetails', { defaultValue: 'View Details & Referrals' })} icon={Eye} onClick={onViewDetails} tone="teal" />
                    {isAdmin && <IconButton label={t('referringDoctors.portal.generate', { defaultValue: 'Generate portal credentials' })} icon={KeyRound} onClick={onGenerateCredentials} disabled={isGeneratingCredentials} tone="cyan" />}
                    {isAdmin && <IconButton label={t('referringDoctors.actions.edit')} icon={Edit3} onClick={onEdit} />}
                    {isAdmin && <IconButton label={t('referringDoctors.actions.deactivate')} icon={Trash2} onClick={onDeactivate} danger disabled={isDeleting} />}
                </div>
            </td>
        </tr>
    );
};

/* Doctor Identity Header Block */
const DoctorIdentity = ({ doctor, onClick, t }) => (
    <div
        onClick={onClick}
        className={`flex min-w-0 items-center gap-3 ${onClick ? 'cursor-pointer group/identity' : ''}`}
    >
        <div className="relative shrink-0">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br font-black text-xs shadow-sm transition-transform duration-300 group-hover/identity:scale-105 ${getAvatarGradient(doctor.doctor_id || doctor.full_name)}`}>
                {initials(doctor.full_name)}
            </span>
            <span className="absolute -bottom-0.5 -end-0.5 flex h-2.5 w-2.5">
                {doctor.is_active ? (
                    <>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                    </>
                ) : (
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400 dark:border-slate-900" />
                )}
            </span>
        </div>
        <div className="min-w-0">
            <p title={doctor.full_name} className="truncate font-black text-xs text-slate-900 transition-colors group-hover/identity:text-teal-600 dark:text-white dark:group-hover/identity:text-teal-400">
                {doctor.full_name}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-300 truncate max-w-[130px]">
                    <Briefcase size={10} className="shrink-0" />
                    {doctor.specialty || t('referringDoctors.values.general')}
                </span>
                {doctor.clinic_hospital && (
                    <>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="truncate text-slate-500 dark:text-slate-400 max-w-[120px]">{doctor.clinic_hospital}</span>
                    </>
                )}
            </div>
        </div>
    </div>
);

/* Grid View Doctor Card */
const DoctorGridCard = ({ doctor, selected, onSelect, onViewDetails, onEdit, onGenerateCredentials, isGeneratingCredentials, t, locale }) => (
    <article
        onClick={onSelect}
        className={`group cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${selected
            ? 'border-teal-400 bg-teal-50/70 ring-2 ring-teal-500/20 shadow-md shadow-teal-500/10 dark:border-teal-500/80 dark:bg-teal-950/35'
            : 'border-slate-200/80 bg-white/80 hover:border-slate-300 shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-white/20'
            }`}
    >
        <div className="flex items-start justify-between gap-3">
            <DoctorIdentity doctor={doctor} onClick={onViewDetails} t={t} />
            <StatusPill active={doctor.is_active} t={t} />
        </div>

        <div className="mt-3.5 border-t border-b border-slate-100/80 py-2.5 dark:border-white/5">
            <DoctorContactDetails doctor={doctor} t={t} />
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-1.5 text-start">
            <CompactValue label={t('referringDoctors.profile.appointments')} value={Number(doctor.appointment_count || 0)} />
            <CompactValue label={t('referringDoctors.profile.revenue')} value={formatCurrency(doctor.total_revenue, locale)} />
            <CompactValue label={t('referringDoctors.profile.commission')} value={`${Number(doctor.commission_percentage || 0)}%`} />
        </dl>

        <div className="mt-3 flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
            {onViewDetails && (
                <button
                    type="button"
                    onClick={onViewDetails}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-teal-200/80 bg-teal-50/90 px-2.5 py-1 text-xs font-bold text-teal-800 transition hover:bg-teal-100 active:scale-95 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300"
                >
                    <Eye size={13} />{t('referringDoctors.actions.viewDetailsShort')}
                </button>
            )}
            {onGenerateCredentials && (
                <button
                    type="button"
                    onClick={onGenerateCredentials}
                    disabled={isGeneratingCredentials}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-cyan-200/80 bg-cyan-50/90 px-2.5 py-1 text-xs font-bold text-cyan-800 transition hover:bg-cyan-100 active:scale-95 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                    <KeyRound size={13} />{t('referringDoctors.portal.generateShort')}
                </button>
            )}
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                    <Edit3 size={13} />{t('referringDoctors.actions.edit')}
                </button>
            )}
        </div>
    </article>
);

const DoctorMobileCard = ({ doctor, selected, onSelect, onViewDetails, onEdit, onGenerateCredentials, isGeneratingCredentials, t, locale }) => (
    <article className={`p-4 transition-colors ${selected ? 'bg-teal-50/60 dark:bg-teal-950/25' : ''}`}>
        <button type="button" onClick={onSelect} className="w-full text-start">
            <div className="flex items-start justify-between gap-3">
                <DoctorIdentity doctor={doctor} onClick={onViewDetails} t={t} />
                <StatusPill active={doctor.is_active} t={t} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <CompactValue label={t('referringDoctors.profile.appointments')} value={Number(doctor.appointment_count || 0)} />
                <CompactValue label={t('referringDoctors.profile.revenue')} value={formatCurrency(doctor.total_revenue, locale)} />
                <CompactValue label={t('referringDoctors.profile.commission')} value={`${Number(doctor.commission_percentage || 0)}%`} />
            </div>
        </button>
        <div className="mt-3 border-t border-slate-100/80 pt-2.5 dark:border-white/5">
            <DoctorContactDetails doctor={doctor} t={t} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {onViewDetails && (
                <button
                    type="button"
                    onClick={onViewDetails}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-teal-200/80 bg-teal-50/90 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300"
                >
                    <Eye size={14} />{t('referringDoctors.actions.viewDetailsShort', { defaultValue: 'View Details' })}
                </button>
            )}
            {onGenerateCredentials && (
                <button
                    type="button"
                    onClick={onGenerateCredentials}
                    disabled={isGeneratingCredentials}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-200/80 bg-cyan-50/90 text-xs font-bold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                    <KeyRound size={14} />{t('referringDoctors.portal.generateShort', { defaultValue: 'Portal Access' })}
                </button>
            )}
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                >
                    <Edit3 size={14} />{t('referringDoctors.actions.edit')}
                </button>
            )}
        </div>
    </article>
);

const DoctorContactDetails = ({ doctor, t }) => {
    const waUrl = getWhatsAppUrl(doctor.phone);
    return (
        <div className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
                {doctor.phone ? (
                    <a
                        href={`tel:${doctor.phone.replace(/[^+\d]/g, '')}`}
                        onClick={event => event.stopPropagation()}
                        dir="ltr"
                        className="inline-flex min-w-0 items-center gap-1 text-slate-700 hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-300 font-mono font-bold text-xs"
                    >
                        <Phone size={12} className="shrink-0 text-slate-400" />
                        <span className="truncate">{doctor.phone}</span>
                    </a>
                ) : (
                    <span className="text-slate-400">—</span>
                )}
                {waUrl && (
                    <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="WhatsApp"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 shrink-0"
                    >
                        <MessageCircle size={11} />
                    </a>
                )}
            </div>

            {doctor.email ? (
                <a
                    href={`mailto:${doctor.email}`}
                    onClick={event => event.stopPropagation()}
                    dir="ltr"
                    className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300"
                >
                    <Mail size={11} className="shrink-0 text-slate-400" />
                    <span className="truncate">{doctor.email}</span>
                </a>
            ) : null}
        </div>
    );
};

/* Collapsible Doctor Side Profile Drawer (Liaison Console) */
const DoctorProfile = ({ doctor, onClose, onViewDetails, onEdit, onGenerateCredentials, isGeneratingCredentials, t, locale }) => {
    const waUrl = doctor?.phone ? getWhatsAppUrl(doctor.phone) : null;
    return (
        <aside className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-xl shadow-slate-200/20 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/85 dark:shadow-none xl:sticky xl:top-4 xl:self-start">
            {!doctor ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-300 dark:bg-white/5 dark:text-slate-600">
                        <UserSquare2 size={28} />
                    </span>
                    <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">{t('referringDoctors.profile.select')}</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Profile Hero Header */}
                    <div className="relative -mx-5 -mt-5 mb-4 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-inner">
                        <div className="pointer-events-none absolute top-0 end-0 h-36 w-36 bg-teal-500/20 blur-3xl" />
                        <div className="relative flex items-start gap-3.5">
                            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-black text-xl shadow-lg ring-2 ring-white/20 backdrop-blur-md ${getAvatarGradient(doctor.doctor_id || doctor.full_name)}`}>
                                {initials(doctor.full_name)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-1.5">
                                    <div className="min-w-0">
                                        <h2 className="truncate text-base font-black tracking-tight text-white">{doctor.full_name}</h2>
                                        <p className="mt-0.5 truncate text-xs font-medium text-teal-200">
                                            {doctor.specialty || t('referringDoctors.values.general')} · {doctor.clinic_hospital || t('referringDoctors.values.independent')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {onEdit && (
                                            <button
                                                type="button"
                                                onClick={onEdit}
                                                title={t('referringDoctors.actions.edit')}
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition active:scale-95"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                        )}
                                        {onClose && (
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                title={t('actions.close', { ns: 'common', defaultValue: 'إغلاق' })}
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition active:scale-95"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${doctor.is_active ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/30'
                                        }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${doctor.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                                        {doctor.is_active ? t('referringDoctors.status.active') : t('referringDoctors.status.inactive')}
                                    </span>
                                    <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300 ring-1 ring-teal-500/30">
                                        {doctor.referral_source_category || t('referringDoctors.values.doctor')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Communication Actions Strip */}
                    <div className="grid grid-cols-3 gap-2">
                        {doctor.phone ? (
                            <a
                                href={`tel:${doctor.phone.replace(/[^+\d]/g, '')}`}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <Phone size={12} className="text-teal-600 dark:text-teal-400" />
                                <span>{t('referringDoctors.quickActions.call', { defaultValue: 'اتصال' })}</span>
                            </a>
                        ) : (
                            <button disabled className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-slate-50 text-xs font-medium text-slate-400 opacity-50 dark:border-white/5 dark:bg-white/5">
                                <Phone size={12} />
                                <span>{t('referringDoctors.quickActions.call', { defaultValue: 'اتصال' })}</span>
                            </button>
                        )}

                        {waUrl ? (
                            <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-emerald-200/80 bg-emerald-50/90 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                            >
                                <MessageCircle size={12} className="text-emerald-600" />
                                <span>{t('referringDoctors.quickActions.whatsapp', { defaultValue: 'واتساب' })}</span>
                            </a>
                        ) : (
                            <button disabled className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-slate-50 text-xs font-medium text-slate-400 opacity-50 dark:border-white/5 dark:bg-white/5">
                                <MessageCircle size={12} />
                                <span>{t('referringDoctors.quickActions.whatsapp', { defaultValue: 'واتساب' })}</span>
                            </button>
                        )}

                        {doctor.email ? (
                            <a
                                href={`mailto:${doctor.email}`}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200/80 bg-white/90 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <Mail size={12} className="text-cyan-600 dark:text-cyan-400" />
                                <span>{t('referringDoctors.quickActions.email', { defaultValue: 'بريد' })}</span>
                            </a>
                        ) : (
                            <button disabled className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-slate-50 text-xs font-medium text-slate-400 opacity-50 dark:border-white/5 dark:bg-white/5">
                                <Mail size={12} />
                                <span>{t('referringDoctors.quickActions.email', { defaultValue: 'بريد' })}</span>
                            </button>
                        )}
                    </div>

                    {/* View Full Profile CTA */}
                    {onViewDetails && (
                        <button
                            type="button"
                            onClick={onViewDetails}
                            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-4 text-xs font-black text-white shadow-sm shadow-teal-700/20 transition hover:from-teal-800 hover:to-cyan-800"
                        >
                            <ExternalLink size={14} />
                            {t('referringDoctors.actions.viewFullProfile', { defaultValue: 'View Full Profile & Referrals' })}
                        </button>
                    )}

                    {/* Performance Stats Grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <ProfileStat label={t('referringDoctors.profile.appointments')} value={Number(doctor.appointment_count || 0)} />
                        <ProfileStat label={t('referringDoctors.profile.exams')} value={Number(doctor.exam_count || 0)} />
                        <ProfileStat label={t('referringDoctors.profile.revenue')} value={formatCurrency(doctor.total_revenue, locale)} tone="emerald" />
                        <ProfileStat label={t('referringDoctors.profile.commission')} value={formatCurrency(doctor.commission_est, locale)} tone="amber" />
                    </div>

                    {/* Portal Credentials Provisioning */}
                    {onGenerateCredentials && (
                        <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/60 p-3.5 dark:border-cyan-500/20 dark:bg-cyan-500/10">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-black text-cyan-950 dark:text-cyan-100">
                                    <KeyRound size={15} className="text-cyan-700 dark:text-cyan-400" />
                                    <span>{t('referringDoctors.portal.portalLabel', { defaultValue: 'بوابة الطبيب المحول' })}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${doctor.email ? 'bg-cyan-200/80 text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    {doctor.email ? t('referringDoctors.portal.ready', { defaultValue: 'جاهز' }) : t('referringDoctors.portal.noEmail', { defaultValue: 'بدون بريد' })}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-cyan-800 dark:text-cyan-200 leading-relaxed">
                                {t('referringDoctors.portal.boxHint', { defaultValue: 'تتيح البوابة للطبيب استعراض تقارير مرضاه، تحميل الصور، ومتابعة حالات الإحالة لحظياً.' })}
                            </p>
                            <button
                                type="button"
                                onClick={onGenerateCredentials}
                                disabled={isGeneratingCredentials || !doctor.email}
                                className="mt-2.5 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-700 px-3 text-xs font-black text-white shadow-sm transition hover:bg-cyan-800 disabled:opacity-50"
                            >
                                <KeyRound size={13} />
                                {isGeneratingCredentials ? t('referringDoctors.portal.generating', { defaultValue: 'Generating credentials...' }) : t('referringDoctors.portal.generate', { defaultValue: 'Generate Doctor Portal Credentials' })}
                            </button>
                        </div>
                    )}

                    {/* Contact & Administrative Details */}
                    <div className="border-t border-slate-100/80 pt-4 dark:border-white/5">
                        <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.profile.contactLegal')}</h3>
                        <div className="mt-2.5 space-y-2.5">
                            <DetailRow icon={Phone} label={t('referringDoctors.form.phone')} value={doctor.phone || '—'} />
                            <DetailRow icon={Mail} label={t('referringDoctors.form.email')} value={doctor.email || '—'} />
                            <DetailRow icon={FileText} label={t('referringDoctors.form.taxId')} value={doctor.tax_id || '—'} />
                            <DetailRow icon={ShieldCheck} label={t('referringDoctors.form.contractId')} value={doctor.contract_id || '—'} />
                            <DetailRow icon={Zap} label={t('referringDoctors.form.preferredContact')} value={t(`referringDoctors.contactMethods.${doctor.preferred_contact_method || 'Email'}`)} />
                        </div>
                    </div>

                    {doctor.notes && (
                        <div className="border-t border-slate-100/80 pt-4 dark:border-white/5">
                            <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.form.notes')}</h3>
                            <p className="mt-2 rounded-2xl border-s-4 border-teal-500 bg-slate-50/90 p-3 text-xs leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-300">
                                {doctor.notes}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
};

/* Create / Edit Modal */
const DoctorModal = ({ visible, mode, title, form, setForm, onSave, onCancel, isSaving, canSetActive, canGenerateCredentials, onGenerateCredentials, isGeneratingCredentials, t }) => {
    const isCreate = mode === 'create';
    const canGenerateAfterSave = canGenerateCredentials && isCreate;
    const update = (field) => (value) => setForm(current => ({ ...current, [field]: value }));

    return (
        <Modal isOpen={visible} onClose={onCancel} title={title} width="max-w-3xl">
            <form onSubmit={event => { event.preventDefault(); onSave(); }} className="space-y-5">
                <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50/90 to-cyan-50/90 p-4 dark:border-teal-500/20 dark:from-teal-950/40 dark:to-cyan-950/40">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-300">
                            <Stethoscope size={20} />
                        </span>
                        <div>
                            <p className="text-xs font-black text-teal-950 dark:text-teal-100">{isCreate ? t('referringDoctors.form.createTitle') : t('referringDoctors.form.editTitle')}</p>
                            <p className="mt-0.5 text-xs font-semibold leading-5 text-teal-800 dark:text-teal-200">
                                {t('referringDoctors.form.modalHint', { defaultValue: 'حافظ على دقة بيانات الإحالة والاتصال لتسهيل التنسيق مع العيادة ومتابعة العمولات وبوابة الطبيب.' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Live Preview Card */}
                {form.fullName.trim() && (
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.02]">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">{t('referringDoctors.form.preview', { defaultValue: 'معاينة بطاقة الطبيب' })}</p>
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-cyan-700 font-black text-white text-xs shadow-sm">
                                {initials(form.fullName)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-black text-slate-900 text-xs dark:text-white">{form.fullName}</p>
                                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {form.specialty || t('referringDoctors.values.general')} · {form.clinicHospital || t('referringDoctors.values.independent')}
                                </p>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                {t('referringDoctors.status.active')}
                            </span>
                        </div>
                    </div>
                )}

                {/* Section 1: Basic Clinical Identity */}
                <div className="space-y-3.5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Users size={14} className="text-teal-600" />
                        {t('referringDoctors.form.basic')}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('referringDoctors.form.fullName')} value={form.fullName} onChange={update('fullName')} required autoFocus placeholder={t('referringDoctors.form.namePlaceholder', { defaultValue: 'د. الاسم الكامل' })} />
                        <Field label={t('referringDoctors.form.specialty')} value={form.specialty} onChange={update('specialty')} placeholder={t('referringDoctors.form.specialtyPlaceholder', { defaultValue: 'عظام، باطنة، أورام...' })} />
                        <Field label={t('referringDoctors.form.clinic')} value={form.clinicHospital} onChange={update('clinicHospital')} placeholder={t('referringDoctors.form.clinicPlaceholder', { defaultValue: 'اسم العيادة أو المستشفى' })} />
                        <label>
                            <FieldLabel>{t('referringDoctors.form.preferredContact')}</FieldLabel>
                            <select value={form.preferredContactMethod} onChange={event => update('preferredContactMethod')(event.target.value)} className={inputClass}>
                                {['Phone', 'Email', 'SMS', 'WhatsApp'].map(method => <option key={method} value={method}>{t(`referringDoctors.contactMethods.${method}`)}</option>)}
                            </select>
                        </label>
                    </div>
                </div>

                {/* Section 2: Contact Details */}
                <div className="space-y-3.5 border-t border-slate-100 pt-4 dark:border-white/5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Phone size={14} className="text-cyan-600" />
                        {t('referringDoctors.form.contact')}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('referringDoctors.form.phone')} type="tel" value={form.phone} onChange={update('phone')} dir="ltr" placeholder="+20 1..." />
                        <Field label={t('referringDoctors.form.email')} type="email" value={form.email} onChange={update('email')} dir="ltr" required={Boolean(form.generatePortalCredentials)} helper={canGenerateAfterSave ? t('referringDoctors.portal.emailHint', { defaultValue: 'Required for doctor portal login.' }) : undefined} placeholder="doctor@example.com" />
                    </div>
                </div>

                {/* Portal Access Checkbox */}
                {canGenerateAfterSave && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-200/80 bg-cyan-50/80 p-3.5 text-xs text-cyan-950 transition hover:bg-cyan-100/80 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
                        <input
                            type="checkbox"
                            checked={Boolean(form.generatePortalCredentials)}
                            onChange={event => update('generatePortalCredentials')(event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-cyan-300 text-cyan-700 focus:ring-cyan-500"
                        />
                        <span>
                            <span className="flex items-center gap-1.5 font-black"><KeyRound size={14} />{t('referringDoctors.portal.generateAfterSave', { defaultValue: 'Generate portal credentials after saving' })}</span>
                            <span className="mt-1 block text-xs font-semibold leading-5 text-cyan-800 dark:text-cyan-300">
                                {t('referringDoctors.portal.generateAfterSaveHint', { defaultValue: 'After creation, VIARA opens the same credential handoff dialog used for patient portal passwords.' })}
                            </span>
                        </span>
                    </label>
                )}

                {!isCreate && onGenerateCredentials && (
                    <button
                        type="button"
                        onClick={onGenerateCredentials}
                        disabled={isGeneratingCredentials}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/80 bg-cyan-50/80 px-4 text-xs font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                    >
                        <KeyRound size={14} />
                        {isGeneratingCredentials ? t('referringDoctors.portal.generating', { defaultValue: 'Generating credentials...' }) : t('referringDoctors.portal.generate', { defaultValue: 'Generate doctor portal credentials' })}
                    </button>
                )}

                {/* Accordion for Business & Commission Terms */}
                <details className="group rounded-2xl border border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-2">
                            <BadgePercent size={14} className="text-amber-600" />
                            {t('referringDoctors.form.moreDetails', { defaultValue: 'Business details and notes' })}
                        </span>
                        <ChevronDown size={15} className="text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-3.5 border-t border-slate-200/80 p-4 dark:border-white/5 sm:grid-cols-2">
                        <Field label={t('referringDoctors.form.commission')} type="number" min="0" max="100" value={form.commissionPercentage} onChange={update('commissionPercentage')} />
                        <Field label={t('referringDoctors.form.source')} value={form.referralSourceCategory} onChange={update('referralSourceCategory')} />
                        <Field label={t('referringDoctors.form.contractId')} value={form.contractId} onChange={update('contractId')} />
                        <Field label={t('referringDoctors.form.taxId')} value={form.taxId} onChange={update('taxId')} />
                        <Field label={t('referringDoctors.form.address')} value={form.address} onChange={update('address')} className="sm:col-span-2" />
                        {canSetActive && (
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 sm:col-span-2">
                                <input type="checkbox" checked={Boolean(form.isActive)} onChange={event => update('isActive')(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                {t('referringDoctors.form.active')}
                            </label>
                        )}
                        <label className="sm:col-span-2">
                            <FieldLabel>{t('referringDoctors.form.notes')}</FieldLabel>
                            <textarea value={form.notes} onChange={event => update('notes')(event.target.value)} rows={3} className={`${inputClass} h-auto py-2.5 resize-y text-xs`} placeholder={t('referringDoctors.form.notesPlaceholder')} />
                        </label>
                    </div>
                </details>

                <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100/80 pt-4 dark:border-white/5 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onCancel} className={secondaryBtn}>{t('referringDoctors.actions.cancel')}</button>
                    <button
                        type="submit"
                        disabled={isSaving || !form.fullName.trim()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-700 to-cyan-700 px-6 text-xs font-black text-white shadow-sm shadow-teal-700/20 transition hover:from-teal-800 hover:to-cyan-800 disabled:opacity-50"
                    >
                        {isSaving ? t('referringDoctors.actions.saving') : isCreate && form.generatePortalCredentials ? t('referringDoctors.portal.saveAndGenerate', { defaultValue: 'Save and generate' }) : t('referringDoctors.actions.save')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

/* Micro Components */
const FieldLabel = ({ children, required }) => <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}{required && <span className="text-rose-600">*</span>}</span>;
const Field = ({ label, value, onChange, type = 'text', required = false, helper, className = '', ...props }) => <label className={`block ${className}`}><FieldLabel required={required}>{label}</FieldLabel><input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} className={inputClass} required={required} {...props} />{helper && <span className="mt-1 block text-[10px] font-semibold text-slate-500">{helper}</span>}</label>;
const ProfileStat = ({ label, value, tone }) => (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-2.5 dark:border-white/5 dark:bg-white/[0.02]">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className={`mt-0.5 truncate font-mono text-xs font-black ${tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`} dir="ltr">{value}</p>
    </div>
);
const CompactValue = ({ label, value }) => (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2 text-start dark:border-white/5 dark:bg-white/[0.02]">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-900 dark:text-white" dir="ltr">{value}</p>
    </div>
);
const DetailRow = ({ icon: Icon, label, value }) => (
    <div className="flex min-w-0 items-center gap-2.5 text-xs font-semibold">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
            {Icon ? <Icon size={13} /> : '—'}
        </span>
        <div className="min-w-0 flex-1">
            {label && <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>}
            <p className="truncate font-bold text-slate-800 dark:text-slate-200 text-xs">{value}</p>
        </div>
    </div>
);
const StatusPill = ({ active, t }) => (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400'}`} />
        {active ? t('referringDoctors.status.active') : t('referringDoctors.status.inactive')}
    </span>
);
const IconButton = ({ label, icon: Icon, onClick, danger = false, disabled = false, tone }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition hover:scale-105 active:scale-95 disabled:opacity-50 ${danger
            ? 'text-slate-400 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300'
            : tone === 'teal'
                ? 'text-slate-400 hover:bg-teal-100 hover:text-teal-800 dark:hover:bg-teal-950/40 dark:hover:text-teal-300'
                : tone === 'cyan'
                    ? 'text-slate-400 hover:bg-cyan-100 hover:text-cyan-800 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-300'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
    >
        <Icon size={14} />
    </button>
);

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
const toDoctorForm = doctor => ({ fullName: doctor.full_name || '', specialty: doctor.specialty || '', clinicHospital: doctor.clinic_hospital || '', phone: doctor.phone || '', email: doctor.email || '', address: doctor.address || '', taxId: doctor.tax_id || '', contractId: doctor.contract_id || '', referralSourceCategory: doctor.referral_source_category || 'Doctor', commissionPercentage: doctor.commission_percentage || 0, preferredContactMethod: doctor.preferred_contact_method || 'Email', notes: doctor.notes || '', isActive: Boolean(doctor.is_active) });
const cleanDoctorPayload = form => ({ fullName: form.fullName.trim(), specialty: form.specialty.trim() || undefined, clinicHospital: form.clinicHospital.trim() || undefined, phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, address: form.address.trim() || undefined, taxId: form.taxId.trim() || undefined, contractId: form.contractId.trim() || undefined, referralSourceCategory: form.referralSourceCategory.trim() || undefined, commissionPercentage: Number(form.commissionPercentage || 0), preferredContactMethod: form.preferredContactMethod || undefined, notes: form.notes.trim() || undefined, ...(form.isActive !== undefined ? { isActive: Boolean(form.isActive) } : {}) });
const formatCurrency = (value, locale) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number(value || 0));
const csvEscape = value => {
    const text = String(value ?? '');
    const spreadsheetSafeText = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
    return `"${spreadsheetSafeText.replace(/"/g, '""')}"`;
};
const parseCsvLine = line => { const values = []; let current = ''; let inQuotes = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; } else if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { values.push(current); current = ''; } else current += char; } values.push(current); return values.map(value => value.trim()); };
const downloadFile = (filename, content) => { const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };

export default ReferringDoctors;
