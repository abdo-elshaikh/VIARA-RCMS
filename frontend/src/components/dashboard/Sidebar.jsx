import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    Banknote,
    Bell,
    Briefcase,
    Calendar,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    ClipboardCheck,
    FileBarChart,
    HelpCircle,
    LayoutDashboard,
    LogOut,
    Megaphone,
    Monitor,
    Package,
    Settings,
    ShieldCheck,
    TrendingUp,
    UserCircle,
    Users,
    MessageSquare,
    X,
} from 'lucide-react';
import { logOut, selectCurrentUser } from '../../store/authSlice';
import { api, useGetCenterSettingsQuery } from '../../store/api';
import { normalizeCenterSettings } from '../../utils/centerSettings';
import { getNavigationRoutes } from '../../config/routes';

const CATEGORY_STYLES = {
    clinical: {
        activeBg: 'border-teal-500/30 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-teal-500/5 text-teal-900 dark:border-teal-500/40 dark:from-teal-500/25 dark:via-cyan-500/20 dark:to-teal-500/10 dark:text-teal-200 shadow-sm shadow-teal-500/5',
        activeIcon: 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/30 dark:shadow-teal-900/50',
        activeBar: 'bg-gradient-to-b from-teal-400 to-cyan-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]',
        badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 ring-1 ring-teal-200 dark:ring-teal-800/60',
        groupTag: 'text-teal-600/90 dark:text-teal-400/90'
    },
    management: {
        activeBg: 'border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-indigo-500/5 text-violet-900 dark:border-violet-500/40 dark:from-violet-500/25 dark:via-purple-500/20 dark:to-indigo-500/10 dark:text-violet-200 shadow-sm shadow-violet-500/5',
        activeIcon: 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30 dark:shadow-violet-900/50',
        activeBar: 'bg-gradient-to-b from-violet-400 to-indigo-500 shadow-[0_0_8px_rgba(139,92,246,0.6)]',
        badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950/80 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-800/60',
        groupTag: 'text-violet-600/90 dark:text-violet-400/90'
    },
    reports: {
        activeBg: 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 text-amber-900 dark:border-amber-500/40 dark:from-amber-500/25 dark:via-orange-500/20 dark:to-amber-500/10 dark:text-amber-200 shadow-sm shadow-amber-500/5',
        activeIcon: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/30 dark:shadow-amber-900/50',
        activeBar: 'bg-gradient-to-b from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800/60',
        groupTag: 'text-amber-600/90 dark:text-amber-400/90'
    },
    system: {
        activeBg: 'border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-sky-500/10 to-blue-500/5 text-blue-900 dark:border-blue-500/40 dark:from-blue-500/25 dark:via-sky-500/20 dark:to-blue-500/10 dark:text-blue-200 shadow-sm shadow-blue-500/5',
        activeIcon: 'bg-gradient-to-br from-blue-600 to-sky-600 text-white shadow-md shadow-blue-500/30 dark:shadow-blue-900/50',
        activeBar: 'bg-gradient-to-b from-blue-400 to-sky-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800/60',
        groupTag: 'text-blue-600/90 dark:text-blue-400/90'
    }
};

const ICONS = { Activity, Banknote, Bell, Briefcase, Calendar, ClipboardCheck, ClipboardList, FileBarChart, HelpCircle, LayoutDashboard, Megaphone, MessageSquare, Monitor, Package, Settings, ShieldCheck, TrendingUp, UserCircle, Users };
const NAVIGATION_ORDER = {
    clinical: ['/dashboard', '/reception', '/communications', '/notifications', '/appointments', '/referring-doctors', '/worklist', '/modality', '/nurse', '/pacs/reconciliation', '/case-reports'],
    management: ['/approvals', '/patients', '/admin', '/financials', '/payroll', '/insurance', '/inventory', '/equipment', '/hr', '/marketing', '/users'],
    reports: ['/analytics'],
    system: ['/settings', '/help'],
};

const Sidebar = ({ role, isCollapsed, toggleCollapse, onCloseMobile, closeButtonRef }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);
    const { t, i18n } = useTranslation(['navigation', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const [isSignOutOpen, setIsSignOutOpen] = useState(false);
    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerSettings = useMemo(() => normalizeCenterSettings(rawCenterSettings), [rawCenterSettings]);
    const effectiveRole = user?.role || role;
    const brandInitials = String(centerSettings.center_name || 'RCMS').trim().slice(0, 4).toUpperCase();
    const userInitial = String(user?.name || effectiveRole || 'U').trim().charAt(0).toUpperCase();

    const navItems = useMemo(() => Object.entries(NAVIGATION_ORDER).map(([key, paths]) => ({
        key,
        group: t(`groups.${key}`),
        items: paths.map((to) => {
            const route = getNavigationRoutes().find((item) => item.to === to);
            return { ...route, icon: ICONS[route.iconId], label: t(`items.${route.key}`, { defaultValue: route.key === 'communications' ? 'Inbox & Chat' : route.key === 'approvals' ? 'Approval Inbox' : undefined }) };
        }),
    })), [t]);

    const handleLogout = () => {
        setIsSignOutOpen(true);
    };

    const confirmLogout = async () => {
        try {
            await dispatch(api.endpoints.logout.initiate()).unwrap();
        } catch (_) {
            // Keep local sign-out reliable even if the API is temporarily unavailable.
        }
        dispatch(logOut());
        setIsSignOutOpen(false);
        navigate('/login');
    };

    const CollapseIcon = isCollapsed
        ? (isRtl ? ChevronLeft : ChevronRight)
        : (isRtl ? ChevronRight : ChevronLeft);

    const collapsedTooltipClass = 'start-[calc(100%+0.75rem)] shadow-lg shadow-black/10 origin-left rtl:origin-right';

    const activeBarRadius = isRtl ? 'rounded-l-full' : 'rounded-r-full';

    return (
        <aside className="relative flex h-full flex-col border-e border-slate-200/70 bg-white/80 backdrop-blur-2xl text-slate-700 transition-all duration-300 dark:border-slate-800/80 dark:bg-[#070e1b]/90 dark:text-slate-300 select-none">
            {/* Header / Brand Section */}
            <div className={`flex h-[72px] shrink-0 items-center border-b border-slate-200/70 bg-slate-50/50 transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/30 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
                <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                    <div className="relative flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-cyan-500/20 ring-1 ring-white/20 transition-transform duration-300 hover:scale-105">
                        {centerSettings.logo_url ? (
                            <img src={centerSettings.logo_url} alt="" className="h-7 w-7 rounded-lg object-contain" />
                        ) : (
                            <span className="text-xs font-black tracking-wider">{brandInitials}</span>
                        )}
                        <span className="absolute -bottom-0.5 -end-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        </span>
                    </div>

                    {!isCollapsed && (
                        <div className="min-w-0 animate-in fade-in slide-in-from-start-3 duration-300">
                            <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                                {centerSettings.center_name || t('app.name', { ns: 'common' })}
                            </h1>
                            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">
                                {centerSettings.branch_name || t('app.tagline', { ns: 'common' })}
                            </p>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    ref={closeButtonRef}
                    onClick={onCloseMobile}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
                    aria-label={t('actions.close', { ns: 'common' })}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Navigation Body */}
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800" aria-label={t('aria.mainNavigation')}>
                {navItems.map((group) => {
                    const categoryStyle = CATEGORY_STYLES[group.key] || CATEGORY_STYLES.clinical;
                    const filteredItems = group.items.filter((item) => {
                        if (item.roles.includes('All')) return true;
                        if (!effectiveRole) return false;
                        if (item.roles.includes(effectiveRole)) return true;
                        return effectiveRole === 'Developer' && item.roles.includes('Admin');
                    });
                    if (filteredItems.length === 0) return null;

                    return (
                        <div key={group.key} className="space-y-1.5">
                            {!isCollapsed && (
                                <div className="flex items-center justify-between px-3 py-1">
                                    <span className={`text-[10px] font-extrabold uppercase tracking-[0.16em] ${categoryStyle.groupTag}`}>
                                        {group.group}
                                    </span>
                                </div>
                            )}
                            <ul className="space-y-1">
                                {filteredItems.map((item) => (
                                    <li key={item.to}>
                                        <NavLink
                                            to={item.to}
                                            onClick={onCloseMobile}
                                            end={item.to === '/dashboard'}
                                            className={({ isActive }) => `
                                                group relative flex min-h-[42px] items-center gap-3 overflow-visible rounded-xl border px-3 py-2 text-xs font-bold transition-all duration-200
                                                ${isActive
                                                    ? categoryStyle.activeBg
                                                    : 'border-transparent text-slate-600 hover:border-slate-200/80 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-800/80 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'}
                                                ${isCollapsed ? 'justify-center' : 'justify-start'}
                                            `}
                                            title={isCollapsed ? item.label : undefined}
                                            aria-label={item.label}
                                        >
                                            {({ isActive }) => (
                                                <>
                                                    {/* Active side indicator pill */}
                                                    <div
                                                        className={`absolute start-0 top-1/2 h-6 w-1.5 -translate-y-1/2 ${activeBarRadius} transition-all duration-300 ${categoryStyle.activeBar} ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                                                    />

                                                    {/* Icon container */}
                                                    <div
                                                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                                                            isActive
                                                                ? categoryStyle.activeIcon
                                                                : 'bg-slate-100/80 text-slate-500 group-hover:bg-white group-hover:text-slate-800 group-hover:shadow-sm dark:bg-slate-800/70 dark:text-slate-400 dark:group-hover:bg-slate-800 dark:group-hover:text-slate-200'
                                                        }`}
                                                    >
                                                        <item.icon size={17} strokeWidth={isActive ? 2.4 : 1.9} />
                                                        {item.badge && isCollapsed && (
                                                            <span className="absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500 dark:border-slate-950" />
                                                        )}
                                                    </div>

                                                    {!isCollapsed && (
                                                        <span className="min-w-0 flex-1 truncate font-semibold">
                                                            {item.label}
                                                        </span>
                                                    )}

                                                    {!isCollapsed && item.badge && (
                                                        <span className={`ms-auto rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${categoryStyle.badge}`}>
                                                            {t('badge.new')}
                                                        </span>
                                                    )}

                                                    {/* Collapsed mode popup tooltip (Corrected LTR / RTL direction) */}
                                                    {isCollapsed && (
                                                        <span
                                                            className={`pointer-events-none absolute top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-slate-200/80 bg-slate-900/95 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 lg:group-hover:block ${collapsedTooltipClass}`}
                                                        >
                                                            {item.label}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* Footer Profile / Session Area */}
            <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-900/30">
                <div
                    className={`flex items-center rounded-xl border border-slate-200/60 bg-white/80 p-2 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700 ${
                        isCollapsed ? 'justify-center' : 'justify-between'
                    }`}
                >
                    <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                        <div className="relative flex h-8 w-8 min-w-[2rem] items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 font-bold text-white shadow-sm ring-1 ring-slate-700/40 dark:from-slate-700 dark:to-slate-900 dark:text-cyan-200">
                            <span className="text-xs">{userInitial}</span>
                            <span className="absolute -bottom-0.5 -end-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {user?.name || t('common.user', { ns: 'common' })}
                                </p>
                                <p className="mt-0.5 truncate text-[9px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                    {effectiveRole || t('common.staff', { ns: 'common' })}
                                </p>
                            </div>
                        )}
                    </div>

                    {!isCollapsed && (
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                            title={t('actions.signOut', { ns: 'common', defaultValue: 'Sign out' })}
                            aria-label={t('actions.signOut', { ns: 'common', defaultValue: 'Sign out' })}
                        >
                            <LogOut size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Sidebar Toggle Expand/Collapse Button */}
            <button
                type="button"
                onClick={toggleCollapse}
                className="absolute -end-[22px] top-5 z-50 hidden h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md ring-2 ring-white/80 transition-all duration-200 hover:scale-105 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-950 dark:hover:border-teal-500 dark:hover:bg-teal-950/50 dark:hover:text-teal-300 lg:flex"
                aria-label={isCollapsed ? t('actions.expandSidebar') : t('actions.collapseSidebar')}
                title={isCollapsed ? t('actions.expandSidebar') : t('actions.collapseSidebar')}
            >
                <CollapseIcon size={13} strokeWidth={2.6} />
            </button>

            {/* Sign Out Confirmation Modal */}
            {isSignOutOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div
                        className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150 dark:border-slate-800 dark:bg-slate-900"
                        dir={isRtl ? 'rtl' : 'ltr'}
                    >
                        <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">
                            {t('session.signOutTitle', { ns: 'common', defaultValue: 'Sign out of RCMS?' })}
                        </h3>
                        <p className="mb-4 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                            {t('session.signOutMessage', { ns: 'common', defaultValue: 'You will need to sign in again to access the workspace.' })}
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSignOutOpen(false)}
                                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {t('actions.cancel', { ns: 'common', defaultValue: 'Cancel' })}
                            </button>
                            <button
                                type="button"
                                onClick={confirmLogout}
                                className="flex-1 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition hover:from-rose-700 hover:to-red-700"
                            >
                                {t('actions.signOut', { ns: 'common', defaultValue: 'Sign Out' })}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </aside>
    );
};

export default Sidebar;
