import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    BadgeAlert,
    BadgeCheck,
    CalendarDays,
    Mail,
    Search,
    Shield,
    UserPlus,
    Users,
    X,
    Briefcase,
    ShieldCheck
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useGetOrganizationStaffQuery, useCreateOrganizationStaffMutation } from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { formatShortDate } from '../../utils/dateFormat';

const ROLES = ['Developer', 'Admin', 'Radiologist', 'Nurse', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Insurance_Staff', 'Marketing', 'Referring_Doctor'];

const ROLE_COLORS = {
    Developer: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
    Admin: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950',
    Radiologist: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900/60',
    Nurse: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
    Receptionist: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900/60',
    Cashier: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60',
    Accountant: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60',
    HR: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60',
    Technician: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-900/60',
    Insurance_Staff: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    Marketing: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/60',
    Referring_Doctor: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/60'
};

const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-teal-400 dark:focus:ring-teal-400';

const initials = name => (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

const roleLabel = role => String(role || '').replace(/_/g, ' ');

const TeamSettings = ({ embedded = false }) => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const permissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
    const isSuperUser = ['Developer', 'Admin'].includes(currentUser?.role);
    const canManageUsers = isSuperUser || permissions.includes('MANAGE_USERS');
    const canViewStaff = isSuperUser || permissions.includes('VIEW_STAFF') || currentUser?.role === 'HR';
    const availableRoles = currentUser?.role === 'Developer'
        ? ROLES
        : ROLES.filter(role => !['Developer', 'Admin'].includes(role));

    const { data: staffList = [], isLoading } = useGetOrganizationStaffQuery();
    const [createStaff, { isLoading: isInviting }] = useCreateOrganizationStaffMutation();

    const [showModal, setShowModal] = useState(false);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('Radiologist');
    const [inviteName, setInviteName] = useState('');
    const [tempPassword, setTempPassword] = useState('');

    const activeCount = useMemo(() => staffList.filter(member => member.is_active).length, [staffList]);
    const roleCount = useMemo(() => new Set(staffList.map(member => member.role).filter(Boolean)).size, [staffList]);
    const adminCount = useMemo(() => staffList.filter(member => member.role === 'Admin').length, [staffList]);
    const rolesInUse = useMemo(() => Array.from(new Set(staffList.map(member => member.role).filter(Boolean))).sort(), [staffList]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return staffList.filter(member => {
            if (roleFilter !== 'all' && member.role !== roleFilter) return false;
            if (statusFilter === 'active' && !member.is_active) return false;
            if (statusFilter === 'inactive' && member.is_active) return false;
            if (!query) return true;
            return [member.full_name, member.email, member.role]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }, [roleFilter, search, staffList, statusFilter]);

    const reset = () => {
        setInviteEmail('');
        setInviteName('');
        setTempPassword('');
        setInviteRole(availableRoles.includes('Radiologist') ? 'Radiologist' : availableRoles[0] || '');
    };

    const closeModal = () => {
        setShowModal(false);
        reset();
    };

    const handleInvite = async event => {
        event.preventDefault();
        const fullName = inviteName.trim();
        const email = inviteEmail.trim();
        if (!fullName || !email || tempPassword.length < 12 || !inviteRole) return;

        try {
            await createStaff({ fullName, email, password: tempPassword, role: inviteRole }).unwrap();
            closeModal();
            toast.success(t('settings.team.memberAdded', { name: fullName, defaultValue: `${fullName} has been added to the team.` }));
        } catch (error) {
            toast.error(error?.data?.message || t('settings.team.addFailed', 'Failed to add member'));
        }
    };

    const canSubmit = inviteName.trim() && inviteEmail.trim() && tempPassword.length >= 12 && inviteRole && !isInviting;

    return (
        <div className={embedded ? 'space-y-5 pb-0' : 'mx-auto max-w-7xl space-y-6 pb-10'}>
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Users size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Shield size={11} />
                                    <span>{t('settings.team.eyebrow')}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    {t('settings.team.activeTotal', { active: activeCount, total: staffList.length })}
                                </span>
                            </div>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('settings.team.organizationMembers', 'Organization Staff & Team Roster')}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.team.description', 'Review active clinical accounts, assigned security roles, and user onboarding access across your radiology center.')}
                            </p>
                        </div>
                    </div>

                    {canManageUsers && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowModal(true)}
                                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500"
                            >
                                <UserPlus size={14} />
                                <span>{t('settings.team.addMember', 'Add Team Member')}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Telemetry Facts HUD */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-100/80 px-4 py-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Users size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('settings.team.totalAccounts')}</p>
                            <p className="font-mono text-base font-black text-slate-900 dark:text-white">{staffList.length}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-emerald-800 dark:text-emerald-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <BadgeCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">{t('settings.team.activeStaff')}</p>
                            <p className="font-mono text-base font-black text-emerald-900 dark:text-white">{activeCount}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-sky-800 dark:text-sky-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Shield size={16} className="text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">{t('settings.team.rolesInUse')}</p>
                            <p className="font-mono text-base font-black text-sky-900 dark:text-white">{t('settings.team.activeRolesCount', { number: roleCount })}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-amber-800 dark:text-amber-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <BadgeAlert size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">{t('settings.team.superadmins')}</p>
                            <p className="font-mono text-base font-black text-amber-900 dark:text-white">{t('settings.team.protectedCount', { number: adminCount })}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Staff Table Section */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <header className="flex flex-col gap-4 border-b border-slate-200/80 p-6 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                            <Users size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-slate-950 dark:text-white">{t('settings.team.organizationMembers', 'Staff Registry & Permissions')}</h2>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {t('settings.team.description', 'Search, filter, and inspect user credentials and privileges.')}
                            </p>
                        </div>
                    </div>
                </header>

                <div className="flex flex-col gap-3 border-b border-slate-200/80 p-4 dark:border-slate-800 sm:flex-row sm:items-center bg-slate-50/50 dark:bg-slate-955/40">
                    <label className="relative min-w-[240px] flex-1">
                        <span className="sr-only">{t('settings.team.searchMembers', 'Search members')}</span>
                        <Search size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t('settings.team.searchPlaceholder', 'Search name, email, or role...')}
                            className={`${inputCls} ps-10`}
                        />
                    </label>
                    <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label={t('settings.team.filterRole', 'Filter by role')} className="h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <option value="all">{t('settings.team.allRoles', 'All roles')}</option>
                        {rolesInUse.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                    <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label={t('settings.team.filterStatus', 'Filter by status')} className="h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <option value="all">{t('settings.team.allStatuses', 'All statuses')}</option>
                        <option value="active">{t('settings.active', 'Active')}</option>
                        <option value="inactive">{t('settings.inactive', 'Inactive')}</option>
                    </select>
                </div>

                <div className="min-h-[280px] overflow-x-auto">
                    {isLoading ? (
                        <LoadingRows />
                    ) : filtered.length === 0 ? (
                        <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-12 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs"><Search size={22} /></span>
                            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{t('settings.team.noMembers', 'No members found')}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.team.noMembersHint', 'Adjust the search or filters to see more accounts.')}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/70">
                                    <Th>{t('settings.team.member', 'Member')}</Th>
                                    <Th>{t('settings.role', 'Role')}</Th>
                                    <Th>{t('settings.status', 'Account')}</Th>
                                    <Th>{t('settings.team.joined', 'Joined')}</Th>
                                    <Th className="text-end">{t('common.actions', 'Actions')}</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filtered.map(member => (
                                    <tr key={member.user_id || member.email} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                        <td className="min-w-64 px-6 py-4">
                                            <div className="flex items-center gap-3.5">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-xs font-black text-teal-800 dark:text-teal-200 ring-1 ring-teal-500/30 shadow-2xs">
                                                    {initials(member.full_name)}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-bold text-slate-950 dark:text-white">{member.full_name || t('settings.team.unnamed', 'Unnamed member')}</p>
                                                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{member.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <RoleBadge role={member.role} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge active={member.is_active} t={t} />
                                        </td>
                                        <td className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            <span className="inline-flex items-center gap-1.5">
                                                <CalendarDays size={13} aria-hidden="true" />
                                                {formatShortDate(member.created_at)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-end">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {canManageUsers && member.user_id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/users/${member.user_id}`)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                                                        title={isAr ? 'إدارة حساب الدخول والأمان (IAM)' : 'Manage IAM Account & Security'}
                                                    >
                                                        <ShieldCheck size={13} className="text-teal-600 dark:text-teal-400" />
                                                        <span>{isAr ? 'حساب الدخول' : 'IAM'}</span>
                                                    </button>
                                                )}
                                                {canViewStaff && (
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate('/hr?tab=directory')}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                                                        title={isAr ? 'الملف الوظيفي بالموارد البشرية (HR)' : 'View HR Employment Profile'}
                                                    >
                                                        <Briefcase size={13} className="text-cyan-600 dark:text-cyan-400" />
                                                        <span>{isAr ? 'الموارد البشرية' : 'HR'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {showModal && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/95">
                        <div className="flex items-center justify-between border-b border-slate-200/80 p-6 dark:border-slate-800">
                            <div className="flex min-w-0 items-center gap-3.5">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                                    <Mail size={18} aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="font-black text-slate-950 dark:text-white text-base">{t('settings.team.addMember', 'Add Team Member')}</h2>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('settings.team.addMemberHint', 'Create a staff account with a temporary password.')}</p>
                                </div>
                            </div>
                            <button type="button" onClick={closeModal} aria-label={t('common:close', 'Close')} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleInvite} className="space-y-4 p-6">
                            <Field label={t('settings.fullName', 'Full name')}>
                                <input required value={inviteName} onChange={event => setInviteName(event.target.value)} placeholder={t('settings.team.namePlaceholder', 'Dr. Jane Smith')} className={inputCls} />
                            </Field>
                            <Field label={t('settings.email', 'Email')}>
                                <input type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="jane@clinic.com" className={`${inputCls} ltr`} dir="ltr" />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t('settings.role', 'Role')}>
                                    <select value={inviteRole} onChange={event => setInviteRole(event.target.value)} className={inputCls}>
                                        {availableRoles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                                    </select>
                                </Field>
                                <Field label={t('settings.team.temporaryPassword', 'Temporary password')}>
                                    <input type="password" required minLength={12} autoComplete="new-password" value={tempPassword} onChange={event => setTempPassword(event.target.value)} className={`${inputCls} ltr`} dir="ltr" />
                                </Field>
                            </div>
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                                {t('settings.team.passwordHelp', 'Use at least 12 characters and share the temporary password through a secure channel. The user should change it after signing in.')}
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                                <button type="button" onClick={closeModal} disabled={isInviting} className="min-h-10 rounded-xl px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
                                    {t('common:cancel', 'Cancel')}
                                </button>
                                <button type="submit" disabled={!canSubmit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50">
                                    <UserPlus size={15} aria-hidden="true" />
                                    <span>{isInviting ? t('settings.team.sending', 'Creating...') : t('settings.team.createMember', 'Create member')}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const Th = ({ children, className = '' }) => (
    <th className={`px-6 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ${className}`}>
        {children}
    </th>
);

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
        {children}
    </label>
);

const RoleBadge = ({ role }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ring-1 ${ROLE_COLORS[role] || ROLE_COLORS.Insurance_Staff}`}>
        {['Developer', 'Admin'].includes(role) ? <Shield size={12} aria-hidden="true" /> : null}
        {roleLabel(role)}
    </span>
);

const StatusBadge = ({ active, t }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ring-1 ${active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60' : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'}`}>
        {active ? <BadgeCheck size={14} aria-hidden="true" /> : <BadgeAlert size={14} aria-hidden="true" />}
        {active ? t('settings.active', 'Active') : t('settings.inactive', 'Inactive')}
    </span>
);

const LoadingRows = () => (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {[1, 2, 3, 4].map(item => (
            <div key={item} className="flex items-center gap-4 px-6 py-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-2.5 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
            </div>
        ))}
    </div>
);

export default TeamSettings;
