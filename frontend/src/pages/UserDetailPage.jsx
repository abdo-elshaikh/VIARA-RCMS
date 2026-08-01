import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    User,
    Shield,
    Activity,
    Mail,
    Phone,
    Clock,
    Key,
    CheckCircle2,
    XCircle,
    ArrowLeft,
    AlertTriangle,
    Save,
    RefreshCw,
    Search,
    Lock,
    ShieldAlert,
    ShieldCheck,
    ClipboardCheck,
    UsersRound,
    Briefcase,
    Sparkles,
    Calendar,
    Globe,
    Layers,
    FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetStaffQuery,
    useUpdateStaffMutation,
    useGetAuditLogsQuery
} from '../store/api';
import { Button, MetricCard, Skeleton, EmptyState } from '../components/ui';
import { getErrorMessage } from '../utils/getErrorMessage';

const ROLE_OPTIONS = [
    { id: 'Admin', label: 'Administrator', risk: 'critical', tone: 'violet', icon: ShieldAlert },
    { id: 'Radiologist', label: 'Radiologist (Doctor)', risk: 'sensitive', tone: 'cyan', icon: ClipboardCheck },
    { id: 'Technician', label: 'Radiology Technician', risk: 'sensitive', tone: 'amber', icon: Activity },
    { id: 'Nurse', label: 'Clinical Nurse', risk: 'standard', tone: 'emerald', icon: CheckCircle2 },
    { id: 'Receptionist', label: 'Front Desk Receptionist', risk: 'sensitive', tone: 'blue', icon: UsersRound },
    { id: 'Cashier', label: 'Billing Cashier', risk: 'sensitive', tone: 'indigo', icon: Briefcase },
    { id: 'Accountant', label: 'Finance Accountant', risk: 'critical', tone: 'indigo', icon: Briefcase },
    { id: 'Insurance_Staff', label: 'Insurance Coordinator', risk: 'sensitive', tone: 'sky', icon: ShieldCheck },
    { id: 'HR', label: 'Human Resources', risk: 'critical', tone: 'fuchsia', icon: Key },
    { id: 'Marketing', label: 'Marketing & CRM', risk: 'standard', tone: 'emerald', icon: Sparkles }
];

export default function UserDetailPage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation('admin');
    const isRtl = i18n.language === 'ar';

    const { data: staffList = [], isLoading: isStaffLoading, refetch: refetchStaff } = useGetStaffQuery();
    const [updateStaff, { isLoading: isUpdating }] = useUpdateStaffMutation();

    const user = useMemo(() => {
        return staffList.find(u => String(u.user_id) === String(userId));
    }, [staffList, userId]);

    // System Movements / Audit Logs
    const { data: auditData, isLoading: isAuditLoading, refetch: refetchAudit } = useGetAuditLogsQuery({
        userId: String(userId),
        limit: 100
    });

    const logs = auditData?.logs || (Array.isArray(auditData) ? auditData : []);

    const [activeTab, setActiveTab] = useState('movements'); // 'movements' | 'security'
    const [searchTerm, setSearchTerm] = useState('');

    // Role & Security Form State
    const [selectedRole, setSelectedRole] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [newPassword, setNewPassword] = useState('');

    React.useEffect(() => {
        if (user) {
            setSelectedRole(user.role || 'Receptionist');
            setIsActive(user.is_active ?? true);
        }
    }, [user]);

    if (isStaffLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="p-6 text-center">
                <EmptyState
                    icon={User}
                    title={t('users.notFound', 'User Not Found')}
                    description={t('users.notFoundDesc', 'The requested user account does not exist or has been removed.')}
                />
                <Button className="mt-4" onClick={() => navigate('/users')}>
                    <ArrowLeft size={16} className="me-2" />
                    {t('common.back', 'Back to Users')}
                </Button>
            </div>
        );
    }

    const filteredLogs = logs.filter(log => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (log.action && log.action.toLowerCase().includes(term)) ||
            (log.resource_table && log.resource_table.toLowerCase().includes(term)) ||
            (log.ip_address && log.ip_address.includes(term)) ||
            (log.details && JSON.stringify(log.details).toLowerCase().includes(term))
        );
    });

    const handleSaveRoleAndPermissions = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                role: selectedRole,
                isActive: isActive
            };
            if (newPassword && newPassword.length >= 6) {
                payload.password = newPassword;
            }

            await updateStaff({
                id: user.user_id,
                ...payload
            }).unwrap();

            toast.success(t('users.updateSuccess', 'User security profile & permissions updated successfully'));
            setNewPassword('');
            refetchStaff();
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const roleInfo = ROLE_OPTIONS.find(r => r.id === (user.role || selectedRole)) || ROLE_OPTIONS[0];

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            {/* Top Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <ArrowLeft size={16} className={isRtl ? 'rotate-180' : ''} />
                    <span>{t('common.back', 'Back')}</span>
                </button>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { refetchStaff(); refetchAudit(); }}
                    >
                        <RefreshCw size={14} className="me-1.5" />
                        {t('common.refresh', 'Refresh')}
                    </Button>
                </div>
            </div>

            {/* Main Header Card */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#08101e]">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-5">
                        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-2xl font-black uppercase text-white shadow-lg shadow-teal-500/20">
                            {user.full_name ? user.full_name.slice(0, 2) : 'US'}
                            <span className={`absolute -bottom-1 -end-1 h-5 w-5 rounded-full border-2 border-white dark:border-[#08101e] ${user.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{user.full_name}</h1>
                                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-extrabold uppercase tracking-wide ${
                                    user.is_active
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                }`}>
                                    {user.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                    {user.is_active ? t('status.active', 'Active') : t('status.inactive', 'Inactive')}
                                </span>
                            </div>

                            <p className="mt-1 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1">
                                    <Mail size={14} className="text-teal-600 dark:text-teal-400" />
                                    {user.email}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Shield size={14} className="text-purple-600 dark:text-purple-400" />
                                    {user.role}
                                </span>
                                {user.created_at && (
                                    <span className="flex items-center gap-1">
                                        <Calendar size={14} className="text-slate-400" />
                                        Joined {new Date(user.created_at).toLocaleDateString()}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/communications')}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-teal-500/20 transition hover:opacity-95"
                        >
                            <Mail size={16} />
                            <span>{t('users.sendMessage', 'Send Message')}</span>
                        </button>
                    </div>
                </div>

                {/* Metric Strip */}
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-200/80 pt-6 dark:border-slate-800 sm:grid-cols-4">
                    <MetricCard
                        title={t('users.totalLogs', 'System Actions')}
                        value={logs.length}
                        icon={Activity}
                        color="teal"
                    />
                    <MetricCard
                        title={t('users.riskLevel', 'Security Risk')}
                        value={roleInfo.risk.toUpperCase()}
                        icon={ShieldAlert}
                        color={roleInfo.risk === 'critical' ? 'red' : 'purple'}
                    />
                    <MetricCard
                        title={t('users.accountStatus', 'Account Status')}
                        value={user.is_active ? 'Active' : 'Disabled'}
                        icon={user.is_active ? User : Lock}
                        color={user.is_active ? 'green' : 'red'}
                    />
                    <MetricCard
                        title={t('users.userRole', 'Assigned Role')}
                        value={user.role}
                        icon={roleInfo.icon}
                        color="cyan"
                    />
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex select-none items-center gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('movements')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                        activeTab === 'movements'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                            : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-[#08101e] dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Activity size={16} />
                    <span>{t('users.systemMovements', 'System Movements & Audit Log')}</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.2 text-[10px]">{logs.length}</span>
                </button>

                <button
                    onClick={() => setActiveTab('security')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                        activeTab === 'security'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                            : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-[#08101e] dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Shield size={16} />
                    <span>{t('users.rolesPermissions', 'Roles & Permissions Management')}</span>
                </button>
            </div>

            {/* Tab 1: System Movements / Audit Log */}
            {activeTab === 'movements' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#08101e]">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t('users.searchLogs', 'Search movements by action, table, or IP...')}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 ps-9 pe-4 py-2 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-[#0b1426] dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#08101e]">
                        {isAuditLoading ? (
                            <div className="p-6 space-y-3">
                                <Skeleton className="h-10 w-full rounded-xl" />
                                <Skeleton className="h-10 w-full rounded-xl" />
                                <Skeleton className="h-10 w-full rounded-xl" />
                            </div>
                        ) : filteredLogs.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Activity size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('users.noMovements', 'No system movements logged for this user yet.')}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-200/80 bg-slate-50/80 font-extrabold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                                        <tr>
                                            <th className="p-3.5 text-start">Timestamp</th>
                                            <th className="p-3.5 text-start">Action</th>
                                            <th className="p-3.5 text-start">Resource Table</th>
                                            <th className="p-3.5 text-start">IP Address</th>
                                            <th className="p-3.5 text-start">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/80 font-semibold text-slate-700 dark:divide-slate-800 dark:text-slate-300">
                                        {filteredLogs.map((log, i) => (
                                            <tr key={log.log_id || i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                <td className="p-3.5 whitespace-nowrap text-[11px] font-bold text-slate-500">
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                                                </td>
                                                <td className="p-3.5 whitespace-nowrap">
                                                    <span className="inline-flex rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-black uppercase text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                                    {log.resource_table || '—'}
                                                </td>
                                                <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                                                    {log.ip_address || '—'}
                                                </td>
                                                <td className="p-3.5 text-slate-600 dark:text-slate-400">
                                                    <pre className="max-w-xs truncate font-mono text-[10px]">
                                                        {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '—')}
                                                    </pre>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tab 2: Role & Permissions Management */}
            {activeTab === 'security' && (
                <form onSubmit={handleSaveRoleAndPermissions} className="space-y-6">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#08101e]">
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t('users.roleConfig', 'Assigned System Role')}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('users.roleDesc', 'Selecting a role configures global security scopes, navigation menus, and administrative capabilities.')}</p>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {ROLE_OPTIONS.map((r) => {
                                const IconComp = r.icon;
                                const isSelected = selectedRole === r.id;
                                return (
                                    <div
                                        key={r.id}
                                        onClick={() => setSelectedRole(r.id)}
                                        className={`cursor-pointer rounded-xl border p-4 transition ${
                                            isSelected
                                                ? 'border-teal-500 bg-teal-50/50 dark:border-teal-400 dark:bg-teal-950/30'
                                                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                                    <IconComp size={16} />
                                                </div>
                                                <span className="text-xs font-extrabold text-slate-900 dark:text-white">{r.label}</span>
                                            </div>
                                            {isSelected && <CheckCircle2 size={18} className="text-teal-600 dark:text-teal-400" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#08101e]">
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t('users.accountControl', 'Account Status & Access Control')}</h3>
                        
                        <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-between rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <div>
                                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">{t('users.activeToggle', 'Account Active Status')}</h4>
                                    <p className="text-[11px] text-slate-500">{t('users.activeToggleDesc', 'Disabling an account prevents the user from logging in and revokes active API sessions.')}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsActive(!isActive)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        isActive ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                            isActive ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="space-y-2 rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">{t('users.resetPassword', 'Override Account Password')}</h4>
                                <p className="text-[11px] text-slate-500">{t('users.resetPasswordDesc', 'Leave empty unless you explicitly wish to reset the user password.')}</p>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder={t('users.newPasswordPlaceholder', 'Enter new password (min 6 characters)...')}
                                    className="w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-[#0b1426] dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <Button type="submit" disabled={isUpdating}>
                                <Save size={16} className="me-2" />
                                {t('common.saveChanges', 'Save Role & Security Changes')}
                            </Button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}
