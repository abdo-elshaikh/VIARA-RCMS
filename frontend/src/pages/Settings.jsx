import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
    Activity,
    AlertTriangle,
    BellRing,
    Blocks,
    BrainCircuit,
    ChevronLeft,
    ChevronRight,
    Database,
    FileText,
    KeyRound,
    LockKeyhole,
    Microscope,
    Monitor,
    Palette,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    Settings as SettingsIcon,
    ShieldAlert,
    Sliders,
    Terminal,
    UserCog,
    UserRound,
    Users,
    X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { selectCurrentUser } from '../store/authSlice';
import { selectPreferences } from '../store/preferencesSlice';

import ProfileSettings from '../components/settings/ProfileSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import AppearanceSettings from '../components/settings/AppearanceSettings';
import PreferencesSettings from '../components/settings/PreferencesSettings';
import AdminSettings from '../components/settings/AdminSettings';
import DeveloperSettings from '../components/settings/DeveloperSettings';
import AuditSettings from '../components/settings/AuditSettings';
import IntegrationsSettings from '../components/settings/IntegrationsSettings';
import AiProviderSettings from '../components/settings/AiProviderSettings';
import TeamSettings from '../components/settings/TeamSettings';
import ClinicalOperationsSettings from '../components/settings/ClinicalOperationsSettings';
import NotificationSettingsPanel from '../components/settings/NotificationSettingsPanel';
import CenterSettings from './CenterSettings';

const PacsSettings = lazy(() => import('./PacsSettings'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const PrivacyCenter = lazy(() => import('./PrivacyCenter'));
const BackupManagement = lazy(() => import('./BackupManagement'));
const AuditLogs = lazy(() => import('./AuditLogs'));

const SECTION_COMPONENTS = {
    profile: ProfileSettings,
    security: SecuritySettings,
    appearance: AppearanceSettings,
    preferences: PreferencesSettings,
    notifications: NotificationSettingsPanel,
    audit: AuditSettings,
    team: TeamSettings,
    clinical: ClinicalOperationsSettings,
    facility: CenterSettings,
    integrations: IntegrationsSettings,
    ai: AiProviderSettings,
    pacs: PacsSettings,
    roles: RoleManagement,
    privacy: PrivacyCenter,
    auditLogs: AuditLogs,
    backups: BackupManagement,
    developer: DeveloperSettings,
    admin: AdminSettings
};

const GROUP_ORDER = ['personal', 'organization', 'advanced'];

const GROUP_ACCENTS = {
    personal: {
        activeGradient: 'from-cyan-500/15 via-teal-500/5 to-transparent dark:from-cyan-950/50 dark:via-teal-950/20',
        activeBorder: 'border-cyan-500/40 dark:border-cyan-500/50',
        activeIconBg: 'bg-gradient-to-br from-cyan-500 to-teal-600',
        glow: 'shadow-lg shadow-cyan-500/25',
        ring: 'ring-cyan-500/20',
        activeText: 'text-cyan-600 dark:text-cyan-400',
        badgeTag: 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-300',
        badgeDot: 'bg-cyan-500'
    },
    organization: {
        activeGradient: 'from-indigo-500/15 via-purple-500/5 to-transparent dark:from-indigo-950/50 dark:via-purple-950/20',
        activeBorder: 'border-indigo-500/40 dark:border-indigo-500/50',
        activeIconBg: 'bg-gradient-to-br from-indigo-500 to-purple-600',
        glow: 'shadow-lg shadow-indigo-500/25',
        ring: 'ring-indigo-500/20',
        activeText: 'text-indigo-600 dark:text-indigo-400',
        badgeTag: 'bg-indigo-500/20 text-indigo-800 dark:text-indigo-300',
        badgeDot: 'bg-indigo-500'
    },
    advanced: {
        activeGradient: 'from-amber-500/15 via-orange-500/5 to-transparent dark:from-amber-950/50 dark:via-orange-950/20',
        activeBorder: 'border-amber-500/40 dark:border-amber-500/50',
        activeIconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
        glow: 'shadow-lg shadow-amber-500/25',
        ring: 'ring-amber-500/20',
        activeText: 'text-amber-600 dark:text-amber-400',
        badgeTag: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
        badgeDot: 'bg-amber-500'
    }
};

const NavItem = ({ tab, selected, collapsed, groupName, onClick }) => {
    const Icon = tab.icon;
    const accent = GROUP_ACCENTS[tab.group] || GROUP_ACCENTS.personal;

    if (collapsed) {
        return (
            <div className="group/tooltip relative flex justify-center py-0.5">
                <button
                    type="button"
                    onClick={() => onClick(tab.id)}
                    aria-current={selected ? 'page' : undefined}
                    aria-label={tab.label}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-200 ${
                        selected
                            ? `${accent.activeIconBg} text-white ${accent.glow} ring-2 ${accent.ring}`
                            : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-800 dark:hover:bg-slate-800/80 dark:hover:text-slate-100'
                    }`}
                >
                    <Icon size={18} aria-hidden="true" />
                    {selected && (
                        <span className={`absolute -end-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full ${accent.badgeDot} ring-2 ring-white dark:ring-slate-900`} />
                    )}
                </button>

                {/* Floating Rich Tooltip for Collapsed Mode */}
                <div className="pointer-events-none absolute start-full top-1/2 z-[150] ms-3 hidden w-56 -translate-y-1/2 rounded-2xl border border-slate-200/90 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl group-hover/tooltip:block dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-150 rtl:end-full rtl:start-auto rtl:me-3 rtl:ms-0">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
                        <span className="font-extrabold text-xs text-white truncate">{tab.label}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${accent.badgeTag}`}>
                            {groupName}
                        </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400 font-medium">{tab.description}</p>
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onClick(tab.id)}
            aria-current={selected ? 'page' : undefined}
            className={`group relative flex w-full items-start gap-3 rounded-2xl border px-3.5 py-2.5 text-start transition-all duration-200 ${
                selected
                    ? `${accent.activeBorder} bg-gradient-to-r ${accent.activeGradient} shadow-sm ring-1 ${accent.ring}`
                    : 'border-transparent text-slate-600 hover:border-slate-200/80 hover:bg-white/80 hover:text-slate-950 dark:text-slate-400 dark:hover:border-slate-800/80 dark:hover:bg-slate-900/60 dark:hover:text-slate-100'
            }`}
        >
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                selected
                    ? `${accent.activeIconBg} text-white shadow-md ${accent.glow}`
                    : 'bg-slate-100 text-slate-500 group-hover:bg-cyan-50 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-cyan-950 dark:group-hover:text-cyan-300'
            }`}>
                <Icon size={16} aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
                <span className={`block truncate text-xs font-black ${selected ? 'text-slate-950 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                    {tab.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {tab.description}
                </span>
            </span>

            <ChevronRight
                size={14}
                className={`mt-2 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 ${
                    selected ? accent.activeText : 'text-slate-300 dark:text-slate-600'
                }`}
                aria-hidden="true"
            />
        </button>
    );
};

const MobileTab = ({ tab, selected, onClick }) => {
    const Icon = tab.icon;
    return (
        <button
            type="button"
            onClick={() => onClick(tab.id)}
            aria-current={selected ? 'page' : undefined}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition-all ${selected
                ? 'border-cyan-600 bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                : 'border-slate-200/80 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
        >
            <Icon size={15} aria-hidden="true" />
            <span>{tab.label}</span>
        </button>
    );
};

const Settings = () => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const currentUser = useSelector(selectCurrentUser);
    const preferences = useSelector(selectPreferences);
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Collapsed sidebar navigation state (stored in localStorage)
    const [isNavCollapsed, setIsNavCollapsed] = useState(() => {
        const saved = localStorage.getItem('rcms_settings_nav_collapsed');
        if (saved !== null) return saved === 'true';
        return Boolean(preferences?.compactSidebar);
    });

    const role = currentUser?.role || 'Staff';
    const mustChangePassword = Boolean(currentUser?.mustChangePassword);
    const initialTab = mustChangePassword ? 'security' : (searchParams.get('tab') || 'profile');
    const [activeTab, setActiveTab] = useState(initialTab);
    const [query, setQuery] = useState('');
    const [animKey, setAnimKey] = useState(0);
    const mobileNavRef = useRef(null);
    const locale = i18n.resolvedLanguage || 'en';
    const isRtl = i18n.dir() === 'rtl';

    useEffect(() => {
        localStorage.setItem('rcms_settings_nav_collapsed', String(isNavCollapsed));
    }, [isNavCollapsed]);

    const tabs = useMemo(() => {
        if (mustChangePassword) {
            return [{ id: 'security', group: 'personal', label: t('settings.tabs.security'), description: t('settings.tabDescriptions.security'), icon: KeyRound }];
        }

        const available = [
            { id: 'profile', group: 'personal', label: t('settings.tabs.profile'), description: t('settings.tabDescriptions.profile'), icon: UserCog },
            { id: 'security', group: 'personal', label: t('settings.tabs.security'), description: t('settings.tabDescriptions.security'), icon: KeyRound },
            { id: 'appearance', group: 'personal', label: t('settings.tabs.appearance'), description: t('settings.tabDescriptions.appearance'), icon: Palette },
            { id: 'preferences', group: 'personal', label: t('settings.tabs.preferences'), description: t('settings.tabDescriptions.preferences'), icon: Sliders },
            { id: 'notifications', group: 'personal', label: t('settings.tabs.notifications'), description: t('settings.tabDescriptions.notifications'), icon: BellRing },
            { id: 'audit', group: 'personal', label: t('settings.tabs.audit'), description: t('settings.tabDescriptions.audit'), icon: Activity }
        ];

        const isDeveloper = role === 'Developer';
        const isAdmin = role === 'Admin';

        if (['Developer', 'Admin', 'HR'].includes(role)) {
            available.push({ id: 'team', group: 'organization', label: t('settings.tabs.team'), description: t('settings.tabDescriptions.team'), icon: Users });
        }

        if (isDeveloper || isAdmin) {
            available.push(
                { id: 'facility', group: 'organization', label: t('settings.tabs.facility'), description: t('settings.tabDescriptions.facility'), icon: FileText },
                { id: 'clinical', group: 'organization', label: t('settings.tabs.clinical'), description: t('settings.tabDescriptions.clinical'), icon: Microscope },
                { id: 'integrations', group: 'organization', label: t('settings.tabs.integrations'), description: t('settings.tabDescriptions.integrations'), icon: Blocks },
                { id: 'pacs', group: 'organization', label: t('settings.tabs.pacs'), description: t('settings.tabDescriptions.pacs'), icon: Monitor },
                { id: 'admin', group: 'organization', label: t('settings.tabs.system'), description: t('settings.tabDescriptions.system'), icon: SettingsIcon },
                { id: 'roles', group: 'advanced', label: t('settings.tabs.roles'), description: t('settings.tabDescriptions.roles'), icon: ShieldAlert },
                { id: 'privacy', group: 'advanced', label: t('settings.tabs.privacy'), description: t('settings.tabDescriptions.privacy'), icon: UserRound },
                { id: 'auditLogs', group: 'advanced', label: t('settings.tabs.auditLogs'), description: t('settings.tabDescriptions.auditLogs'), icon: FileText },
                { id: 'backups', group: 'advanced', label: t('settings.tabs.backups'), description: t('settings.tabDescriptions.backups'), icon: Database }
            );
        }

        if (isDeveloper) {
            available.push(
                { id: 'ai', group: 'advanced', label: t('settings.tabs.ai'), description: t('settings.tabDescriptions.ai'), icon: BrainCircuit },
                { id: 'developer', group: 'advanced', label: t('settings.tabs.developer'), description: t('settings.tabDescriptions.developer'), icon: Terminal }
            );
        }

        return available;
    }, [mustChangePassword, role, t]);

    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    const filteredTabs = normalizedQuery
        ? tabs.filter(tab => `${tab.label} ${tab.description}`.toLocaleLowerCase(locale).includes(normalizedQuery))
        : tabs;

    const active = tabs.find(tab => tab.id === activeTab) || tabs[0];
    const ActiveComponent = SECTION_COMPONENTS[active.id];
    const displayName = currentUser?.fullName || currentUser?.full_name || currentUser?.name || currentUser?.email || t('settings.accountFallback');
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

    const handleTabChange = (id) => {
        setActiveTab(id);
        setAnimKey(key => key + 1);
        const next = new URLSearchParams(searchParams);
        next.set('tab', id);
        setSearchParams(next, { replace: true });
    };

    useEffect(() => {
        if (!tabs.length) return;
        if (mustChangePassword) {
            if (activeTab !== 'security') setActiveTab('security');
            return;
        }

        const param = searchParams.get('tab');
        if (param && tabs.some(tab => tab.id === param)) {
            if (param !== activeTab) {
                setActiveTab(param);
                setAnimKey(key => key + 1);
            }
            return;
        }

        if (!tabs.some(tab => tab.id === activeTab)) {
            const fallback = tabs[0].id;
            setActiveTab(fallback);
            const next = new URLSearchParams(searchParams);
            next.set('tab', fallback);
            setSearchParams(next, { replace: true });
        }
    }, [activeTab, mustChangePassword, searchParams, setSearchParams, tabs]);

    useEffect(() => {
        const activePill = mobileNavRef.current?.querySelector('[aria-current="page"]');
        if (typeof activePill?.scrollIntoView === 'function') {
            activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeTab]);

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'ar' : 'en'}>
            <style>{`
                @keyframes settings-fade-up {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .settings-panel-enter {
                    animation: settings-fade-up 0.2s ease-out both;
                }
            `}</style>

            {/* start settings */}
            <div className="mx-auto max-w-[1500px]">
                <header className="mb-5 border-b border-slate-200 pb-5 dark:border-slate-800">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-black uppercase text-cyan-700 dark:text-cyan-300">
                                <SettingsIcon size={15} aria-hidden="true" />
                                {t('settings.eyebrow')}
                            </div>
                            <h1 className="mt-2 text-2xl font-black text-slate-950 dark:text-white sm:text-3xl">{t('settings.header')}</h1>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{t('settings.subheader')}</p>
                        </div>

                        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/60 bg-slate-50/40 p-2.5 dark:border-slate-800/60 dark:bg-slate-950/20">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white dark:bg-cyan-500 dark:text-slate-950">
                                {initials || 'RC'}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{displayName}</p>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('settings.summary.access', { role })}</p>
                            </div>
                        </div>
                    </div>
                </header>

                {mustChangePassword && (
                    <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
                        <LockKeyhole size={19} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-bold">{t('settings.passwordRequired.title')}</p>
                            <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">{t('settings.passwordRequired.description')}</p>
                        </div>
                    </div>
                )}

                {/*  settings navigation with Minimizable & Resizable Sidebar */}
                <div className={`grid items-start gap-5 transition-all duration-300 ${isNavCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
                    <aside
                        className={`hidden rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm backdrop-blur-xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/60 lg:sticky lg:top-5 lg:block ${
                            isNavCollapsed ? 'w-[76px]' : 'w-[280px]'
                        }`}
                        aria-label={t('settings.navigationLabel')}
                    >
                        {/* Sidebar Header & Collapse Toggle */}
                        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800/80">
                            {!isNavCollapsed && (
                                <span className="ps-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                                    {t('settings.navigationLabel', { defaultValue: 'SETTINGS SECTIONS' })}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsNavCollapsed(prev => !prev)}
                                title={isNavCollapsed ? t('common.expand', { defaultValue: 'Expand Navigation' }) : t('common.minimize', { defaultValue: 'Minimize Navigation' })}
                                className={`flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white ${
                                    isNavCollapsed ? 'mx-auto' : ''
                                }`}
                            >
                                {isNavCollapsed ? (
                                    <PanelLeftOpen size={16} className="rtl:rotate-180" />
                                ) : (
                                    <PanelLeftClose size={16} className="rtl:rotate-180" />
                                )}
                            </button>
                        </div>

                        {/* Search Input Bar */}
                        {!isNavCollapsed ? (
                            <div className="relative mb-3">
                                <label htmlFor="settings-search" className="sr-only">{t('settings.search.label')}</label>
                                <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    id="settings-search"
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder={t('settings.search.placeholder')}
                                    className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/60 pe-9 ps-9 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-100"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        aria-label={t('settings.search.clear')}
                                        title={t('settings.search.clear')}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="mb-3 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setIsNavCollapsed(false)}
                                    title={t('settings.search.label')}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                                >
                                    <Search size={15} />
                                </button>
                            </div>
                        )}

                        <nav className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto pe-0.5">
                            {GROUP_ORDER.map(group => {
                                const groupTabs = filteredTabs.filter(tab => tab.group === group);
                                if (!groupTabs.length) return null;
                                return (
                                    <div key={group}>
                                        {!isNavCollapsed ? (
                                            <p className="mb-1.5 px-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                {t(`settings.groups.${group}`)}
                                            </p>
                                        ) : (
                                            <div className="my-2 border-t border-slate-100 dark:border-slate-800/80" />
                                        )}
                                        <div className="space-y-1">
                                            {groupTabs.map(tab => (
                                                <NavItem
                                                    key={tab.id}
                                                    tab={tab}
                                                    selected={active.id === tab.id}
                                                    collapsed={isNavCollapsed}
                                                    groupName={t(`settings.groups.${group}`)}
                                                    onClick={handleTabChange}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            {filteredTabs.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center dark:border-slate-800">
                                    <Search size={20} className="mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
                                    {!isNavCollapsed && (
                                        <>
                                            <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">{t('settings.search.emptyTitle')}</p>
                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t('settings.search.emptyDescription')}</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </nav>
                    </aside>

                    <main className="min-w-0 space-y-4">
                        <div className="lg:hidden">
                            <div className="relative mb-3">
                                <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder={t('settings.search.placeholder')}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pe-9 ps-9 text-xs font-semibold text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                                />
                                {query && (
                                    <button type="button" onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-200" aria-label={t('settings.search.clear')}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <div ref={mobileNavRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }} aria-label={t('settings.navigationLabel')}>
                                {filteredTabs.map(tab => (
                                    <MobileTab key={tab.id} tab={tab} selected={active.id === tab.id} onClick={handleTabChange} />
                                ))}
                            </div>
                            {filteredTabs.length === 0 && (
                                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                                    {t('settings.search.emptyDescription')}
                                </div>
                            )}
                        </div>

                        <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60 sm:p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                                        <ActiveComponentIcon icon={active.icon} />
                                    </span>
                                    <div className="min-w-0">
                                        <h2 className="text-base font-black text-slate-950 dark:text-white">{active.label}</h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{active.description}</p>
                                    </div>
                                </div>
                            </div>

                            <div key={`${active.id}-${animKey}`} className="settings-panel-enter mt-5">
                                <Suspense fallback={
                                    <div className="flex items-center justify-center p-12 text-slate-400">
                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                                    </div>
                                }>
                                    {ActiveComponent ? <ActiveComponent /> : null}
                                </Suspense>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        </div>
    );
};

const ActiveComponentIcon = ({ icon: Icon }) => {
    if (!Icon) return null;
    return <Icon size={18} aria-hidden="true" />;
};

export default Settings;
