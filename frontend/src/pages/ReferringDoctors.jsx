import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    BadgePercent,
    Briefcase,
    CalendarCheck2,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CircleDollarSign,
    Download,
    Edit3,
    ExternalLink,
    Eye,
    FileUp,
    FilterX,
    KeyRound,
    LayoutGrid,
    ListFilter,
    Mail,
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
    generatePortalCredentials: false
};

const ReferringDoctors = () => {
    const { t, i18n } = useTranslation('admin');
    const navigate = useNavigate();
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
    const currentUser = useSelector(selectCurrentUser);
    const isAdmin = hasDeveloperOrAdminRole(currentUser?.role);
    const canCreate = hasDeveloperOrAdminRole(currentUser?.role) || currentUser?.role === 'Receptionist';
    const fileInputRef = useRef(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [activeOnly, setActiveOnly] = useState(true);
    const [specialtyFilter, setSpecialtyFilter] = useState('all');
    const [selectedId, setSelectedId] = useState(null);
    const [modalMode, setModalMode] = useState(null);
    const [form, setForm] = useState(emptyDoctorForm);
    const [deactivateTarget, setDeactivateTarget] = useState(null);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

    const { data: doctors = [], isLoading, isError, refetch } = useGetReferringDoctorsQuery({
        search: searchTerm || undefined,
        active: activeOnly ? 'true' : undefined,
        limit: 500
    });
    const [createDoctor, { isLoading: isCreating }] = useCreateReferringDoctorMutation();
    const [updateDoctor, { isLoading: isUpdating }] = useUpdateReferringDoctorMutation();
    const [deleteDoctor, { isLoading: isDeleting }] = useDeleteReferringDoctorMutation();
    const [setDoctorPortalPassword, { isLoading: isGeneratingCredentials }] = useSetDoctorPortalPasswordMutation();

    const specialties = useMemo(() => Array.from(new Set(doctors.map(doctor => doctor.specialty).filter(Boolean))).sort(), [doctors]);
    const visibleDoctors = useMemo(() => specialtyFilter === 'all' ? doctors : doctors.filter(doctor => doctor.specialty === specialtyFilter), [doctors, specialtyFilter]);
    const selectedDoctor = visibleDoctors.find(doctor => doctor.doctor_id === selectedId) || visibleDoctors[0] || null;

    const summary = useMemo(() => ({
        total: visibleDoctors.length,
        active: visibleDoctors.filter(doctor => doctor.is_active).length,
        appointments: visibleDoctors.reduce((sum, doctor) => sum + Number(doctor.appointment_count || 0), 0),
        revenue: visibleDoctors.reduce((sum, doctor) => sum + Number(doctor.total_revenue || 0), 0),
        commissions: visibleDoctors.reduce((sum, doctor) => sum + Number(doctor.commission_est || 0), 0)
    }), [visibleDoctors]);

    const hasFilters = Boolean(searchTerm || !activeOnly || specialtyFilter !== 'all');

    const clearFilters = () => {
        setSearchTerm('');
        setActiveOnly(true);
        setSpecialtyFilter('all');
    };

    const openCreate = () => {
        setForm({ ...emptyDoctorForm, generatePortalCredentials: isAdmin });
        setModalMode('create');
    };

    const openEdit = (doctor) => {
        setSelectedId(doctor.doctor_id);
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
        const lines = visibleDoctors.map(doctor => [doctor.full_name, doctor.specialty, doctor.clinic_hospital, doctor.phone, doctor.email, doctor.commission_percentage, doctor.referral_source_category].map(csvEscape).join(','));
        downloadFile(`referring-doctors-${new Date().toISOString().slice(0, 10)}.csv`, [headers.join(','), ...lines].join('\n'));
        toast.success(t('referringDoctors.messages.exported', { count: visibleDoctors.length }));
    };

    const importCsv = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
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
        <div className="space-y-6 pb-12">
            {/* Modernized Executive Page Header */}
            <PageHeader
                icon={Stethoscope}
                eyebrow={t('referringDoctors.eyebrow')}
                eyebrowIcon={Activity}
                title={t('referringDoctors.title')}
                description={t('referringDoctors.description')}
                className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-teal-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-teal-950/20 dark:shadow-none"
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/90 px-3 py-1 text-xs font-bold text-teal-800 shadow-sm dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                            <ShieldCheck size={13} className="text-teal-600 dark:text-teal-400" />
                            Network Governed
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                            <BadgePercent size={13} className="text-cyan-600 dark:text-cyan-400" />
                            Commission Tracking
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Zap size={13} className="text-emerald-600 dark:text-emerald-400" />
                            Portal Sync
                        </span>
                    </div>
                }
                actions={
                    <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                        <button
                            type="button"
                            onClick={exportCsv}
                            disabled={visibleDoctors.length === 0}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:bg-slate-100 hover:text-teal-700 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                        >
                            <Download size={14} /> {t('referringDoctors.actions.export')}
                        </button>
                        {canCreate && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:bg-slate-100 hover:text-teal-700 dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                            >
                                <FileUp size={14} /> {t('referringDoctors.actions.import')}
                            </button>
                        )}
                        {canCreate && (
                            <button
                                type="button"
                                onClick={openCreate}
                                className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-xs font-black text-white shadow-md transition-all hover:bg-teal-800 dark:bg-white dark:text-slate-900 dark:hover:bg-teal-100 sm:col-span-1"
                            >
                                <Plus size={15} /> {t('referringDoctors.actions.add')}
                            </button>
                        )}
                        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="sr-only" aria-label={t('referringDoctors.actions.import')} />
                    </div>
                }
            />

            {/* Executive Network KPI Command Signals */}
            <section className="grid grid-cols-2 gap-4 md:grid-cols-5" aria-label={t('referringDoctors.metrics.label')}>
                <NetworkMetric icon={Users} label={t('referringDoctors.metrics.network')} value={summary.total} detail={t('referringDoctors.metrics.networkDetail')} tone="cyan" />
                <NetworkMetric icon={UserCheck} label={t('referringDoctors.metrics.active')} value={summary.active} detail={t('referringDoctors.metrics.activeDetail')} tone="emerald" />
                <NetworkMetric icon={CalendarCheck2} label={t('referringDoctors.metrics.appointments')} value={summary.appointments} detail={t('referringDoctors.metrics.appointmentsDetail')} tone="indigo" />
                <NetworkMetric icon={TrendingUp} label={t('referringDoctors.metrics.revenue')} value={formatCurrency(summary.revenue, locale)} detail={t('referringDoctors.metrics.revenueDetail')} tone="emerald" />
                <NetworkMetric icon={CircleDollarSign} label={t('referringDoctors.metrics.commissions')} value={formatCurrency(summary.commissions, locale)} detail={t('referringDoctors.metrics.commissionsDetail')} tone="amber" className="col-span-2 md:col-span-1" />
            </section>

            {/* Sticky Glassmorphic Search & Filter Toolbar */}
            <section className="sticky top-4 z-20 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100/80 px-5 py-4 dark:border-white/5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                            <Users size={18} />
                        </span>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                                {t('referringDoctors.directory.title')}
                            </h2>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {t('referringDoctors.directory.description')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* View Mode Switcher */}
                        <div className="inline-flex rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-slate-900">
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-all ${viewMode === 'table'
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                title="Table View"
                            >
                                <ListFilter size={14} />
                                <span className="hidden sm:inline">Table</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-all ${viewMode === 'grid'
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                    }`}
                                title="Cards View"
                            >
                                <LayoutGrid size={14} />
                                <span className="hidden sm:inline">Cards</span>
                            </button>
                        </div>

                        <span className="rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                            {t('referringDoctors.filters.results', { count: visibleDoctors.length })}
                        </span>

                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200/80 bg-rose-50/80 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
                            >
                                <FilterX size={14} />
                                {t('referringDoctors.filters.reset')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-4 p-4 sm:p-5">
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                placeholder={t('referringDoctors.filters.search')}
                                className="h-10 w-full rounded-2xl border border-slate-200/80 bg-white/80 ps-10 pe-3 text-xs font-bold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:border-teal-500 dark:focus:ring-teal-500/20"
                            />
                        </div>

                        <select
                            value={specialtyFilter}
                            onChange={event => setSpecialtyFilter(event.target.value)}
                            aria-label={t('doctors.filters.specialty')}
                            className="h-10 rounded-2xl border border-slate-200/80 bg-white/80 px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-teal-500 dark:focus:ring-teal-500/20 min-w-[160px]"
                        >
                            <option value="all">{t('referringDoctors.filters.allSpecialties')}</option>
                            {specialties.map(specialty => <option key={specialty} value={specialty}>{specialty}</option>)}
                        </select>

                        <div className="flex rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-slate-900">
                            <FilterToggle active={activeOnly} onClick={() => setActiveOnly(true)}>{t('referringDoctors.filters.active')}</FilterToggle>
                            <FilterToggle active={!activeOnly} onClick={() => setActiveOnly(false)}>{t('referringDoctors.filters.all')}</FilterToggle>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Section: Directory View + Side Profile Drawer */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                {/* Directory Content Container */}
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    {isLoading ? (
                        <div className="space-y-3 p-5">{[1, 2, 3, 4].map(item => <Skeleton key={item} height="88px" className="rounded-2xl" />)}</div>
                    ) : isError ? (
                        <EmptyState icon={RefreshCw} title={t('referringDoctors.states.errorTitle')} description={t('referringDoctors.states.errorDescription')} actionLabel={t('referringDoctors.actions.retry')} onAction={refetch} />
                    ) : visibleDoctors.length === 0 ? (
                        <EmptyState icon={UserSquare2} title={t('referringDoctors.states.emptyTitle')} description={hasFilters ? t('referringDoctors.states.filteredEmpty') : t('referringDoctors.states.emptyDescription')} actionLabel={hasFilters ? t('referringDoctors.filters.reset') : canCreate ? t('referringDoctors.actions.add') : undefined} onAction={hasFilters ? clearFilters : canCreate ? openCreate : undefined} />
                    ) : viewMode === 'grid' ? (
                        /* Cards Grid View Mode */
                        <div className="grid gap-4 p-5 sm:grid-cols-2">
                            {visibleDoctors.map(doctor => (
                                <DoctorGridCard
                                    key={doctor.doctor_id}
                                    doctor={doctor}
                                    selected={selectedDoctor?.doctor_id === doctor.doctor_id}
                                    onSelect={() => setSelectedId(doctor.doctor_id)}
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
                        /* Table View Mode */
                        <>
                            <div className="divide-y divide-slate-100/80 dark:divide-white/5 lg:hidden">
                                {visibleDoctors.map(doctor => (
                                    <DoctorMobileCard
                                        key={doctor.doctor_id}
                                        doctor={doctor}
                                        selected={selectedDoctor?.doctor_id === doctor.doctor_id}
                                        onSelect={() => setSelectedId(doctor.doctor_id)}
                                        onViewDetails={() => navigate(`/referring-doctors/${doctor.doctor_id}`)}
                                        onEdit={isAdmin ? () => openEdit(doctor) : undefined}
                                        onGenerateCredentials={isAdmin ? () => generateDoctorCredentials(doctor) : undefined}
                                        isGeneratingCredentials={isGeneratingCredentials}
                                        t={t}
                                        locale={locale}
                                    />
                                ))}
                            </div>

                            <div className="hidden overflow-x-auto lg:block">
                                <table className="w-full min-w-[920px] text-start text-sm border-collapse">
                                    <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/90 backdrop-blur-md dark:border-white/5 dark:bg-slate-900/90 dark:text-slate-400">
                                        <tr>
                                            <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.doctor')}</th>
                                            <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.contact')}</th>
                                            <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.performance')}</th>
                                            <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.commission')}</th>
                                            <th className="px-5 py-4 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.table.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                        {visibleDoctors.map((doctor, index) => (
                                            <DoctorTableRow
                                                key={doctor.doctor_id}
                                                doctor={doctor}
                                                isZebra={index % 2 !== 0}
                                                selected={selectedDoctor?.doctor_id === doctor.doctor_id}
                                                onSelect={() => setSelectedId(doctor.doctor_id)}
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

                {/* Side Profile Drawer */}
                <DoctorProfile
                    doctor={selectedDoctor}
                    onViewDetails={selectedDoctor ? () => navigate(`/referring-doctors/${selectedDoctor.doctor_id}`) : undefined}
                    onEdit={selectedDoctor && isAdmin ? () => openEdit(selectedDoctor) : undefined}
                    onGenerateCredentials={selectedDoctor && isAdmin ? () => generateDoctorCredentials(selectedDoctor) : undefined}
                    isGeneratingCredentials={isGeneratingCredentials}
                    t={t}
                    locale={locale}
                />
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

/* Executive KPI Card Component */
const NetworkMetric = ({ icon: Icon, label, value, detail, tone = 'cyan', className = '' }) => {
    const tones = {
        cyan: 'border-cyan-200/80 bg-cyan-50/60 text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300',
        emerald: 'border-emerald-200/80 bg-emerald-50/60 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
        indigo: 'border-indigo-200/80 bg-indigo-50/60 text-indigo-900 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300',
        amber: 'border-amber-200/80 bg-amber-50/60 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
    };
    const iconStyles = {
        cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300',
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
        indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    };

    return (
        <div className={`group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none ${className}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${iconStyles[tone]}`}>
                    <Icon size={18} />
                </span>
            </div>
            <p className="mt-3 truncate text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">{value}</p>
            <p className="mt-1.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
    );
};

const FilterToggle = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`min-h-8 flex-1 rounded-xl px-3.5 text-xs font-bold transition-all ${active
            ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-800 dark:text-teal-300'
            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
    >
        {children}
    </button>
);

/* Table Row Component */
const DoctorTableRow = ({ doctor, selected, isZebra, onSelect, onViewDetails, onEdit, onGenerateCredentials, onDeactivate, isAdmin, isDeleting, isGeneratingCredentials, t, locale }) => {
    const stripColor = doctor.is_active ? 'border-emerald-500' : 'border-slate-300';
    return (
        <tr
            tabIndex={0}
            aria-selected={selected}
            className={`group cursor-pointer transition-colors focus-visible:outline-none ${selected
                ? 'bg-teal-50/70 dark:bg-teal-950/30'
                : isZebra
                    ? 'bg-slate-50/40 dark:bg-white/[0.01] hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
                    : 'bg-white dark:bg-transparent hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
                }`}
            onClick={onSelect}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}
        >
            <td className={`px-5 py-4 border-s-[3px] ${stripColor}`}>
                <DoctorIdentity doctor={doctor} onClick={onViewDetails} t={t} />
            </td>
            <td className="px-5 py-4">
                <div className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <p className="flex items-center gap-2"><Phone size={13} className="text-slate-400" />{doctor.phone || '—'}</p>
                    <p className="flex items-center gap-2"><Mail size={13} className="text-slate-400" />{doctor.email || '—'}</p>
                </div>
            </td>
            <td className="px-5 py-4">
                <p className="font-bold text-slate-900 dark:text-white">{t('referringDoctors.values.appointments', { count: Number(doctor.appointment_count || 0) })}</p>
                <p className="mt-0.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(doctor.total_revenue, locale)}</p>
            </td>
            <td className="px-5 py-4">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    {Number(doctor.commission_percentage || 0)}%
                </span>
                <p className="mt-1 text-xs font-mono font-semibold text-slate-500 dark:text-slate-400">{formatCurrency(doctor.commission_est, locale)}</p>
            </td>
            <td className="px-5 py-4">
                <div className="flex justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100" onClick={event => event.stopPropagation()}>
                    <IconButton label={t('referringDoctors.actions.viewDetails', { defaultValue: 'View Details & Referrals' })} icon={Eye} onClick={onViewDetails} tone="teal" />
                    {isAdmin && <IconButton label={t('referringDoctors.portal.generate', { defaultValue: 'Generate portal credentials' })} icon={KeyRound} onClick={onGenerateCredentials} disabled={isGeneratingCredentials} />}
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
        className={`flex min-w-0 items-center gap-3.5 ${onClick ? 'cursor-pointer group' : ''}`}
    >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 font-black text-white shadow-md shadow-teal-500/20 transition-transform duration-300 group-hover:scale-105">
            {initials(doctor.full_name)}
        </span>
        <div className="min-w-0">
            <p className="truncate font-black text-slate-900 transition-colors group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400 text-sm">
                {doctor.full_name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                <Briefcase size={12} className="text-slate-400" />
                {doctor.specialty || t('referringDoctors.values.general')}
                <span aria-hidden="true">·</span>
                {doctor.clinic_hospital || t('referringDoctors.values.independent')}
            </p>
        </div>
    </div>
);

/* Grid View Doctor Card */
const DoctorGridCard = ({ doctor, selected, onSelect, onViewDetails, onEdit, onGenerateCredentials, isGeneratingCredentials, t, locale }) => (
    <article
        onClick={onSelect}
        className={`group cursor-pointer overflow-hidden rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${selected
            ? 'border-teal-400 bg-teal-50/60 ring-2 ring-teal-500/20 dark:border-teal-500/80 dark:bg-teal-950/30'
            : 'border-slate-200/80 bg-white/80 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-white/20'
            }`}
    >
        <div className="flex items-start justify-between gap-3">
            <DoctorIdentity doctor={doctor} onClick={onViewDetails} t={t} />
            <StatusPill active={doctor.is_active} t={t} />
        </div>

        <div className="mt-4 space-y-1.5 border-t border-b border-slate-100/80 py-3 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400">
            <p className="flex items-center gap-2"><Phone size={13} className="text-slate-400" />{doctor.phone || '—'}</p>
            <p className="flex items-center gap-2"><Mail size={13} className="text-slate-400" />{doctor.email || '—'}</p>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-start">
            <CompactValue label={t('referringDoctors.profile.appointments')} value={Number(doctor.appointment_count || 0)} />
            <CompactValue label={t('referringDoctors.profile.revenue')} value={formatCurrency(doctor.total_revenue, locale)} />
            <CompactValue label={t('referringDoctors.profile.commission')} value={`${Number(doctor.commission_percentage || 0)}%`} />
        </dl>

        <div className="mt-4 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
            {onViewDetails && (
                <button
                    type="button"
                    onClick={onViewDetails}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-200/80 bg-teal-50/80 px-3 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300"
                >
                    <Eye size={14} /> View
                </button>
            )}
            {onGenerateCredentials && (
                <button
                    type="button"
                    onClick={onGenerateCredentials}
                    disabled={isGeneratingCredentials}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-200/80 bg-cyan-50/80 px-3 py-1.5 text-xs font-bold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                    <KeyRound size={14} /> Portal
                </button>
            )}
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                    <Edit3 size={14} /> Edit
                </button>
            )}
        </div>
    </article>
);

const DoctorMobileCard = ({ doctor, selected, onSelect, onViewDetails, onEdit, onGenerateCredentials, isGeneratingCredentials, t, locale }) => (
    <article className={`p-5 transition-colors ${selected ? 'bg-teal-50/50 dark:bg-teal-950/20' : ''}`}>
        <button type="button" onClick={onSelect} className="w-full text-start">
            <div className="flex items-start justify-between gap-3">
                <DoctorIdentity doctor={doctor} onClick={onViewDetails} t={t} />
                <StatusPill active={doctor.is_active} t={t} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
                <CompactValue label={t('referringDoctors.profile.appointments')} value={Number(doctor.appointment_count || 0)} />
                <CompactValue label={t('referringDoctors.profile.revenue')} value={formatCurrency(doctor.total_revenue, locale)} />
                <CompactValue label={t('referringDoctors.profile.commission')} value={`${Number(doctor.commission_percentage || 0)}%`} />
            </div>
        </button>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {onViewDetails && (
                <button
                    type="button"
                    onClick={onViewDetails}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-teal-200/80 bg-teal-50/90 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300"
                >
                    <Eye size={15} />{t('referringDoctors.actions.viewDetailsShort', { defaultValue: 'View Details' })}
                </button>
            )}
            {onGenerateCredentials && (
                <button
                    type="button"
                    onClick={onGenerateCredentials}
                    disabled={isGeneratingCredentials}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-200/80 bg-cyan-50/90 text-xs font-bold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                    <KeyRound size={15} />{t('referringDoctors.portal.generateShort', { defaultValue: 'Portal Access' })}
                </button>
            )}
            {onEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                >
                    <Edit3 size={15} />{t('referringDoctors.actions.edit')}
                </button>
            )}
        </div>
    </article>
);

/* Doctor Side Profile Drawer */
const DoctorProfile = ({ doctor, onViewDetails, onEdit, onGenerateCredentials, isGeneratingCredentials, t, locale }) => (
    <aside className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none xl:sticky xl:top-4 xl:self-start sm:p-6">
        {!doctor ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-300 dark:bg-white/5 dark:text-slate-600">
                    <UserSquare2 size={32} />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-500 dark:text-slate-400">{t('referringDoctors.profile.select')}</p>
            </div>
        ) : (
            <div className="space-y-6">
                {/* Profile Hero Header */}
                <div className="relative -mx-5 -mt-5 mb-5 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-inner sm:-mx-6 sm:-mt-6">
                    <div className="pointer-events-none absolute top-0 end-0 h-32 w-32 bg-teal-500/20 blur-2xl" />
                    <div className="relative flex items-start gap-4">
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-white/10 font-black text-white text-2xl shadow-lg ring-1 ring-white/20 backdrop-blur-md">
                            {initials(doctor.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h2 className="truncate text-lg font-black tracking-tight text-white">{doctor.full_name}</h2>
                                    <p className="mt-0.5 truncate text-xs font-medium text-teal-200">
                                        {doctor.specialty || t('referringDoctors.values.general')} · {doctor.clinic_hospital || t('referringDoctors.values.independent')}
                                    </p>
                                </div>
                                {onEdit && (
                                    <button
                                        type="button"
                                        onClick={onEdit}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition active:scale-95"
                                    >
                                        <Edit3 size={15} />
                                    </button>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${doctor.is_active ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/30'
                                    }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${doctor.is_active ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                                    {doctor.is_active ? t('referringDoctors.status.active') : t('referringDoctors.status.inactive')}
                                </span>
                                <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300 ring-1 ring-teal-500/30">
                                    {doctor.referral_source_category || t('referringDoctors.values.doctor')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {onViewDetails && (
                    <button
                        type="button"
                        onClick={onViewDetails}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-black text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800"
                    >
                        <ExternalLink size={15} />
                        {t('referringDoctors.actions.viewFullProfile', { defaultValue: 'View Full Profile & Referrals' })}
                    </button>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <ProfileStat label={t('referringDoctors.profile.appointments')} value={Number(doctor.appointment_count || 0)} />
                    <ProfileStat label={t('referringDoctors.profile.exams')} value={Number(doctor.exam_count || 0)} />
                    <ProfileStat label={t('referringDoctors.profile.revenue')} value={formatCurrency(doctor.total_revenue, locale)} />
                    <ProfileStat label={t('referringDoctors.profile.commission')} value={formatCurrency(doctor.commission_est, locale)} />
                </div>

                {/* Portal Credentials Action */}
                {onGenerateCredentials && (
                    <button
                        type="button"
                        onClick={onGenerateCredentials}
                        disabled={isGeneratingCredentials}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-200/80 bg-cyan-50/80 px-4 text-xs font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300"
                    >
                        <KeyRound size={15} />
                        {isGeneratingCredentials ? t('referringDoctors.portal.generating', { defaultValue: 'Generating credentials...' }) : t('referringDoctors.portal.generate', { defaultValue: 'Generate Doctor Portal Credentials' })}
                    </button>
                )}

                {/* Contact & Legal Details */}
                <div className="border-t border-slate-100/80 pt-5 dark:border-white/5">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.profile.contactLegal')}</h3>
                    <div className="mt-3.5 space-y-3">
                        <DetailRow icon={Phone} value={doctor.phone || '—'} />
                        <DetailRow icon={Mail} value={doctor.email || '—'} />
                        <DetailRow label={t('referringDoctors.form.taxId')} value={doctor.tax_id || '—'} />
                        <DetailRow label={t('referringDoctors.form.contractId')} value={doctor.contract_id || '—'} />
                        <DetailRow label={t('referringDoctors.form.preferredContact')} value={t(`referringDoctors.contactMethods.${doctor.preferred_contact_method || 'Email'}`)} />
                    </div>
                </div>

                {doctor.notes && (
                    <div className="border-t border-slate-100/80 pt-5 dark:border-white/5">
                        <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('referringDoctors.form.notes')}</h3>
                        <p className="mt-2.5 rounded-2xl bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-600 dark:bg-white/5 dark:text-slate-300">
                            {doctor.notes}
                        </p>
                    </div>
                )}
            </div>
        )}
    </aside>
);

/* Create / Edit Modal */
const DoctorModal = ({ visible, mode, title, form, setForm, onSave, onCancel, isSaving, canSetActive, canGenerateCredentials, onGenerateCredentials, isGeneratingCredentials, t }) => {
    const isCreate = mode === 'create';
    const canGenerateAfterSave = canGenerateCredentials && isCreate;
    const update = (field) => (value) => setForm(current => ({ ...current, [field]: value }));

    return (
        <Modal isOpen={visible} onClose={onCancel} title={title} width="max-w-3xl">
            <form onSubmit={event => { event.preventDefault(); onSave(); }} className="space-y-5">
                <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/80 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/10">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-400">
                            <Stethoscope size={20} />
                        </span>
                        <div>
                            <p className="text-xs font-black text-cyan-950 dark:text-cyan-100">{isCreate ? t('referringDoctors.form.createTitle') : t('referringDoctors.form.editTitle')}</p>
                            <p className="mt-0.5 text-xs font-semibold leading-5 text-cyan-800 dark:text-cyan-200">
                                {t('referringDoctors.form.modalHint', { defaultValue: 'Keep the record minimal: name, specialty, contact details, and portal access when needed.' })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('referringDoctors.form.fullName')} value={form.fullName} onChange={update('fullName')} required autoFocus />
                    <Field label={t('referringDoctors.form.specialty')} value={form.specialty} onChange={update('specialty')} />
                    <Field label={t('referringDoctors.form.clinic')} value={form.clinicHospital} onChange={update('clinicHospital')} />
                    <Field label={t('referringDoctors.form.email')} type="email" value={form.email} onChange={update('email')} required={Boolean(form.generatePortalCredentials)} helper={canGenerateAfterSave ? t('referringDoctors.portal.emailHint', { defaultValue: 'Required for doctor portal login.' }) : undefined} />
                    <Field label={t('referringDoctors.form.phone')} type="tel" value={form.phone} onChange={update('phone')} />
                    <label>
                        <FieldLabel>{t('referringDoctors.form.preferredContact')}</FieldLabel>
                        <select value={form.preferredContactMethod} onChange={event => update('preferredContactMethod')(event.target.value)} className={inputClass}>
                            {['Phone', 'Email', 'SMS', 'WhatsApp'].map(method => <option key={method} value={method}>{t(`referringDoctors.contactMethods.${method}`)}</option>)}
                        </select>
                    </label>
                </div>

                {canGenerateAfterSave && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/80 p-4 text-xs text-blue-950 transition hover:bg-blue-100/80 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
                        <input
                            type="checkbox"
                            checked={Boolean(form.generatePortalCredentials)}
                            onChange={event => update('generatePortalCredentials')(event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-700 focus:ring-blue-500"
                        />
                        <span>
                            <span className="flex items-center gap-2 font-black"><KeyRound size={15} />{t('referringDoctors.portal.generateAfterSave', { defaultValue: 'Generate portal credentials after saving' })}</span>
                            <span className="mt-1 block text-xs font-semibold leading-5 text-blue-800 dark:text-blue-300">
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
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200/80 bg-blue-50/80 px-4 text-xs font-black text-blue-900 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
                    >
                        <KeyRound size={15} />
                        {isGeneratingCredentials ? t('referringDoctors.portal.generating', { defaultValue: 'Generating credentials...' }) : t('referringDoctors.portal.generate', { defaultValue: 'Generate doctor portal credentials' })}
                    </button>
                )}

                <details className="group rounded-2xl border border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-300">
                        {t('referringDoctors.form.moreDetails', { defaultValue: 'Business details and notes' })}
                        <ChevronDown size={16} className="text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-4 border-t border-slate-200/80 p-4 dark:border-white/5 sm:grid-cols-2">
                        <Field label={t('referringDoctors.form.address')} value={form.address} onChange={update('address')} />
                        <Field label={t('referringDoctors.form.source')} value={form.referralSourceCategory} onChange={update('referralSourceCategory')} />
                        <Field label={t('referringDoctors.form.taxId')} value={form.taxId} onChange={update('taxId')} />
                        <Field label={t('referringDoctors.form.contractId')} value={form.contractId} onChange={update('contractId')} />
                        <Field label={t('referringDoctors.form.commission')} type="number" min="0" max="100" value={form.commissionPercentage} onChange={update('commissionPercentage')} />
                        {canSetActive && (
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                                <input type="checkbox" checked={Boolean(form.isActive)} onChange={event => update('isActive')(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                {t('referringDoctors.form.active')}
                            </label>
                        )}
                        <label className="sm:col-span-2">
                            <FieldLabel>{t('referringDoctors.form.notes')}</FieldLabel>
                            <textarea value={form.notes} onChange={event => update('notes')(event.target.value)} rows={3} className={`${inputClass} h-auto py-3 resize-y text-xs`} placeholder={t('referringDoctors.form.notesPlaceholder')} />
                        </label>
                    </div>
                </details>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-100/80 pt-5 dark:border-white/5 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onCancel} className={secondaryBtn}>{t('referringDoctors.actions.cancel')}</button>
                    <button
                        type="submit"
                        disabled={isSaving || !form.fullName.trim()}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-8 text-xs font-black text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 disabled:opacity-50"
                    >
                        {isSaving ? t('referringDoctors.actions.saving') : isCreate && form.generatePortalCredentials ? t('referringDoctors.portal.saveAndGenerate', { defaultValue: 'Save and generate' }) : t('referringDoctors.actions.save')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

/* Micro Components */
const FieldLabel = ({ children, required }) => <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}{required && <span className="text-rose-600">*</span>}</span>;
const Field = ({ label, value, onChange, type = 'text', required = false, helper, ...props }) => <label className="block"><FieldLabel required={required}>{label}</FieldLabel><input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} className={inputClass} required={required} {...props} />{helper && <span className="mt-1 block text-[10px] font-semibold text-slate-500">{helper}</span>}</label>;
const ProfileStat = ({ label, value }) => <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-white/[0.02]"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p><p className="mt-1 truncate font-mono text-sm font-black text-slate-900 dark:text-slate-100">{value}</p></div>;
const CompactValue = ({ label, value }) => <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 p-2 text-start dark:border-white/5 dark:bg-white/[0.02]"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p><p className="mt-1 truncate font-mono text-xs font-bold text-slate-900 dark:text-white">{value}</p></div>;
const DetailRow = ({ icon: Icon, label, value }) => <div className="flex min-w-0 items-center gap-3 text-xs font-semibold"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">{Icon ? <Icon size={14} /> : '—'}</span><div className="min-w-0">{label && <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>}<p className="truncate font-bold text-slate-800 dark:text-slate-200">{value}</p></div></div>;
const StatusPill = ({ active, t }) => (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400'}`} />
        {active ? t('referringDoctors.status.active') : t('referringDoctors.status.inactive')}
    </span>
);
const IconButton = ({ label, icon: Icon, onClick, danger = false, disabled = false, tone }) => <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`flex h-8 w-8 items-center justify-center rounded-xl transition disabled:opacity-50 ${danger ? 'text-slate-400 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300' : tone === 'teal' ? 'text-slate-400 hover:bg-teal-100 hover:text-teal-800 dark:hover:bg-teal-950/40 dark:hover:text-teal-300' : 'text-slate-400 hover:bg-cyan-100 hover:text-cyan-800 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-300'}`}><Icon size={15} /></button>;

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
const toDoctorForm = doctor => ({ fullName: doctor.full_name || '', specialty: doctor.specialty || '', clinicHospital: doctor.clinic_hospital || '', phone: doctor.phone || '', email: doctor.email || '', address: doctor.address || '', taxId: doctor.tax_id || '', contractId: doctor.contract_id || '', referralSourceCategory: doctor.referral_source_category || 'Doctor', commissionPercentage: doctor.commission_percentage || 0, preferredContactMethod: doctor.preferred_contact_method || 'Email', notes: doctor.notes || '', isActive: Boolean(doctor.is_active) });
const cleanDoctorPayload = form => ({ fullName: form.fullName.trim(), specialty: form.specialty.trim() || undefined, clinicHospital: form.clinicHospital.trim() || undefined, phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, address: form.address.trim() || undefined, taxId: form.taxId.trim() || undefined, contractId: form.contractId.trim() || undefined, referralSourceCategory: form.referralSourceCategory.trim() || undefined, commissionPercentage: Number(form.commissionPercentage || 0), preferredContactMethod: form.preferredContactMethod || undefined, notes: form.notes.trim() || undefined, ...(form.isActive !== undefined ? { isActive: Boolean(form.isActive) } : {}) });
const formatCurrency = (value, locale) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number(value || 0));
const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
const parseCsvLine = line => { const values = []; let current = ''; let inQuotes = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; } else if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { values.push(current); current = ''; } else current += char; } values.push(current); return values.map(value => value.trim()); };
const downloadFile = (filename, content) => { const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };

export default ReferringDoctors;
