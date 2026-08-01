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
    XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useCreateStaffMutation,
    useDeleteStaffMutation,
    useGetStaffQuery,
    useUpdateStaffMutation
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { Button, ConfirmDialog, EmptyState, Input, Modal, Select, Skeleton, PageHeader, MetricCard } from '../components/ui';
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
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-EG';
    const { data: staff = [], isLoading, isError, refetch } = useGetStaffQuery();
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

    const hasFilters = Boolean(searchTerm || roleFilter !== 'all' || statusFilter !== 'all' || riskFilter !== 'all');

    const clearFilters = () => {
        setSearchTerm('');
        setRoleFilter('all');
        setStatusFilter('all');
        setRiskFilter('all');
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
        downloadCsv(`rcms-users-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        toast.success(t('users.messages.exported', { count: filteredStaff.length }));
    };

    const formRoleProfile = roleProfiles[selectedFormRole];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={UsersRound}
                eyebrowIcon={ShieldCheck}
                eyebrow={t('users.eyebrow')}
                title={t('users.title')}
                description={t('users.description')}
                actions={
                    <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                        <button type="button" onClick={exportUsers} title={t('users.actions.export')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300">
                            <Download size={18} />{t('users.actions.export')}
                        </button>
                        <button type="button" onClick={openCreate} title={t('users.actions.add')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20 dark:bg-white dark:text-slate-950 dark:hover:bg-teal-100">
                            <UserPlus size={18} />{t('users.actions.add')}
                        </button>
                    </div>
                }
            >
                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{t('users.header.staffRoles', { count: STAFF_ROLES.length })}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{t('users.header.portalRoles', { count: MANAGED_OUTSIDE_USERS.length })}</span>
                    {summary.missingRoles.length > 0 && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">{t('users.header.uncovered', { count: summary.missingRoles.length })}</span>
                    )}
                </div>
            </PageHeader>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('users.metrics.label')}>
                <MetricCard icon={UsersRound} label={t('users.metrics.total')} value={summary.total} detail={t('users.metrics.roles', { count: summary.roleCount })} tone="cyan" />
                <MetricCard icon={UserCheck} label={t('users.metrics.active')} value={summary.active} detail={t('users.metrics.activeDetail')} tone="emerald" />
                <MetricCard icon={XCircle} label={t('users.metrics.disabled')} value={summary.disabled} detail={t('users.metrics.disabledDetail')} tone="rose" />
                <MetricCard icon={ShieldAlert} label={t('users.metrics.critical')} value={summary.critical} detail={t('users.metrics.criticalDetail')} tone="violet" />
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 sm:p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-bold text-slate-950 dark:text-white">{t('users.coverage.title')}</h2>
                        <p className="mt-1 text-sm text-slate-500">{t('users.coverage.description')}</p>
                    </div>
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <ShieldCheck size={14} />{t('users.coverage.managedRoles', { count: STAFF_ROLES.length })}
                    </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {roleCoverage.map(role => (
                        <button
                            key={role.id}
                            type="button"
                            title={t('users.coverage.filterByRole', { role: roleLabel(role.id, t) })}
                            onClick={() => setRoleFilter(role.id)}
                            className={`group rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-900/5 ${roleFilter === role.id ? 'border-cyan-300 bg-cyan-50/70 dark:border-cyan-700 dark:bg-cyan-950/30' : 'border-slate-200/60 bg-slate-50/30 hover:border-cyan-200 dark:border-slate-800/65 dark:bg-slate-900/10 dark:hover:border-cyan-850'}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <RoleBadge role={role.id} label={roleLabel(role.id, t)} compact />
                                <span className="text-xl font-black text-slate-950 dark:text-white">{role.active}</span>
                            </div>
                            <p className="mt-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-500">{t(`users.scope.${role.scope}`)}</p>
                            <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold">
                                <span className={riskClass(role.risk)}>{t(`users.risk.${role.risk}`)}</span>
                                <span className="text-slate-400">{t('users.coverage.totalAccounts', { count: role.total })}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 sm:p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-bold text-slate-950 dark:text-white">{t('users.directory.title')}</h2>
                        <p className="mt-1 text-sm text-slate-500">{t('users.directory.description')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400">{t('users.filters.results', { shown: filteredStaff.length, total: staff.length })}</span>
                        {hasFilters && <button type="button" onClick={clearFilters} title={t('users.filters.reset')} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-rose-600"><FilterX size={14} />{t('users.filters.reset')}</button>}
                    </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_220px_190px_190px]">
                    <label className="relative block">
                        <span className="sr-only">{t('users.filters.searchLabel')}</span>
                        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder={t('users.filters.search')} className="h-11 w-full rounded-xl border border-slate-200/60 bg-slate-50/30 ps-10 pe-3 text-sm outline-none transition focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700/60 dark:bg-slate-900/30 dark:focus:border-cyan-500 dark:focus:bg-slate-900" />
                    </label>
                    <FilterSelect value={roleFilter} onChange={setRoleFilter} label={t('users.filters.role')}>
                        <option value="all">{t('users.filters.allRoles')}</option>
                        {STAFF_ROLES.map(role => <option key={role} value={role}>{roleLabel(role, t)}</option>)}
                    </FilterSelect>
                    <FilterSelect value={statusFilter} onChange={setStatusFilter} label={t('users.filters.status')}>
                        <option value="all">{t('users.filters.allStatuses')}</option>
                        <option value="active">{t('users.status.active')}</option>
                        <option value="disabled">{t('users.status.disabled')}</option>
                    </FilterSelect>
                    <FilterSelect value={riskFilter} onChange={setRiskFilter} label={t('users.filters.risk')}>
                        <option value="all">{t('users.filters.allRisks')}</option>
                        <option value="critical">{t('users.risk.critical')}</option>
                        <option value="sensitive">{t('users.risk.sensitive')}</option>
                        <option value="standard">{t('users.risk.standard')}</option>
                    </FilterSelect>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
                {isLoading ? (
                    <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map(item => <Skeleton key={item} variant="card" className="h-44" />)}</div>
                ) : isError ? (
                    <EmptyState icon={Shield} title={t('users.states.errorTitle')} description={t('users.states.errorDescription')} actionLabel={t('users.actions.retry')} onAction={refetch} />
                ) : filteredStaff.length === 0 ? (
                    <EmptyState icon={Shield} title={t('users.states.emptyTitle')} description={hasFilters ? t('users.states.filteredEmpty') : t('users.states.emptyDescription')} actionLabel={hasFilters ? t('users.filters.reset') : t('users.actions.add')} onAction={hasFilters ? clearFilters : openCreate} />
                ) : (
                    <>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
                            {filteredStaff.map(user => (
                                <UserMobileCard
                                    key={user.user_id}
                                    user={user}
                                    t={t}
                                    locale={locale}
                                    roleProfile={roleProfiles[user.role]}
                                    onViewDetails={() => navigate(`/users/${user.user_id}`)}
                                    onEdit={() => openEdit(user)}
                                    onDelete={() => canMutateUser(user) ? setDeleteUser(user) : toast.error(t('users.messages.protectedDenied', 'Only a Developer can change protected accounts.'))}
                                />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="min-w-[1040px] w-full text-start text-sm">
                                <thead className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/50">
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
                                    {filteredStaff.map(user => {
                                        const profile = roleProfiles[user.role] || {};
                                        return (
                                            <tr key={user.user_id} className="transition hover:bg-cyan-50/35 dark:hover:bg-cyan-900/20">
                                                <td className="px-5 py-4">
                                                    <UserIdentity user={user} onClick={() => navigate(`/users/${user.user_id}`)} />
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="space-y-2">
                                                        <RoleBadge role={user.role} label={roleLabel(user.role, t)} />
                                                        <p className="text-xs font-semibold text-slate-400">{t(`users.groups.${profile.group || 'operations'}`)}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="max-w-[260px]">
                                                        <span className={riskClass(profile.risk || 'standard')}>{t(`users.risk.${profile.risk || 'standard'}`)}</span>
                                                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{t(`users.scope.${profile.scope || 'frontDesk'}`)}</p>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4"><StatusBadge active={user.is_active} t={t} /></td>
                                                <td className="px-5 py-4 text-slate-500">{formatCreatedAt(user.created_at, locale, t)}</td>
                                                <td className="px-5 py-4">
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
                    </>
                )}
            </section>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingUser ? t('users.form.editTitle') : t('users.form.createTitle')} width="max-w-3xl">
                <form onSubmit={handleSubmit(submitUser)} className="space-y-5">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm leading-6 text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-100">{editingUser ? t('users.form.editHint') : t('users.form.createHint')}</div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="sm:col-span-2"><Input id="staff-full-name" label={t('users.form.fullName')} placeholder={t('users.form.fullNamePlaceholder')} error={errors.fullName?.message} {...register('fullName', { required: t('users.form.fullNameRequired'), minLength: { value: 3, message: t('users.form.fullNameLength') } })} /></div>
                                <div className="sm:col-span-2"><Input id="staff-email" type="email" label={t('users.form.email')} placeholder="user@rcms.com" error={errors.email?.message} {...register('email', { required: t('users.form.emailRequired') })} /></div>
                                <div className="sm:col-span-2"><Select label={t('users.form.role')} placeholder={t('users.form.rolePlaceholder')} error={errors.role} {...register('role', { required: t('users.form.roleRequired') })} options={assignableRoles.map(role => ({ value: role, label: roleLabel(role, t) }))} /></div>
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
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">Min 8 chars</span>
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">1 Uppercase (A-Z)</span>
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">1 Lowercase (a-z)</span>
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium dark:bg-slate-800">1 Number (0-9)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">{t('users.form.rolePreview')}</p>
                            {formRoleProfile ? (
                                <div className="mt-4 space-y-4">
                                    <RoleBadge role={formRoleProfile.id} label={roleLabel(formRoleProfile.id, t)} />
                                    <div>
                                        <p className="text-sm font-bold text-slate-950 dark:text-white">{t(`users.groups.${formRoleProfile.group}`)}</p>
                                        <p className="mt-1 text-sm leading-6 text-slate-500">{t(`users.scope.${formRoleProfile.scope}`)}</p>
                                    </div>
                                    <div className="rounded-xl bg-white/80 p-3 dark:bg-slate-900">
                                        <p className="text-xs font-bold text-slate-400">{t('users.form.riskLevel')}</p>
                                        <span className={`mt-2 ${riskClass(formRoleProfile.risk)}`}>{t(`users.risk.${formRoleProfile.risk}`)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">{t('users.form.selectRolePreview')}</div>
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
        </div>
    );
};

const FilterSelect = ({ value, onChange, label, children }) => (
    <select value={value} onChange={event => onChange(event.target.value)} className="h-11 rounded-xl border border-slate-200/60 bg-white/85 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-slate-205 dark:focus:border-cyan-500" aria-label={label}>
        {children}
    </select>
);

const TableHead = ({ children, align = 'start' }) => (
    <th className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[.1em] text-slate-500 ${align === 'end' ? 'text-end' : 'text-start'}`}>{children}</th>
);

const UserIdentity = ({ user, onClick }) => (
    <div
        onClick={onClick}
        className={`flex min-w-0 items-center gap-3 ${onClick ? 'cursor-pointer group' : ''}`}
    >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 font-black text-teal-800 transition group-hover:scale-105 dark:text-teal-300">
            {initials(user.full_name)}
        </span>
        <div className="min-w-0">
            <p className="truncate font-bold text-slate-950 transition group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">{user.full_name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500"><Mail size={13} />{user.email}</p>
        </div>
    </div>
);

const UserMobileCard = ({ user, t, locale, roleProfile = {}, onViewDetails, onEdit, onDelete }) => (
    <article className={`p-5 ${user.is_active ? '' : 'bg-slate-50/70 dark:bg-slate-900/40'}`}>
        <div className="flex items-start justify-between gap-3">
            <UserIdentity user={user} onClick={onViewDetails} />
            <StatusBadge active={user.is_active} t={t} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
            <RoleBadge role={user.role} label={roleLabel(user.role, t)} />
            <span className={riskClass(roleProfile.risk || 'standard')}>{t(`users.risk.${roleProfile.risk || 'standard'}`)}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t(`users.scope.${roleProfile.scope || 'frontDesk'}`)}</p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-400 dark:border-slate-800">
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} />{formatCreatedAt(user.created_at, locale, t)}</span>
            <div className="flex gap-1">
                <IconButton label={t('users.actions.viewDetails', 'View Details & Movements')} icon={Eye} onClick={onViewDetails} tone="teal" />
                <IconButton label={t('users.actions.copyEmail')} icon={Copy} onClick={() => copyText(user.email, t)} tone="slate" disabled={!user.email} />
                <IconButton label={t('users.actions.edit')} icon={Edit2} onClick={onEdit} tone="cyan" />
                <IconButton label={t('users.actions.delete')} icon={Trash2} onClick={onDelete} tone="rose" />
            </div>
        </div>
    </article>
);

const RoleBadge = ({ role, label, compact = false }) => {
    const Icon = ROLE_CATALOG.find(item => item.id === role)?.icon || Shield;
    const style = {
        Admin: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400',
        Developer: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
        Radiologist: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400',
        Technician: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
        Nurse: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
        Receptionist: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
        Cashier: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
        Accountant: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
        Insurance_Staff: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
        HR: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:text-fuchsia-400',
        Marketing: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
    }[role] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style}`}><Icon size={compact ? 12 : 13} />{label}</span>;
};

const StatusBadge = ({ active, t }) => <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{active ? <CheckCircle2 size={13} /> : <UserX size={13} />}{active ? t('users.status.active') : t('users.status.disabled')}</span>;

const IconButton = ({ label, icon: Icon, onClick, tone, disabled = false }) => <button type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled} className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 ${tone === 'rose' ? 'hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-rose-300 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 dark:focus-visible:ring-rose-800' : tone === 'slate' ? 'hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:focus-visible:ring-slate-700' : 'hover:bg-cyan-50 hover:text-cyan-800 focus-visible:ring-cyan-300 dark:hover:bg-cyan-900/30 dark:hover:text-cyan-400 dark:focus-visible:ring-cyan-800'}`}><Icon size={16} /></button>;

const riskClass = (risk) => {
    const classes = {
        critical: 'inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
        sensitive: 'inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
        standard: 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'
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
    return `Rcms${number}${suffix}A`;
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
