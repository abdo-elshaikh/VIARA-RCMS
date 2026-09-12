import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    Briefcase,
    CalendarClock,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    Download,
    Edit2,
    Eye,
    FilterX,
    KeyRound,
    Mail,
    Search,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Trash2,
    UserCheck,
    UserPlus,
    UsersRound,
    UserX,
    XCircle,
    Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useCreateStaffMutation,
    useDeleteStaffMutation,
    useGetStaffQuery,
    useUpdateStaffMutation
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { Button, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Pagination, Select, Skeleton } from '../components/ui';
import { getErrorMessage } from '../utils/getErrorMessage';

const ROLE_CATALOG = [
    { id: 'Developer', group: 'governance', risk: 'critical', icon: KeyRound, tone: 'rose', scope: 'platform' },
    { id: 'Admin', group: 'governance', risk: 'critical', icon: ShieldAlert, tone: 'violet', scope: 'full' },
    { id: 'Radiologist', group: 'clinical', risk: 'sensitive', icon: ClipboardCheck, tone: 'cyan', scope: 'diagnostic' },
    { id: 'Technician', group: 'clinical', risk: 'sensitive', icon: Activity, tone: 'amber', scope: 'modality' },
    { id: 'Nurse', group: 'clinical', risk: 'standard', icon: UserCheck, tone: 'emerald', scope: 'care' },
    { id: 'Receptionist', group: 'operations', risk: 'sensitive', icon: UsersRound, tone: 'blue', scope: 'frontDesk' },
    { id: 'Cashier', group: 'finance', risk: 'sensitive', icon: Briefcase, tone: 'indigo', scope: 'cashier' },
    { id: 'Accountant', group: 'finance', risk: 'critical', icon: Briefcase, tone: 'indigo', scope: 'finance' },
    { id: 'Insurance_Staff', group: 'finance', risk: 'sensitive', icon: ShieldCheck, tone: 'sky', scope: 'insurance' },
    { id: 'HR', group: 'governance', risk: 'critical', icon: KeyRound, tone: 'fuchsia', scope: 'people' },
    { id: 'Marketing', group: 'growth', risk: 'standard', icon: Sparkles, tone: 'emerald', scope: 'crm' }
];

const STAFF_ROLES = ROLE_CATALOG.map(role => role.id);
const MANAGED_OUTSIDE_USERS = ['Referring_Doctor'];
const PROTECTED_ROLES = new Set(['Developer', 'Admin']);
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const Users = () => {
    const { t, i18n } = useTranslation('admin');
    const isArabic = i18n.language === 'ar';
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const { data: staff = [], isLoading, isFetching, isError, refetch } = useGetStaffQuery();
    const [createStaff, { isLoading: isCreating }] = useCreateStaffMutation();
    const [updateStaff, { isLoading: isUpdating }] = useUpdateStaffMutation();
    const [deleteStaff, { isLoading: isDeleting }] = useDeleteStaffMutation();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [deleteUser, setDeleteUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [riskFilter, setRiskFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors }
    } = useForm();

    const selectedFormRole = watch('role');
    const isDeveloper = currentUser?.role === 'Developer';

    useEffect(() => {
        if (!isModalOpen) return;
        if (editingUser) {
            setValue('fullName', editingUser.full_name);
            setValue('email', editingUser.email);
            setValue('role', editingUser.role);
            setValue('isActive', String(editingUser.is_active));
            setValue('password', '');
        } else {
            reset({ fullName: '', email: '', role: '', isActive: 'true', password: '' });
        }
    }, [editingUser, isModalOpen, reset, setValue]);

    const roleProfiles = useMemo(() => Object.fromEntries(ROLE_CATALOG.map(role => [role.id, role])), []);
    const assignableRoles = useMemo(
        () => STAFF_ROLES.filter(role => isDeveloper || !PROTECTED_ROLES.has(role)),
        [isDeveloper]
    );
    const canMutateUser = (user) => isDeveloper || !PROTECTED_ROLES.has(user?.role);

    const summary = useMemo(() => {
        const active = staff.filter(user => user.is_active).length;
        const disabled = staff.length - active;
        const critical = staff.filter(user => roleProfiles[user.role]?.risk === 'critical').length;
        const missingRoles = STAFF_ROLES.filter(role => !staff.some(user => user.role === role && user.is_active));

        return {
            total: staff.length,
            active,
            disabled,
            critical,
            roleCount: new Set(staff.map(user => user.role).filter(Boolean)).size,
            missingRoles
        };
    }, [roleProfiles, staff]);

    const roleCoverage = useMemo(() => ROLE_CATALOG.map(role => {
        const users = staff.filter(user => user.role === role.id);
        return {
            ...role,
            total: users.length,
            active: users.filter(user => user.is_active).length,
            disabled: users.filter(user => !user.is_active).length
        };
    }), [staff]);

    const filteredStaff = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        return staff.filter(user => {
            const profile = roleProfiles[user.role] || {};
            const roleLabel = t(`users.roles.${user.role}`, { defaultValue: user.role });
            const matchesSearch = !search || [user.full_name, user.email, user.role, roleLabel, profile.group]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(search);
            const matchesRole = roleFilter === 'all' || user.role === roleFilter;
            const matchesStatus = statusFilter === 'all'
                || (statusFilter === 'active' ? user.is_active : !user.is_active);
            const matchesRisk = riskFilter === 'all' || profile.risk === riskFilter;
            return matchesSearch && matchesRole && matchesStatus && matchesRisk;
        });
    }, [roleFilter, roleProfiles, riskFilter, searchTerm, staff, statusFilter, t]);

    const totalPages = Math.ceil(filteredStaff.length / pageSize) || 1;
    const paginatedStaff = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredStaff.slice(start, start + pageSize);
    }, [currentPage, filteredStaff, pageSize]);

    const hasFilters = Boolean(searchTerm || roleFilter !== 'all' || statusFilter !== 'all' || riskFilter !== 'all');

    const clearFilters = () => {
        setSearchTerm('');
        setRoleFilter('all');
        setStatusFilter('all');
        setRiskFilter('all');
        setCurrentPage(1);
    };

    const openCreate = () => {
        setEditingUser(null);
        setIsModalOpen(true);
    };

    const openEdit = (user) => {
        if (!canMutateUser(user)) {
            toast.error(t('users.messages.protectedDenied', 'Only a Developer can change protected accounts.'));
            return;
        }
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        reset();
    };

    const submitUser = async (data) => {
        try {
            if (!isDeveloper && PROTECTED_ROLES.has(data.role)) {
                toast.error(t('users.messages.protectedDenied', 'Only a Developer can change protected accounts.'));
                return;
            }
            const payload = {
                fullName: (data.fullName || '').trim(),
                email: (data.email || '').trim().toLowerCase(),
                role: data.role
            };

            if (data.password && data.password.trim()) {
                payload.password = data.password.trim();
            }

            if (editingUser) {
                await updateStaff({
                    id: editingUser.user_id,
                    ...payload,
                    isActive: data.isActive === 'true'
                }).unwrap();
                toast.success(t('users.messages.updated'));
            } else {
                if (!payload.password) {
                    toast.error(t('users.form.passwordRequired'));
                    return;
                }
                await createStaff(payload).unwrap();
                toast.success(t('users.messages.created'));
            }
            closeModal();
        } catch (error) {
            toast.error(getErrorMessage(error, t('users.messages.saveFailed')));
        }
    };

    const confirmDelete = async () => {
        if (!deleteUser) return;
        if (!canMutateUser(deleteUser)) {
            toast.error(t('users.messages.protectedDenied', 'Only a Developer can change protected accounts.'));
            setDeleteUser(null);
            return;
        }
        try {
            await deleteStaff(deleteUser.user_id).unwrap();
            toast.success(t('users.messages.deleted'));
            setDeleteUser(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('users.messages.deleteFailed')));
        }
    };

    const generatePassword = async () => {
        const password = generateTemporaryPassword();
        setValue('password', password, { shouldDirty: true, shouldValidate: true });
        try {
            await navigator.clipboard?.writeText(password);
            toast.success(t('users.messages.passwordGeneratedCopied'));
        } catch {
            toast.success(t('users.messages.passwordGenerated'));
        }
    };

    const exportUsers = () => {
        if (filteredStaff.length === 0) {
            toast.error(t('users.messages.noExport'));
            return;
        }
        const rows = filteredStaff.map(user => ({
            name: user.full_name || '',
            email: user.email || '',
            role: t(`users.roles.${user.role}`, { defaultValue: user.role }),
            status: user.is_active ? t('users.status.active') : t('users.status.disabled'),
            risk: t(`users.risk.${roleProfiles[user.role]?.risk || 'standard'}`),
            created_at: user.created_at || ''
        }));
        downloadCsv(`VIARA-users-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        toast.success(t('users.messages.exported', { count: filteredStaff.length }));
    };

    const formRoleProfile = roleProfiles[selectedFormRole];

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            <PageHeader
                icon={UsersRound}
                eyebrowIcon={ShieldCheck}
                eyebrow={t('users.eyebrow')}
                title={t('users.title')}
                description={t('users.description')}
                actions={(
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => navigate('/user-activity')}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-50/70 px-4 text-xs font-black text-teal-800 shadow-2xs transition hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300"
                        >
                            <Activity size={15} className="text-teal-600 dark:text-teal-400" />
                            <span>{isArabic ? 'تتبع نشاط المستخدمين' : 'Activity Tracker'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={exportUsers}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <Download size={15} />
                            <span>{t('users.actions.export')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={openCreate}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                        >
                            <UserPlus size={15} />
                            <span>{t('users.actions.add')}</span>
                        </button>
                    </div>
                )}
                metrics={[
                    { key: 'total', label: t('users.metrics.total'), value: summary.total, icon: UsersRound, tone: 'teal', detail: t('users.metrics.roles', { count: summary.roleCount }), loading: isLoading, error: isError },
                    { key: 'active', label: t('users.metrics.active'), value: summary.active, icon: UserCheck, tone: 'emerald', detail: t('users.metrics.activeDetail'), loading: isLoading, error: isError },
                    { key: 'disabled', label: t('users.metrics.disabled'), value: summary.disabled, icon: XCircle, tone: 'rose', detail: t('users.metrics.disabledDetail'), loading: isLoading, error: isError },
                    { key: 'critical', label: t('users.metrics.critical'), value: summary.critical, icon: ShieldAlert, tone: 'violet', detail: t('users.metrics.criticalDetail'), loading: isLoading, error: isError },
                ]}
                metricsLabel={t('users.metrics.label')}
                meta={isFetching && <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{isArabic ? 'جارٍ تحديث السجل…' : 'Refreshing records…'}</span>}
            />

            {/* Role Coverage Pills */}
            <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">{t('users.coverage.title')}</h2>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('users.coverage.description')}</p>
                    </div>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <ShieldCheck size={14} />{t('users.coverage.managedRoles', { count: STAFF_ROLES.length })}
                    </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                    {roleCoverage.map(role => (
                        <button
                            key={role.id}
                            type="button"
                            onClick={() => { setRoleFilter(role.id); setCurrentPage(1); }}
                            className={`rounded-2xl border p-3 text-start transition ${roleFilter === role.id
                                    ? 'border-teal-500/50 bg-teal-500/10 dark:bg-teal-950/30 ring-1 ring-teal-500/30'
                                    : 'border-slate-100 bg-slate-50/70 hover:border-slate-200 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
                                }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <RoleBadge role={role.id} label={roleLabel(role.id, t)} compact />
                                <span className="text-base font-black text-slate-900 dark:text-white">{role.active}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-400">
                                <span className={riskClass(role.risk)}>{t(`users.risk.${role.risk}`)}</span>
                                <span>{role.total} {isArabic ? 'حساب' : 'total'}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {/* Filter Deck */}
            <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">{t('users.directory.title')}</h2>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('users.directory.description')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-800 dark:text-teal-300">
                            {t('users.filters.results', { shown: filteredStaff.length, total: staff.length })}
                        </span>
                        {hasFilters && (
                            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-rose-600">
                                <FilterX size={14} />{t('users.filters.reset')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_200px_180px_180px]">
                    <div className="relative">
                        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            value={searchTerm}
                            onChange={event => { setSearchTerm(event.target.value); setCurrentPage(1); }}
                            placeholder={t('users.filters.search')}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 ps-10 pe-3 text-xs font-bold outline-hidden transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:focus:border-teal-500"
                        />
                    </div>
                    <FilterSelect value={roleFilter} onChange={(v) => { setRoleFilter(v); setCurrentPage(1); }} label={t('users.filters.role')}>
                        <option value="all">{t('users.filters.allRoles')}</option>
                        {STAFF_ROLES.map(role => <option key={role} value={role}>{roleLabel(role, t)}</option>)}
                    </FilterSelect>
                    <FilterSelect value={statusFilter} onChange={(v) => { setStatusFilter(v); setCurrentPage(1); }} label={t('users.filters.status')}>
                        <option value="all">{t('users.filters.allStatuses')}</option>
                        <option value="active">{t('users.status.active')}</option>
                        <option value="disabled">{t('users.status.disabled')}</option>
                    </FilterSelect>
                    <FilterSelect value={riskFilter} onChange={(v) => { setRiskFilter(v); setCurrentPage(1); }} label={t('users.filters.risk')}>
                        <option value="all">{t('users.filters.allRisks')}</option>
                        <option value="critical">{t('users.risk.critical')}</option>
                        <option value="sensitive">{t('users.risk.sensitive')}</option>
                        <option value="standard">{t('users.risk.standard')}</option>
                    </FilterSelect>
                </div>
            </section>

            {/* Table & Content */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {isLoading ? (
                    <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                        {[1, 2, 3, 4, 5, 6].map(item => <Skeleton key={item} variant="card" className="h-44" />)}
                    </div>
                ) : isError ? (
                    <EmptyState icon={Shield} title={t('users.states.errorTitle')} description={t('users.states.errorDescription')} actionLabel={t('users.actions.retry')} onAction={refetch} />
                ) : filteredStaff.length === 0 ? (
                    <EmptyState icon={Shield} title={t('users.states.emptyTitle')} description={hasFilters ? t('users.states.filteredEmpty') : t('users.states.emptyDescription')} actionLabel={hasFilters ? t('users.filters.reset') : t('users.actions.add')} onAction={hasFilters ? clearFilters : openCreate} />
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-[980px] w-full text-start text-xs font-bold">
                                <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                                    <tr>
                                        <TableHead>{t('users.table.user')}</TableHead>
                                        <TableHead>{t('users.table.role')}</TableHead>
                                        <TableHead>{t('users.table.access')}</TableHead>
                                        <TableHead>{t('users.table.status')}</TableHead>
                                        <TableHead>{t('users.table.added')}</TableHead>
                                        <TableHead align="end">{t('users.table.actions')}</TableHead>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {paginatedStaff.map(user => {
                                        const profile = roleProfiles[user.role] || {};
                                        return (
                                            <tr key={user.user_id} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                                <td className="px-5 py-3.5">
                                                    <UserIdentity user={user} onClick={() => navigate(`/users/${user.user_id}`)} />
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="space-y-1">
                                                        <RoleBadge role={user.role} label={roleLabel(user.role, t)} />
                                                        <p className="text-[10px] font-semibold text-slate-400">{t(`users.groups.${profile.group || 'operations'}`)}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="max-w-[240px]">
                                                        <span className={riskClass(profile.risk || 'standard')}>{t(`users.risk.${profile.risk || 'standard'}`)}</span>
                                                        <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-slate-500">{t(`users.scope.${profile.scope || 'frontDesk'}`)}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5"><StatusBadge active={user.is_active} t={t} /></td>
                                                <td className="px-5 py-3.5 text-slate-500">{formatCreatedAt(user.created_at, locale, t)}</td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex justify-end gap-1">
                                                        <IconButton label={t('users.actions.viewDetails', 'View Details & Movements')} icon={Eye} onClick={() => navigate(`/users/${user.user_id}`)} tone="teal" />
                                                        <IconButton label={t('users.actions.copyEmail')} icon={Copy} onClick={() => copyText(user.email, t)} tone="slate" disabled={!user.email} />
                                                        <IconButton label={t('users.actions.edit')} icon={Edit2} onClick={() => openEdit(user)} tone="cyan" disabled={!canMutateUser(user)} />
                                                        <IconButton label={t('users.actions.delete')} icon={Trash2} onClick={() => setDeleteUser(user)} tone="rose" disabled={!canMutateUser(user)} />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Interactive Pagination Footer */}
                        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-xs font-bold text-slate-500 dark:border-slate-800 sm:flex-row">
                            <div className="flex items-center gap-2">
                                <span>{isArabic ? 'عرض' : 'Showing'}</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                >
                                    {[10, 20, 50].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <span>{isArabic ? `من إجمالي ${filteredStaff.length} مستخدم` : `of ${filteredStaff.length} users`}</span>
                            </div>

                            <Pagination currentPage={currentPage} pageCount={totalPages} onPageChange={setCurrentPage} isRtl={isArabic} compact />
                        </div>
                    </>
                )}
            </section>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingUser ? t('users.form.editTitle') : t('users.form.createTitle')} width="max-w-3xl">
                <form onSubmit={handleSubmit(submitUser)} className="space-y-5">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-4 text-xs font-bold text-teal-900 dark:text-teal-200">
                                {editingUser ? t('users.form.editHint') : t('users.form.createHint')}
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                    <Input id="staff-full-name" label={t('users.form.fullName')} placeholder={t('users.form.fullNamePlaceholder')} error={errors.fullName?.message} {...register('fullName', { required: t('users.form.fullNameRequired'), minLength: { value: 3, message: t('users.form.fullNameLength') } })} />
                                </div>
                                <div className="sm:col-span-2">
                                    <Input id="staff-email" type="email" label={t('users.form.email')} placeholder="user@viara.health" error={errors.email?.message} {...register('email', { required: t('users.form.emailRequired') })} />
                                </div>
                                <div className="sm:col-span-2">
                                    <Select label={t('users.form.role')} placeholder={t('users.form.rolePlaceholder')} error={errors.role} {...register('role', { required: t('users.form.roleRequired') })} options={assignableRoles.map(role => ({ value: role, label: roleLabel(role, t) }))} />
                                </div>
                                {editingUser && <Select label={t('users.form.status')} {...register('isActive')} options={[{ value: 'true', label: t('users.status.active') }, { value: 'false', label: t('users.status.disabled') }]} />}
                                <div className="sm:col-span-2 space-y-2">
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1">
                                            <Input
                                                id="staff-password"
                                                type="password"
                                                label={editingUser ? t('users.form.newPassword') : t('users.form.initialPassword')}
                                                placeholder={editingUser ? t('users.form.passwordOptional') : t('users.form.passwordPlaceholder')}
                                                error={errors.password?.message}
                                                {...register('password', {
                                                    required: !editingUser && t('users.form.passwordRequired'),
                                                    minLength: { value: 8, message: t('users.form.passwordLength') },
                                                    validate: value => !value || strongPasswordPattern.test(value) || t('users.form.passwordComplexity')
                                                })}
                                            />
                                        </div>
                                        <Button type="button" variant="outline" className="shrink-0 h-11" onClick={generatePassword} title={t('users.actions.generatePassword')}>
                                            <Sparkles size={16} className="text-amber-500" />
                                            <span className="hidden sm:inline">{t('users.actions.generatePassword')}</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <aside className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('users.form.rolePreview')}</p>
                            {formRoleProfile ? (
                                <div className="mt-4 space-y-4">
                                    <RoleBadge role={formRoleProfile.id} label={roleLabel(formRoleProfile.id, t)} />
                                    <div>
                                        <p className="text-xs font-black text-slate-900 dark:text-white">{t(`users.groups.${formRoleProfile.group}`)}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">{t(`users.scope.${formRoleProfile.scope}`)}</p>
                                    </div>
                                    <div className="rounded-xl bg-white p-3 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                        <p className="text-[10px] font-bold text-slate-400">{t('users.form.riskLevel')}</p>
                                        <span className={`mt-1.5 ${riskClass(formRoleProfile.risk)}`}>{t(`users.risk.${formRoleProfile.risk}`)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500 dark:border-slate-700">{t('users.form.selectRolePreview')}</div>
                            )}
                        </aside>
                    </div>
                    <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" onClick={closeModal}>{t('users.actions.cancel')}</Button>
                        <Button type="submit" loading={isCreating || isUpdating}>
                            {editingUser ? <Edit2 size={16} /> : <UserPlus size={16} />}
                            {editingUser ? t('users.actions.save') : t('users.actions.create')}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog isOpen={Boolean(deleteUser)} onClose={() => setDeleteUser(null)} onConfirm={confirmDelete} title={t('users.delete.title')} message={t('users.delete.message', { name: deleteUser?.full_name || '' })} confirmText={t('users.actions.delete')} variant="danger" isLoading={isDeleting} />
        </main>
    );
};

const FilterSelect = ({ value, onChange, label, children }) => (
    <select value={value} onChange={event => onChange(event.target.value)} className="h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" aria-label={label}>
        {children}
    </select>
);

const TableHead = ({ children, align = 'start' }) => (
    <th className={`px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ${align === 'end' ? 'text-end' : 'text-start'}`}>{children}</th>
);

const UserIdentity = ({ user, onClick }) => (
    <div
        onClick={onClick}
        className={`flex min-w-0 items-center gap-3 ${onClick ? 'cursor-pointer group' : ''}`}
    >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-black border border-teal-500/30 transition group-hover:scale-105">
            {initials(user.full_name)}
        </span>
        <div className="min-w-0">
            <p className="truncate font-black text-slate-900 transition group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">{user.full_name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-400"><Mail size={12} />{user.email}</p>
        </div>
    </div>
);

const RoleBadge = ({ role, label, compact = false }) => {
    const Icon = ROLE_CATALOG.find(item => item.id === role)?.icon || Shield;
    const style = {
        Admin: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
        Developer: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
        Radiologist: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        Technician: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        Nurse: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        Receptionist: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
        Cashier: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
        Accountant: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
        Insurance_Staff: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
        HR: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
        Marketing: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30'
    }[role] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-black ${style}`}><Icon size={compact ? 11 : 12} />{label}</span>;
};

const StatusBadge = ({ active, t }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-black ${active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
        {active ? <CheckCircle2 size={12} /> : <UserX size={12} />}
        {active ? t('users.status.active') : t('users.status.disabled')}
    </span>
);

const IconButton = ({ label, icon: Icon, onClick, tone, disabled = false }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        disabled={disabled}
        className={`flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition disabled:opacity-40 ${tone === 'rose'
                ? 'hover:bg-rose-500/10 hover:text-rose-700'
                : tone === 'slate'
                    ? 'hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800'
                    : 'hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300'
            }`}
    >
        <Icon size={15} />
    </button>
);

const riskClass = (risk) => {
    const classes = {
        critical: 'inline-flex rounded-full bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300',
        sensitive: 'inline-flex rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300',
        standard: 'inline-flex rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
    };
    return classes[risk] || classes.standard;
};

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '-';
const roleLabel = (role, t) => t(`users.roles.${role}`, { defaultValue: role });
const formatCreatedAt = (value, locale, t) => value
    ? new Date(value).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    : t('users.table.unknownDate');

const generateTemporaryPassword = () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const number = Math.floor(100 + Math.random() * 900);
    return `VIARA${number}${suffix}A`;
};

const copyText = async (value, t) => {
    if (!value) return;
    try {
        await navigator.clipboard?.writeText(value);
        toast.success(t('users.messages.copied'));
    } catch {
        toast.error(t('users.messages.copyFailed'));
    }
};

const downloadCsv = (filename, rows) => {
    const headers = Object.keys(rows[0] || {});
    const csv = [
        headers.join(','),
        ...rows.map(row => headers.map(header => csvCell(row[header])).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default Users;
