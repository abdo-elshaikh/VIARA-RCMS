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
    CalendarOff,
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
import { VIARA_BRAND } from '../../config/brand';

const CATEGORY_STYLES = {
    clinical: {
        activeBg: 'border-white/15 bg-white/10 text-white shadow-sm dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-[var(--VIARA-ink)]',
        activeIcon: 'bg-[var(--viara-primary)] text-[var(--VIARA-accent-contrast)] shadow-sm dark:bg-[var(--VIARA-accent-soft)] dark:text-[var(--VIARA-accent-text)] dark:ring-1 dark:ring-[rgba(var(--VIARA-accent-rgb),.24)]',
        activeBar: 'bg-[var(--viara-primary)]',
        badge: 'bg-[var(--viara-primary-light)] text-[var(--viara-primary-dark)] ring-1 ring-white/10 dark:bg-[var(--VIARA-accent-soft)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),.22)]',
        groupTag: 'text-emerald-100/70 dark:text-[var(--VIARA-muted)]'
    },
    management: {
        activeBg: 'border-white/15 bg-white/10 text-white shadow-sm dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-[var(--VIARA-ink)]',
        activeIcon: 'bg-[var(--viara-primary)] text-[var(--VIARA-accent-contrast)] shadow-sm dark:bg-[var(--VIARA-accent-soft)] dark:text-[var(--VIARA-accent-text)] dark:ring-1 dark:ring-[rgba(var(--VIARA-accent-rgb),.24)]',
        activeBar: 'bg-[var(--viara-primary)]',
        badge: 'bg-[var(--viara-primary-light)] text-[var(--viara-primary-dark)] ring-1 ring-white/10 dark:bg-[var(--VIARA-accent-soft)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),.22)]',
        groupTag: 'text-emerald-100/70 dark:text-[var(--VIARA-muted)]'
    },
    reports: {
        activeBg: 'border-amber-300/25 bg-amber-300/[.12] text-white shadow-sm dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-[var(--VIARA-ink)]',
        activeIcon: 'bg-[var(--viara-amber)] text-[var(--text-primary)] shadow-sm dark:bg-[var(--warning-bg)] dark:text-[var(--warning)] dark:ring-1 dark:ring-amber-400/20',
        activeBar: 'bg-[var(--viara-amber)]',
        badge: 'bg-[var(--viara-amber-light)] text-amber-800 ring-1 ring-amber-200/30 dark:bg-[var(--warning-bg)] dark:text-[var(--warning)] dark:ring-amber-400/20',
        groupTag: 'text-amber-100/80 dark:text-[var(--VIARA-muted)]'
    },
    system: {
        activeBg: 'border-white/15 bg-white/10 text-white shadow-sm dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-[var(--VIARA-ink)]',
        activeIcon: 'bg-[var(--info)] text-white shadow-sm dark:bg-[var(--info-bg)] dark:text-[var(--info)] dark:ring-1 dark:ring-cyan-400/20',
        activeBar: 'bg-[var(--info)]',
        badge: 'bg-[var(--info-bg)] text-[var(--info)] ring-1 ring-white/10 dark:ring-cyan-400/20',
        groupTag: 'text-emerald-100/70 dark:text-[var(--VIARA-muted)]'
    }
};

const ICONS = { Activity, Banknote, Bell, Briefcase, Calendar, CalendarOff, ClipboardCheck, ClipboardList, FileBarChart, HelpCircle, LayoutDashboard, Megaphone, MessageSquare, Monitor, Package, Settings, ShieldCheck, TrendingUp, UserCircle, Users };
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
    const brandInitials = String(centerSettings.center_name || VIARA_BRAND.name).trim().slice(0, 4).toUpperCase();
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
        <aside className="app-sidebar-panel relative flex h-full flex-col overflow-visible border-e border-white/10 bg-[linear-gradient(180deg,#063E30,#0B1F1A)] text-emerald-50 transition-all duration-300 select-none dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-canvas)] dark:text-[var(--VIARA-ink)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(var(--VIARA-accent-rgb),.09),transparent_72%)] opacity-0 dark:opacity-100" />
            {/* Header / Brand Section */}
            <div className={`relative flex h-[76px] shrink-0 items-center border-b border-white/10 bg-[linear-gradient(180deg,#063E30,#0B1F1A)] text-white transition-all duration-300 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
                <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                    <div className="relative flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-xl bg-white text-[var(--viara-primary-dark)] shadow-md shadow-black/20 ring-1 ring-white/25 transition-transform duration-300 hover:scale-105 dark:bg-[var(--VIARA-surface-muted)] dark:text-[var(--VIARA-accent-text)] dark:shadow-none dark:ring-[var(--VIARA-line)]">
                        {centerSettings.logo_url ? (
                            <img src={centerSettings.logo_url} alt="" className="h-7 w-7 rounded-lg object-contain" />
                        ) : (
                            <span className="text-xs font-black tracking-wider">{brandInitials}</span>
                        )}
                        <span className="absolute -bottom-0.5 -end-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[var(--VIARA-surface)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        </span>
                    </div>

                    {!isCollapsed && (
                        <div className="min-w-0 animate-in fade-in slide-in-from-start-3 duration-300">
                            <h1 className="truncate text-sm font-bold tracking-tight text-white dark:text-[var(--VIARA-ink)]">
                                {centerSettings.center_name || t('app.name', { ns: 'common', defaultValue: VIARA_BRAND.name })}
                            </h1>
                            <p className={`truncate text-[10px] font-bold text-emerald-100/80 dark:text-[var(--VIARA-muted)] ${isRtl ? 'tracking-normal' : 'uppercase tracking-[.12em]'}`}>
                                {centerSettings.branch_name || t('app.tagline', { ns: 'common', defaultValue: VIARA_BRAND.tagline })}
                            </p>
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    ref={closeButtonRef}
                    onClick={onCloseMobile}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-[var(--VIARA-ink)] lg:hidden"
                    aria-label={t('actions.close', { ns: 'common' })}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Navigation Body */}
            <nav className={`app-sidebar-scroll relative flex-1 overflow-y-auto px-3 py-3 ${isCollapsed ? 'space-y-2' : 'space-y-4'}`} aria-label={t('aria.mainNavigation')}>
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
                        <div key={group.key} className="space-y-1">
                            {!isCollapsed && (
                                <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                                    <span className={`shrink-0 text-[10px] font-extrabold ${isRtl ? 'tracking-normal' : 'uppercase tracking-[0.14em]'} ${categoryStyle.groupTag}`}>
                                        {group.group}
                                    </span>
                                    <span aria-hidden="true" className="h-px flex-1 bg-white/10 dark:bg-[var(--VIARA-line)]" />
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
                                                group relative flex min-h-11 items-center gap-3 overflow-visible rounded-xl border px-3 py-2 text-[13px] font-semibold transition-[background-color,border-color,color,transform] duration-150
                                                ${isActive
                                                    ? categoryStyle.activeBg
                                                    : 'border-transparent text-emerald-50/70 hover:border-white/10 hover:bg-white/[.08] hover:text-white dark:text-[var(--VIARA-muted)] dark:hover:border-[var(--VIARA-line)] dark:hover:bg-[var(--VIARA-surface)] dark:hover:text-[var(--VIARA-ink)]'}
                                                ${isCollapsed ? 'justify-center' : 'justify-start'}
                                            `}
                                            title={isCollapsed ? item.label : undefined}
                                            aria-label={item.label}
                                        >
                                            {({ isActive }) => (
                                                <>
                                                    {/* Active side indicator pill */}
                                                    <div
                                                        className={`absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 ${activeBarRadius} transition-all duration-200 ${categoryStyle.activeBar} ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                                                    />

                                                    {/* Icon container */}
                                                    <div
                                                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                                                            isActive
                                                                ? categoryStyle.activeIcon
                                                                : 'bg-white/[.08] text-emerald-50/75 group-hover:bg-white/[.12] group-hover:text-white dark:bg-transparent dark:text-[var(--VIARA-muted)] dark:group-hover:bg-[var(--VIARA-surface-muted)] dark:group-hover:text-[var(--VIARA-ink)]'
                                                        }`}
                                                    >
                                                        <item.icon size={17} strokeWidth={isActive ? 2.4 : 1.9} />
                                                        {item.badge && isCollapsed && (
                                                            <span className="absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500 dark:border-[var(--VIARA-canvas)]" />
                                                        )}
                                                    </div>

                                                    {!isCollapsed && (
                                                        <span className="min-w-0 flex-1 truncate leading-5">
                                                            {item.label}
                                                        </span>
                                                    )}

                                                    {!isCollapsed && item.badge && (
                                                        <span className={`ms-auto rounded-full px-2 py-0.5 text-[9px] font-black ${isRtl ? 'tracking-normal' : 'uppercase tracking-wider'} ${categoryStyle.badge}`}>
                                                            {t('badge.new')}
                                                        </span>
                                                    )}

                                                    {/* Collapsed mode popup tooltip (Corrected LTR / RTL direction) */}
                                                    {isCollapsed && (
                                                        <span
                                                            className={`pointer-events-none absolute top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-slate-200/80 bg-slate-900/95 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-[var(--VIARA-ink)] lg:group-hover:block ${collapsedTooltipClass}`}
                                                            role="tooltip"
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
            <div className="relative shrink-0 border-t border-white/10 bg-black/10 p-3 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-canvas)]">
                <div
                    className={`flex items-center rounded-xl border border-white/10 bg-white/[.08] p-2 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-white/20 hover:bg-white/10 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:hover:border-[var(--VIARA-line-strong)] dark:hover:bg-[var(--VIARA-surface-raised)] ${
                        isCollapsed ? 'justify-center' : 'justify-between'
                    }`}
                >
                    <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                        <div className="relative flex h-8 w-8 min-w-[2rem] items-center justify-center rounded-lg bg-white font-bold text-[var(--viara-primary-dark)] shadow-sm ring-1 ring-white/20 dark:bg-[var(--VIARA-surface-muted)] dark:text-[var(--VIARA-accent-text)] dark:shadow-none dark:ring-[var(--VIARA-line)]">
                            <span className="text-xs">{userInitial}</span>
                            <span className="absolute -bottom-0.5 -end-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-[var(--VIARA-surface)]" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-white dark:text-[var(--VIARA-ink)]">
                                    {user?.name || t('common.user', { ns: 'common' })}
                                </p>
                                <p className={`mt-0.5 truncate text-[9px] font-extrabold text-emerald-100/75 dark:text-[var(--VIARA-muted)] ${isRtl ? 'tracking-normal' : 'uppercase tracking-wider'}`}>
                                    {effectiveRole ? t(`roles.${String(effectiveRole).toLowerCase()}`, { ns: 'common', defaultValue: effectiveRole }) : t('common.staff', { ns: 'common' })}
                                </p>
                            </div>
                        )}
                    </div>

                    {!isCollapsed && (
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--danger-bg)] dark:hover:text-[var(--danger)]"
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
                className="absolute -end-[18px] top-5 z-50 hidden h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md ring-2 ring-white/80 transition-all duration-200 hover:scale-105 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:border-[var(--VIARA-line-strong)] dark:bg-[var(--VIARA-surface-raised)] dark:text-[var(--VIARA-muted)] dark:ring-[var(--VIARA-canvas)] dark:hover:border-[var(--VIARA-accent-text)] dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-[var(--VIARA-accent-text)] lg:flex"
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
                            {t('session.signOutTitle', { ns: 'common', defaultValue: `Sign out of ${VIARA_BRAND.name}?` })}
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
