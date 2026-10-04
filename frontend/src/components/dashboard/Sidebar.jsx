import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
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
    ChevronDown,
    ChevronRight,
    ClipboardList,
    ClipboardCheck,
    FileBarChart,
    HelpCircle,
    LayoutDashboard,
    Lock,
    LogOut,
    Megaphone,
    Monitor,
    Package,
    Search,
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
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getAccessibleNavigationTree } from '../../config/routes';
import { VIARA_BRAND } from '../../config/brand';
import { confirmNavigation } from '../../utils/navigationGuard';
import { useLicense, featureAllowed } from '../../hooks/useLicense';

// Paths that are feature-gated in trial edition
const TRIAL_LOCKED_PATHS = {
    '/financials': 'finance',
    '/payroll': 'hr',
    '/insurance': 'insurance',
    '/hr': 'hr',
    '/analytics': 'analytics',
    '/admin': 'analytics',
    '/inventory': 'inventory',
    '/equipment': 'equipment',
    '/marketing': 'crm',
    '/referring-doctors': 'crm',
    '/approvals': 'finance',
    '/user-activity': 'audit',
    '/pacs/reconciliation': 'pacs',
};

const cx = (...classes) => classes.filter(Boolean).join(' ');

const ICONS = { Activity, Banknote, Bell, Briefcase, Calendar, CalendarOff, ClipboardCheck, ClipboardList, FileBarChart, HelpCircle, LayoutDashboard, Megaphone, MessageSquare, Monitor, Package, Search, Settings, ShieldCheck, TrendingUp, UserCircle, Users };
const NAVIGATION_ORDER = {
    core: ['/dashboard', '/notifications', '/communications'],
    reception: ['/reception', '/appointments', '/patients', '/referring-doctors'],
    clinical: ['/worklist', '/modality', '/nurse', '/pacs/reconciliation', '/case-reports', '/end-of-day'],
    management: ['/approvals', '/financials', '/payroll', '/insurance', '/inventory', '/equipment', '/marketing'],
    governance: ['/hr', '/users', '/user-activity'],
    reports: ['/analytics', '/admin'],
    system: ['/settings', '/display/control', '/help'],
};

const Sidebar = ({ role, isCollapsed, toggleCollapse, onCloseMobile, closeButtonRef }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector(selectCurrentUser);
    const { t, i18n } = useTranslation(['navigation', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const [isSignOutOpen, setIsSignOutOpen] = useState(false);
    const { isTrial, allowedModules } = useLicense();
    const [expandedGroups, setExpandedGroups] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('sidebar-expanded-groups') || '{}');
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch { return {}; }
    });
    const [filterQuery, setFilterQuery] = useState('');
    const [brandLogoFailed, setBrandLogoFailed] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('sidebar-collapsed-sections') || '{}');
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch { return {}; }
    });

    const toggleSectionCollapse = (sectionKey) => {
        setCollapsedSections((current) => {
            const next = { ...current, [sectionKey]: !current[sectionKey] };
            try { localStorage.setItem('sidebar-collapsed-sections', JSON.stringify(next)); } catch { /* Storage is optional. */ }
            return next;
        });
    };

    useEffect(() => {
        for (const [groupKey, paths] of Object.entries(NAVIGATION_ORDER)) {
            if (paths.includes(location.pathname)) {
                setCollapsedSections((prev) => (prev[groupKey] ? { ...prev, [groupKey]: false } : prev));
                break;
            }
        }
    }, [location.pathname]);
    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    useEffect(() => {
        setExpandedGroups((current) => ({ ...current, [location.pathname]: true }));
    }, [location.pathname]);
    const centerSettings = useMemo(() => normalizeCenterSettings(rawCenterSettings), [rawCenterSettings]);
    const centerIdentity = useMemo(
        () => resolveDocumentIdentity(centerSettings, {}, { language: i18n.language }),
        [centerSettings, i18n.language]
    );
    const centerName = centerIdentity.centerName || t('app.name', { ns: 'common', defaultValue: VIARA_BRAND.name });
    const branchName = centerIdentity.branchName || t('app.tagline', { ns: 'common', defaultValue: VIARA_BRAND.tagline });
    const brandLogoUrl = centerIdentity.logoLightUrl || centerIdentity.logoUrl || VIARA_BRAND.lightLogoUrl;
    const effectiveRole = user?.role || role;
    const brandInitials = String(centerName).trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase();
    const userInitial = String(user?.name || effectiveRole || 'U').trim().charAt(0).toUpperCase();

    useEffect(() => {
        setBrandLogoFailed(false);
    }, [brandLogoUrl]);

    const navItems = useMemo(() => {
        const accessibleRoutes = getAccessibleNavigationTree({ ...(user || {}), role: effectiveRole });
        const routesByPath = new Map(accessibleRoutes.map((route) => [route.to, route]));
        return Object.entries(NAVIGATION_ORDER).map(([key, paths]) => ({
            key,
            group: t(`groups.${key}`),
            items: paths.map((to) => routesByPath.get(to)).filter(Boolean).map((route) => ({
                ...route,
                icon: ICONS[route.iconId] || LayoutDashboard,
                label: t(`items.${route.key}`, { defaultValue: route.key === 'communications' ? 'Inbox & Chat' : route.key === 'approvals' ? 'Approval Inbox' : undefined }),
                children: (route.to === '/equipment' ? [] : route.children).map((child) => ({ ...child, label: t(`items.${child.key}`, { defaultValue: child.key }) }))
            })),
        })).filter((group) => group.items.length > 0);
    }, [effectiveRole, t, user]);

    const filteredNavGroups = useMemo(() => {
        const query = filterQuery.trim().toLowerCase();
        return navItems.map((group) => {
            const roleFilteredItems = group.items.filter((item) => {
                if (item.roles.includes('All')) return true;
                if (!effectiveRole) return false;
                if (item.roles.includes(effectiveRole)) return true;
                return effectiveRole === 'Developer' && item.roles.includes('Admin');
            });

            // Attach locked flag for trial-gated nav items
            const itemsWithLockState = roleFilteredItems.map((item) => {
                const requiredFeature = TRIAL_LOCKED_PATHS[item.to];
                const isLocked = isTrial && requiredFeature && !featureAllowed(allowedModules, requiredFeature);
                return isLocked ? { ...item, locked: true } : item;
            });

            if (!query) {
                return { ...group, items: itemsWithLockState };
            }

            const matchingItems = itemsWithLockState.filter((item) => {
                if (item.label?.toLowerCase().includes(query)) return true;
                if (item.children?.some((child) => child.label?.toLowerCase().includes(query))) return true;
                return false;
            });

            return { ...group, items: matchingItems };
        }).filter((group) => group.items.length > 0);
    }, [navItems, effectiveRole, filterQuery, isTrial, allowedModules]);

    const isChildActive = (to) => {
        const [path, query] = to.split('?');
        if (location.pathname !== path) return false;
        return new URLSearchParams(query || '').get('tab') === new URLSearchParams(location.search).get('tab');
    };

    const isGroupExpanded = (item) => expandedGroups[item.to] ?? (location.pathname === item.to);
    const toggleGroup = (item) => {
        setExpandedGroups((current) => {
            const next = { ...current, [item.to]: !isGroupExpanded(item) };
            try { localStorage.setItem('sidebar-expanded-groups', JSON.stringify(next)); } catch { /* Storage is optional. */ }
            return next;
        });
    };

    const handleNavigation = (event, item) => {
        // Let the browser handle new-tab/window gestures without closing this drawer.
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        if (!confirmNavigation()) { event.preventDefault(); return; }
        if (item?.children.length) {
            setExpandedGroups((current) => ({ ...current, [item.to]: true }));
            if (isCollapsed) toggleCollapse?.();
        }
        onCloseMobile?.();
    };

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

    const lockedLabel = t('nav.upgradeRequired', { defaultValue: isRtl ? 'يتطلب ترقية' : 'Upgrade required' });
    const trialHint = t('nav.notInTrial', { defaultValue: isRtl ? 'غير متاح في النسخة التجريبية' : 'Not available in the trial edition' });
    const collapsedTooltipClass = 'start-[calc(100%+0.75rem)]';

    return (
        <div className="app-sidebar-panel viara-sidebar-panel vx-sb relative flex h-full flex-col overflow-visible border-e border-white/10 text-slate-50 select-none dark:text-[var(--VIARA-ink)]">

            {/* Brand */}
            <div className={cx('app-sidebar-header viara-sidebar-header vx-sb-header relative', isCollapsed ? 'justify-center px-0' : 'justify-between ps-4 pe-3')}>
                <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                    <div
                        className="sidebar-brand-mark relative flex h-10 w-10 min-w-10 items-center justify-center rounded-xl p-1.5 border border-white/15 bg-white/10 shadow-md shadow-black/20"
                        title={isCollapsed ? centerName : undefined}
                        role={isCollapsed ? 'img' : undefined}
                        aria-label={isCollapsed ? centerName : undefined}
                        aria-hidden={!isCollapsed}
                    >
                        {brandLogoUrl && !brandLogoFailed ? (
                            <img src={brandLogoUrl} alt="" onError={() => setBrandLogoFailed(true)} className="h-full w-full object-contain" />
                        ) : (
                            <span className="text-base font-black tracking-tight text-white drop-shadow">{brandInitials}</span>
                        )}
                    </div>

                    {!isCollapsed && (
                        <div className="min-w-0 flex-1">
                            <h1 dir="auto" title={centerName} className="sidebar-primary-copy truncate text-start text-[13px] font-extrabold leading-snug text-white tracking-normal">
                                {centerName}
                            </h1>
                            <p dir="auto" title={branchName} className="sidebar-muted-copy truncate text-start text-[11px] font-semibold leading-normal text-white/70">
                                {branchName}
                            </p>
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <button
                        type="button"
                        onClick={toggleCollapse}
                        className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                        title={t('actions.collapseSidebar', { defaultValue: isRtl ? 'تصغير القائمة' : 'Collapse sidebar' })}
                        aria-label={t('actions.collapseSidebar', { defaultValue: isRtl ? 'تصغير القائمة' : 'Collapse sidebar' })}
                    >
                        <CollapseIcon size={14} />
                    </button>
                )}

                <button
                    type="button"
                    ref={closeButtonRef}
                    onClick={onCloseMobile}
                    className="vx-sub-toggle !static lg:hidden"
                    aria-label={t('actions.close', { ns: 'common' })}
                >
                    <X size={20} />
                </button>
            </div>

            {/* Navigation */}
            <nav className={cx('app-sidebar-scroll vx-sb-scroll relative flex-1 overflow-y-auto px-2.5 py-3', isCollapsed ? 'space-y-1' : 'space-y-2')} aria-label={t('aria.mainNavigation')}>
                {!isCollapsed && (
                    <div className="px-2 pt-1 pb-1">
                        <p className="text-[11px] font-extrabold tracking-wider text-white/50">
                            {t('summary.title', { defaultValue: isRtl ? 'مساحة عملك' : 'Your workspace' })}
                        </p>
                    </div>
                )}
                {!isCollapsed && (
                    <div className="relative px-0.5 pb-2">
                        <Search size={14} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                            type="text"
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            placeholder={t('actions.filterPlaceholder', { defaultValue: isRtl ? 'تصفية القائمة السريعة...' : 'Search menu...' })}
                            aria-label={t('actions.filterPlaceholder', { defaultValue: isRtl ? 'تصفية القائمة السريعة...' : 'Search menu...' })}
                            className="vx-sb-search"
                        />
                        {filterQuery ? (
                            <button
                                type="button"
                                onClick={() => setFilterQuery('')}
                                aria-label={t('actions.clear', { ns: 'common', defaultValue: isRtl ? 'مسح' : 'Clear' })}
                                className="absolute end-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        ) : (
                            <kbd className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white/40">
                                /
                            </kbd>
                        )}
                    </div>
                )}

                {filteredNavGroups.map((group, groupIndex) => {
                    const isSectionCollapsed = !filterQuery && Boolean(collapsedSections[group.key]);

                    return (
                        <div key={group.key} className="space-y-0.5">
                            {isCollapsed && groupIndex > 0 && <div className="vx-sb-sep" aria-hidden="true" />}
                            {!isCollapsed && (
                                <button
                                    type="button"
                                    onClick={() => toggleSectionCollapse(group.key)}
                                    className="vx-nav-group group"
                                    aria-expanded={!isSectionCollapsed}
                                    aria-controls={`group-content-${group.key}`}
                                    title={isSectionCollapsed ? t('actions.expandGroup') : t('actions.collapseGroup')}
                                >
                                    <span className="truncate text-[11.5px] font-extrabold tracking-wide text-white/55 transition-colors group-hover:text-white">
                                        {group.group}
                                    </span>
                                    <ChevronDown
                                        size={13}
                                        aria-hidden="true"
                                        className={cx('shrink-0 text-white/40 transition-transform duration-200 group-hover:text-white', isSectionCollapsed && (isRtl ? 'rotate-90' : '-rotate-90'))}
                                    />
                                </button>
                            )}
                            <ul
                                id={`group-content-${group.key}`}
                                hidden={!isCollapsed && isSectionCollapsed}
                                className="space-y-0.5"
                                aria-label={group.group}
                            >
                                {group.items.map((item) => (
                                    <li key={item.to}>
                                        <div className="relative">
                                            <NavLink
                                                to={item.children[0]?.to || item.to}
                                                onClick={(event) => handleNavigation(event, item)}
                                                aria-current={item.children.length ? 'false' : undefined}
                                                end={item.to === '/dashboard'}
                                                data-collapsed={isCollapsed}
                                                title={isCollapsed ? item.label : undefined}
                                                className={({ isActive }) => cx(
                                                    'group vx-nav-item',
                                                    isActive && 'is-active',
                                                    !isCollapsed && item.children.length > 0 && 'pe-11',
                                                    item.locked && 'opacity-60'
                                                )}
                                                aria-label={item.locked ? `${item.label} — ${lockedLabel}` : item.label}
                                            >
                                                <item.icon size={18} strokeWidth={1.9} className="vx-nav-icon" aria-hidden="true" />

                                                {!isCollapsed && (
                                                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                                        <span className="truncate">{item.label}</span>
                                                        {item.locked && <Lock size={12} className="shrink-0 opacity-80" aria-hidden="true" title={trialHint} />}
                                                    </span>
                                                )}

                                                {isCollapsed && (
                                                    <span className={cx('vx-tip hidden lg:group-hover:block lg:group-focus-visible:block', collapsedTooltipClass)} role="tooltip">
                                                        {item.label}
                                                    </span>
                                                )}
                                            </NavLink>

                                            {!isCollapsed && item.children.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(item)}
                                                    aria-expanded={Boolean(isGroupExpanded(item))}
                                                    aria-controls={`submenu-${item.to.replaceAll('/', '-')}`}
                                                    aria-label={t('actions.toggleSubmenu', { section: item.label, defaultValue: `Expand or collapse ${item.label} sections` })}
                                                    className="vx-sub-toggle"
                                                >
                                                    <ChevronDown size={16} className={cx('transition-transform duration-200', isGroupExpanded(item) && 'rotate-180')} />
                                                </button>
                                            )}

                                            {item.children.length > 0 && !isCollapsed && (
                                                <ul id={`submenu-${item.to.replaceAll('/', '-')}`} hidden={!isGroupExpanded(item)} className="vx-sub-list space-y-0.5" aria-label={item.label}>
                                                    {item.children.map((child) => {
                                                        const childActive = isChildActive(child.to);
                                                        return (
                                                            <li key={child.to}>
                                                                <Link
                                                                    to={child.to}
                                                                    onClick={handleNavigation}
                                                                    aria-current={childActive ? 'page' : undefined}
                                                                    className={cx('vx-sub-link', childActive && 'is-active')}
                                                                >
                                                                    <span className="min-w-0 break-words">{child.label}</span>
                                                                </Link>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}

                {filteredNavGroups.length === 0 && !isCollapsed && (
                    <p className="px-3 py-8 text-center text-sm font-medium text-white/55">
                        {t('summary.noFilterResults', { defaultValue: isRtl ? 'لا توجد نتائج مطابقة' : 'No matching pages' })}
                    </p>
                )}
            </nav>

            {/* Signed-in user */}
            <div className="app-sidebar-footer vx-sb-footer">
                <div className={cx('vx-sb-user', isCollapsed ? 'flex-col justify-center gap-1.5' : '')}>
                    <span className="vx-sb-avatar shadow-inner" title={isCollapsed ? user?.name : undefined}>{userInitial}</span>
                    {!isCollapsed && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-extrabold leading-tight text-white tracking-normal">
                                {user?.name || t('common.user', { ns: 'common' })}
                            </p>
                            <span className="vx-sb-role">
                                {effectiveRole ? t(`roles.${String(effectiveRole).toLowerCase()}`, { ns: 'common', defaultValue: effectiveRole }) : t('common.staff', { ns: 'common' })}
                            </span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleLogout}
                        className={cx('vx-sb-logout', isCollapsed && '!h-7 !w-7')}
                        title={t('actions.signOut', { ns: 'common', defaultValue: 'Sign out' })}
                        aria-label={t('actions.signOut', { ns: 'common', defaultValue: 'Sign out' })}
                    >
                        <LogOut size={16} className={cx(isRtl && 'rotate-180')} />
                    </button>
                </div>
            </div>

            {/* Collapse / expand */}
            {isCollapsed && (
                <button
                    type="button"
                    onClick={toggleCollapse}
                    className="vx-collapse-btn hidden lg:flex"
                    aria-label={isCollapsed ? t('actions.expandSidebar') : t('actions.collapseSidebar')}
                    title={isCollapsed ? t('actions.expandSidebar') : t('actions.collapseSidebar')}
                >
                    <CollapseIcon size={14} strokeWidth={2.4} />
                </button>
            )}

            {/* Sign-out confirmation */}
            {isSignOutOpen && createPortal(
                <div className="vx-modal-scrim animate-in fade-in duration-150" onClick={() => setIsSignOutOpen(false)}>
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="signout-title"
                        aria-describedby="signout-desc"
                        className="vx-modal-card max-w-sm animate-in zoom-in-95 duration-150"
                        dir={isRtl ? 'rtl' : 'ltr'}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => { if (event.key === 'Escape') setIsSignOutOpen(false); }}
                    >
                        <h3 id="signout-title" className="vx-modal-title">
                            {t('session.signOutTitle', { ns: 'common', defaultValue: `Sign out of ${VIARA_BRAND.name}?` })}
                        </h3>
                        <p id="signout-desc" className="vx-modal-text">
                            {t('session.signOutMessage', { ns: 'common', defaultValue: 'You will need to sign in again to access the workspace.' })}
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button type="button" autoFocus onClick={() => setIsSignOutOpen(false)} className="vx-btn vx-btn-ghost">
                                {t('actions.cancel', { ns: 'common', defaultValue: 'Cancel' })}
                            </button>
                            <button type="button" onClick={confirmLogout} className="vx-btn vx-btn-danger">
                                {t('actions.signOut', { ns: 'common', defaultValue: 'Sign out' })}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Sidebar;