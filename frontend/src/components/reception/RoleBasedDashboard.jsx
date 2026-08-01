import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LayoutGrid,
    UsersRound,
    CircleDollarSign,
    WalletCards,
    ShieldCheck,
    Settings,
    ClipboardCheck,
    CheckCircle2,
    TrendingUp,
    BarChart3,
    PieChart,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser, selectIsAuthenticated } from '../../store/authSlice';
import { buildPermissionModel } from './receptionLogic';

const ROLE_DASHBOARD_CONFIG = {
    cashier: {
        icon: CircleDollarSign,
        color: 'emerald',
        tabs: ['cashier', 'billing'],
        quickActions: ['openShift', 'collectPayment', 'reconcileDrawer'],
    },
    receptionist: {
        icon: UsersRound,
        color: 'blue',
        tabs: ['schedule', 'patients'],
        quickActions: ['bookAppointment', 'registerPatient', 'viewQueue'],
    },
    doctor: {
        icon: ShieldCheck,
        color: 'violet',
        tabs: ['schedule', 'patients'],
        quickActions: ['viewSchedule', 'reviewResults', 'approveBilling'],
    },
    admin: {
        icon: Settings,
        color: 'slate',
        tabs: ['schedule', 'patients', 'cashier', 'billing'],
        quickActions: ['manageShifts', 'viewAuditLog', 'manageQueue', 'configureSettings'],
    },
};

const RoleBasedDashboard = ({ activeTab, onTabChange, t }) => {
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const permissions = useMemo(() => buildPermissionModel(user), [user]);

    const roleConfig = useMemo(() => {
        const role = user?.role?.toLowerCase();
        return ROLE_DASHBOARD_CONFIG[role] || ROLE_DASHBOARD_CONFIG.receptionist;
    }, [user?.role]);

    const RoleIcon = roleConfig.icon;
    const roleColorMap = {
        emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800',
        blue: 'bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:ring-teal-800',
        violet: 'bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:ring-cyan-800',
        slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    };

    const roleColorClass = roleColorMap[roleConfig.color] || roleColorMap.slate;

    const quickActionIcons = {
        openShift: ClipboardCheck,
        collectPayment: CircleDollarSign,
        reconcileDrawer: WalletCards,
        bookAppointment: LayoutGrid,
        registerPatient: UsersRound,
        viewQueue: BarChart3,
        viewSchedule: TrendingUp,
        reviewResults: BarChart3,
        approveBilling: CheckCircle2,
        manageShifts: ClipboardCheck,
        viewAuditLog: PieChart,
        manageQueue: LayoutGrid,
        configureSettings: Settings,
    };

    return (
        <div className="rounded-none border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={t('dashboard.roleBasedUI', { defaultValue: 'Role-Based Dashboard' })}>
            <div className="flex items-center gap-3 mb-4">
                <span className={`flex h-10 w-10 items-center justify-center rounded-none ring-1 ${roleColorClass}`}>
                    <RoleIcon size={20} />
                </span>
                <div>
                    <h3 className="text-sm font-black text-slate-950 dark:text-white">
                        {t('dashboard.welcome', { defaultValue: 'Welcome, {{name}}' }, { name: user?.name || user?.fullName || t('fallback.staff') })}
                    </h3>
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        {t('dashboard.role', { defaultValue: 'Role:' })} {user?.role || 'Staff'}
                    </p>
                </div>
            </div>

            <div className="mb-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {t('dashboard.availableTabs', { defaultValue: 'Available Tabs' })}
                </p>
                <div className="flex flex-wrap gap-2">
                    {roleConfig.tabs.map((tabId) => {
                        const TabIcon = roleConfig.tabs.includes('cashier') && tabId === 'cashier'
                            ? CircleDollarSign
                            : roleConfig.tabs.includes('billing') && tabId === 'billing'
                                ? WalletCards
                                : roleConfig.tabs.includes('patients') && tabId === 'patients'
                                    ? UsersRound
                                    : LayoutGrid;
                        const isActive = activeTab === tabId;
                        return (
                            <button
                                key={tabId}
                                type="button"
                                onClick={() => onTabChange(tabId)}
                                className={`inline-flex items-center gap-1.5 rounded-none px-3 py-2 text-[10px] font-bold transition ${
                                    isActive
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                            >
                                <TabIcon size={12} />
                                {t(`tabs.${tabId}`, { defaultValue: tabId })}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {t('dashboard.quickActions', { defaultValue: 'Quick Actions' })}
                </p>
                <div className="space-y-2">
                    {roleConfig.quickActions.map((actionId) => {
                        const ActionIcon = quickActionIcons[actionId] || Settings;
                        return (
                            <button
                                key={actionId}
                                type="button"
                                className="flex w-full items-center gap-3 rounded-none border border-slate-100 bg-white/60 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                            >
                                <ActionIcon size={14} className="text-slate-400" />
                                {t(`dashboard.actions.${actionId}`, { defaultValue: actionId.replace(/([A-Z])/g, ' $1').trim() })}
                            </button>
                        );
                    })}
                </div>
            </div>

            {permissions.canProcessPayments && (
                <div className="mt-4 rounded-none border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        {t('dashboard.paymentAccess', { defaultValue: 'You have payment processing access' })}
                    </p>
                </div>
            )}
        </div>
    );
};

export default RoleBasedDashboard;
