import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
    X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useGetOrganizationStaffQuery, useCreateOrganizationStaffMutation } from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { formatShortDate } from '../../utils/dateFormat';

const ROLES = ['Developer', 'Admin', 'Radiologist', 'Nurse', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Insurance_Staff'];

const ROLE_COLORS = {
    Developer: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
    Admin: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950',
    Radiologist: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:ring-cyan-900/60',
    Nurse: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
    Receptionist: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/60',
    Cashier: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60',
    Accountant: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60',
    HR: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60',
    Technician: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-900/60',
    Insurance_Staff: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
};

const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-teal-400 dark:focus:ring-teal-400';

const initials = name => (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

const roleLabel = role => String(role || '').replace(/_/g, ' ');

const TeamSettings = () => {
    const { t } = useTranslation(['settings', 'common']);
    const currentUser = useSelector(selectCurrentUser);
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
    const inactiveCount = staffList.length - activeCount;
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
        <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('settings.team.summary', 'Team summary')}>
                <Metric label={t('settings.team.totalMembers', 'Total members')} value={staffList.length} detail={t('settings.team.totalMembersDetail', 'Accounts in this workspace')} />
                <Metric label={t('settings.active', 'Active')} value={activeCount} detail={t('settings.team.activeDetail', 'Can sign in and work')} tone="emerald" />
                <Metric label={t('settings.inactive', 'Inactive')} value={inactiveCount} detail={t('settings.team.inactiveDetail', 'Disabled or pending accounts')} tone="slate" />
                <Metric label={t('settings.team.rolesInUse', 'Roles in use')} value={roleCount} detail={t('settings.team.adminCount', { count: adminCount, defaultValue: `${adminCount} protected admins` })} tone="amber" />
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <header className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Users size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-950 dark:text-white">{t('settings.team.organizationMembers', 'Organization members')}</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {t('settings.team.description', 'Review active accounts, assigned roles, and onboarding status for your workspace.')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-bold text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                    >
                        <UserPlus size={16} aria-hidden="true" />
                        {t('settings.team.addMember', 'Add member')}
                    </button>
                </header>

                <div className="flex flex-col gap-2 border-b border-slate-200 p-3 dark:border-slate-800 lg:flex-row lg:items-center">
                    <label className="relative min-w-[220px] flex-1">
                        <span className="sr-only">{t('settings.team.searchMembers', 'Search members')}</span>
                        <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t('settings.team.searchPlaceholder', 'Search name, email, or role...')}
                            className={`${inputCls} ps-9`}
                        />
                    </label>
                    <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label={t('settings.team.filterRole', 'Filter by role')} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <option value="all">{t('settings.team.allRoles', 'All roles')}</option>
                        {rolesInUse.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                    <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label={t('settings.team.filterStatus', 'Filter by status')} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
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
                            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Search size={20} /></span>
                            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{t('settings.team.noMembers', 'No members found')}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.team.noMembersHint', 'Adjust the search or filters to see more accounts.')}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                                    <Th>{t('settings.team.member', 'Member')}</Th>
                                    <Th>{t('settings.role', 'Role')}</Th>
                                    <Th>{t('settings.status', 'Account')}</Th>
                                    <Th>{t('settings.team.joined', 'Joined')}</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filtered.map(member => (
                                    <tr key={member.user_id || member.email} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="min-w-64 px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                                                    {initials(member.full_name)}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-bold text-slate-950 dark:text-white">{member.full_name || t('settings.team.unnamed', 'Unnamed member')}</p>
                                                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{member.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <RoleBadge role={member.role} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge active={member.is_active} t={t} />
                                        </td>
                                        <td className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            <span className="inline-flex items-center gap-1.5">
                                                <CalendarDays size={13} aria-hidden="true" />
                                                {formatShortDate(member.created_at)}
                                            </span>
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
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">
                                    <Mail size={17} aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="font-black text-slate-950 dark:text-white">{t('settings.team.addMember', 'Add member')}</h2>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('settings.team.addMemberHint', 'Create a staff account with a temporary password.')}</p>
                                </div>
                            </div>
                            <button type="button" onClick={closeModal} aria-label={t('common:close', 'Close')} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                <X size={16} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleInvite} className="space-y-4 p-4">
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
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                                {t('settings.team.passwordHelp', 'Use at least 12 characters and share the temporary password through a secure channel. The user should change it after signing in.')}
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                                <button type="button" onClick={closeModal} disabled={isInviting} className="min-h-10 rounded-lg px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
                                    {t('common:cancel', 'Cancel')}
                                </button>
                                <button type="submit" disabled={!canSubmit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500">
                                    <UserPlus size={15} aria-hidden="true" />
                                    {isInviting ? t('settings.team.sending', 'Creating...') : t('settings.team.createMember', 'Create member')}
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

const Metric = ({ label, value, detail, tone = 'slate' }) => {
    const tones = {
        amber: 'text-amber-700 dark:text-amber-300',
        emerald: 'text-emerald-700 dark:text-emerald-300',
        slate: 'text-slate-950 dark:text-white'
    };
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-2 text-2xl font-black tabular-nums ${tones[tone] || tones.slate}`}>{value}</p>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
    );
};

const Th = ({ children }) => (
    <th className="px-4 py-3 text-start text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
            <div key={item} className="flex items-center gap-4 px-4 py-4">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-2.5 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
            </div>
        ))}
    </div>
);

export default TeamSettings;
