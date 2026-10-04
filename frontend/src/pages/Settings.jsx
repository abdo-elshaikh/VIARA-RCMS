import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
    Activity,
    AlertTriangle,
    BellRing,
    Blocks,
    BrainCircuit,
    ChevronRight,
    Database,
    FileText,
    Monitor,
    Palette,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    Settings as SettingsIcon,
    ShieldAlert,
    Sliders,
    Terminal,
    UserRound,
    Users,
    X
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { selectCurrentUser } from '../store/authSlice';
import { selectPreferences } from '../store/preferencesSlice';

import AppearanceSettings from '../components/settings/AppearanceSettings';
import PreferencesSettings from '../components/settings/PreferencesSettings';
import AdminSettings from '../components/settings/AdminSettings';
import DeveloperSettings from '../components/settings/DeveloperSettings';
import AuditSettings from '../components/settings/AuditSettings';
import IntegrationsSettings from '../components/settings/IntegrationsSettings';
import AiProviderSettings from '../components/settings/AiProviderSettings';
import TeamSettings from '../components/settings/TeamSettings';
import NotificationSettingsPanel from '../components/settings/NotificationSettingsPanel';
import CenterSettings from './CenterSettings';
import PageHeader from '../components/ui/PageHeader';
import { canAccessSettingsSection } from '../config/settingsSections';
import { confirmNavigation } from '../utils/navigationGuard';

const PacsSettings = lazy(() => import('./PacsSettings'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const PrivacyCenter = lazy(() => import('./PrivacyCenter'));
const BackupManagement = lazy(() => import('./BackupManagement'));
const AuditLogs = lazy(() => import('./AuditLogs'));
const PortalBuilderSettings = lazy(() => import('../components/settings/PortalBuilderSettings'));

const SECTION_COMPONENTS = {
    appearance: AppearanceSettings,
    preferences: PreferencesSettings,
    notifications: NotificationSettingsPanel,
    audit: AuditSettings,
    team: TeamSettings,
    facility: CenterSettings,
    portalBuilder: PortalBuilderSettings,
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

const GROUP_TONES = {
    personal: {
        active: 'border-[var(--VIARA-accent)] bg-[var(--VIARA-accent-soft)] before:bg-[var(--VIARA-accent)]',
        icon: 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)]',
        iconSoft: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent-text)]',
        text: 'text-[var(--VIARA-accent-text)]',
        badge: 'border-[var(--VIARA-accent)] bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent-text)]',
        dot: 'bg-[var(--VIARA-accent)]'
    },
    organization: {
        active: 'border-[var(--VIARA-info-border)] bg-[var(--VIARA-info-soft)] before:bg-[var(--VIARA-info)]',
        icon: 'bg-[var(--VIARA-info)] text-[var(--VIARA-info-contrast)]',
        iconSoft: 'bg-[var(--VIARA-info-soft)] text-[var(--VIARA-info)]',
        text: 'text-[var(--VIARA-info)]',
        badge: 'border-[var(--VIARA-info-border)] bg-[var(--VIARA-info-soft)] text-[var(--VIARA-info)]',
        dot: 'bg-[var(--VIARA-info)]'
    },
    advanced: {
        active: 'border-[var(--VIARA-warning-border)] bg-[var(--VIARA-warning-soft)] before:bg-[var(--VIARA-warning)]',
        icon: 'bg-[var(--VIARA-warning)] text-[var(--VIARA-warning-contrast)]',
        iconSoft: 'bg-[var(--VIARA-warning-soft)] text-[var(--VIARA-warning)]',
        text: 'text-[var(--VIARA-warning)]',
        badge: 'border-[var(--VIARA-warning-border)] bg-[var(--VIARA-warning-soft)] text-[var(--VIARA-warning)]',
        dot: 'bg-[var(--VIARA-warning)]'
    }
};

const NavItem = ({ tab, selected, collapsed, groupName, onClick }) => {
    const Icon = tab.icon;
    const tone = GROUP_TONES[tab.group] || GROUP_TONES.personal;

    if (collapsed) {
        return (
            <div className="group/tooltip relative flex justify-center py-0.5">
                <button
                    type="button"
                    onClick={() => onClick(tab.id)}
                    aria-current={selected ? 'page' : undefined}
                    aria-label={tab.label}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-[var(--VIARA-radius-control)] border transition-all duration-[var(--VIARA-motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--VIARA-canvas)] ${selected
                            ? `${tone.icon} border-transparent shadow-sm`
                            : 'border-transparent text-[var(--VIARA-muted)] hover:border-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)]'
                        }`}
                >
                    <Icon size={18} aria-hidden="true" />
                    {selected && (
                        <span className={`absolute -end-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900 ${tone.dot}`} />
                    )}
                </button>

                {/* Floating Rich Tooltip for Collapsed Mode */}
                <div className="pointer-events-none absolute start-full top-1/2 z-[150] ms-3 hidden w-60 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-white shadow-xl group-hover/tooltip:block rtl:end-full rtl:start-auto rtl:me-3 rtl:ms-0">
                    <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <span className="text-xs font-extrabold text-white">{tab.label}</span>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${tone.badge}`}>
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
            title={`${tab.label} — ${tab.description}`}
            className={`group relative flex min-h-[54px] w-full items-center gap-2.5 overflow-hidden rounded-[var(--VIARA-radius-control)] border px-2.5 py-2 text-start transition-all duration-[var(--VIARA-motion-base)] before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--VIARA-canvas)] ${selected
                    ? `${tone.active} shadow-sm`
                    : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] before:bg-transparent hover:border-[var(--VIARA-line-strong)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)]'
                }`}
        >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${selected
                    ? tone.icon
                    : `${tone.iconSoft} group-hover:brightness-95 dark:group-hover:brightness-125`
                }`}>
                <Icon size={15} aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block break-words text-xs font-black leading-4 text-[var(--VIARA-ink)]">
                    {tab.label}
                </span>
                <span className="sr-only">
                    {tab.description}
                </span>
            </span>

            <ChevronRight
                size={13}
                className={`shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 ${selected ? tone.text : 'text-[var(--VIARA-muted)] opacity-60'}`}
                aria-hidden="true"
            />
        </button>
    );
};

// Deep links that predate the current information architecture. They are
// redirected to wherever that content now lives, so an old bookmark still
// lands somewhere useful instead of on a blank or wrong settings section.
const LEGACY_TAB_REDIRECTS = {
    clinical: '/equipment?tab=rooms',
    clinicalOperations: '/equipment?tab=rooms',
    security: '/profile?section=security',
    profile: '/profile',
    license: '/settings?tab=admin&subtab=license',
    licensing: '/settings?tab=admin&subtab=license',
};

const Settings = () => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const currentUser = useSelector(selectCurrentUser);
    const preferences = useSelector(selectPreferences);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    // Collapsed sidebar navigation state (stored in localStorage)
    const [isNavCollapsed, setIsNavCollapsed] = useState(() => {
        const saved = localStorage.getItem('VIARA_settings_nav_collapsed');
        if (saved !== null) return saved === 'true';
        return Boolean(preferences?.compactSidebar);
    });
    const lastCompactPreference = useRef(Boolean(preferences?.compactSidebar));

    const role = currentUser?.role || 'Staff';
    const mustChangePassword = Boolean(currentUser?.mustChangePassword);
    const initialTab = searchParams.get('tab') || 'appearance';
    const [activeTab, setActiveTab] = useState(initialTab);
    const [query, setQuery] = useState('');
    const [animKey, setAnimKey] = useState(0);
    const locale = i18n.resolvedLanguage || 'en';
    const isRtl = i18n.dir() === 'rtl';

    useEffect(() => {
        localStorage.setItem('VIARA_settings_nav_collapsed', String(isNavCollapsed));
    }, [isNavCollapsed]);

    useEffect(() => {
        const compactPreference = Boolean(preferences?.compactSidebar);
        if (compactPreference === lastCompactPreference.current) return;
        lastCompactPreference.current = compactPreference;
        setIsNavCollapsed(compactPreference);
        localStorage.setItem('VIARA_settings_nav_collapsed', String(compactPreference));
    }, [preferences?.compactSidebar]);

    const tabs = useMemo(() => {
        const available = [
            { id: 'appearance', group: 'personal', label: t('settings.tabs.appearance'), description: t('settings.tabDescriptions.appearance'), icon: Palette },
            { id: 'preferences', group: 'personal', label: t('settings.tabs.preferences'), description: t('settings.tabDescriptions.preferences'), icon: Sliders },
            { id: 'notifications', group: 'personal', label: t('settings.tabs.notifications'), description: t('settings.tabDescriptions.notifications'), icon: BellRing },
            { id: 'audit', group: 'personal', label: t('settings.tabs.audit'), description: t('settings.tabDescriptions.audit'), icon: Activity },
            { id: 'team', group: 'organization', label: t('settings.tabs.team'), description: t('settings.tabDescriptions.team'), icon: Users },
            { id: 'facility', group: 'organization', label: t('settings.tabs.facility'), description: t('settings.tabDescriptions.facility'), icon: FileText },
            { id: 'portalBuilder', group: 'organization', label: t('settings.tabs.portalBuilder'), description: t('settings.tabDescriptions.portalBuilder'), icon: Palette },
            { id: 'integrations', group: 'organization', label: t('settings.tabs.integrations'), description: t('settings.tabDescriptions.integrations'), icon: Blocks },
            { id: 'pacs', group: 'organization', label: t('settings.tabs.pacs'), description: t('settings.tabDescriptions.pacs'), icon: Monitor },
            { id: 'admin', group: 'organization', label: t('settings.tabs.system'), description: t('settings.tabDescriptions.system'), icon: SettingsIcon },
            { id: 'roles', group: 'advanced', label: t('settings.tabs.roles'), description: t('settings.tabDescriptions.roles'), icon: ShieldAlert },
            { id: 'privacy', group: 'advanced', label: t('settings.tabs.privacy'), description: t('settings.tabDescriptions.privacy'), icon: UserRound },
            { id: 'backups', group: 'advanced', label: t('settings.tabs.backups'), description: t('settings.tabDescriptions.backups'), icon: Database },
            { id: 'auditLogs', group: 'advanced', label: t('settings.tabs.auditLogs'), description: t('settings.tabDescriptions.auditLogs'), icon: FileText },
            { id: 'ai', group: 'advanced', label: t('settings.tabs.ai'), description: t('settings.tabDescriptions.ai'), icon: BrainCircuit },
            { id: 'developer', group: 'advanced', label: t('settings.tabs.developer'), description: t('settings.tabDescriptions.developer'), icon: Terminal }
        ];
        return available.filter((section) => canAccessSettingsSection(section.id, currentUser));
    }, [currentUser, t]);

    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    const active = tabs.find(tab => tab.id === activeTab) || tabs[0];
    const matchingTabs = normalizedQuery
        ? tabs.filter(tab => `${tab.label} ${tab.description}`.toLocaleLowerCase(locale).includes(normalizedQuery))
        : tabs;
    const filteredTabs = normalizedQuery && active && !matchingTabs.some(tab => tab.id === active.id)
        ? [active, ...matchingTabs]
        : matchingTabs;

    const ActiveComponent = SECTION_COMPONENTS[active.id];
    const formattedSectionCount = new Intl.NumberFormat(locale).format(tabs.length);
    const sectionCountLabel = t('settings.sectionCount', { count: tabs.length, formattedCount: formattedSectionCount });
    const activeGroupLabel = t(`settings.groups.${active.group}`);
    const activeTone = GROUP_TONES[active.group] || GROUP_TONES.personal;
    const displayName = currentUser?.fullName || currentUser?.full_name || currentUser?.name || currentUser?.email || t('settings.accountFallback');
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

    const handleTabChange = (id) => {
        // Sections with staged work (e.g. RBAC unsaved permission edits)
        // register a navigation guard — consult it before switching tabs.
        if (id !== activeTab && !confirmNavigation()) return;
        setActiveTab(id);
        setAnimKey(key => key + 1);
        const next = new URLSearchParams(searchParams);
        next.set('tab', id);
        setSearchParams(next, { replace: true });
    };

    useEffect(() => {
        const legacyTab = searchParams.get('tab');
        if (legacyTab && Object.prototype.hasOwnProperty.call(LEGACY_TAB_REDIRECTS, legacyTab)) {
            navigate(LEGACY_TAB_REDIRECTS[legacyTab], { replace: true });
        } else if (mustChangePassword) {
            navigate('/profile?section=security', { replace: true });
        }
    }, [mustChangePassword, navigate, searchParams]);

    useEffect(() => {
        if (!tabs.length) return;

        const param = searchParams.get('tab');

        // Legacy links are being redirected by the effect above. Normalising
        // them here in the same commit would overwrite that redirect and drop
        // the user back onto the first settings section.
        if (param && Object.prototype.hasOwnProperty.call(LEGACY_TAB_REDIRECTS, param)) {
            return;
        }

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
    }, [activeTab, searchParams, setSearchParams, tabs]);

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
                <PageHeader
                    icon={SettingsIcon}
                    eyebrow={t('settings.eyebrow')}
                    title={t('settings.header')}
                    description={t('settings.subheader')}
                    metrics={[
                        { key: 'sections', icon: Blocks, label: sectionCountLabel, value: formattedSectionCount, tone: 'teal' },
                        { key: 'visible', icon: Search, label: t('settings.visibleSections', { defaultValue: isRtl ? 'الأقسام الظاهرة' : 'Visible sections' }), value: filteredTabs.length, tone: 'blue' },
                        { key: 'group', icon: active.icon, label: t('settings.activeGroup', { defaultValue: isRtl ? 'المجموعة الحالية' : 'Active group' }), value: activeGroupLabel, tone: 'violet' },
                        { key: 'active', icon: Sliders, label: t('settings.activeSection', { defaultValue: isRtl ? 'القسم الحالي' : 'Active section' }), value: active.label, tone: 'emerald' }
                    ]}
                    metricsLabel={isRtl ? 'مؤشرات سجل الإعدادات' : 'Settings record indicators'}
                    actions={
                        <div className="flex min-w-0 items-center gap-3 rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-2.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-accent)] text-sm font-black text-[var(--VIARA-accent-contrast)] shadow-sm">
                                {initials || 'RC'}
                            </div>
                            <div className="min-w-0">
                                <p className="break-words text-sm font-bold text-[var(--VIARA-ink)]">{displayName}</p>
                                <p className="break-words text-xs font-semibold text-[var(--VIARA-muted)]">{t('settings.summary.access', { role })}</p>
                            </div>
                        </div>
                    }
                    className="mb-5"
                />

                {/*  settings navigation with Minimizable & Resizable Sidebar */}
                <div data-workspace-layout className={`grid items-start gap-5 transition-all duration-300 ${isNavCollapsed ? 'min-[1500px]:grid-cols-[76px_minmax(0,1fr)]' : 'min-[1500px]:grid-cols-[288px_minmax(0,1fr)]'}`}>
                    <aside
                        data-workspace-tabs
                        className="settings-section hidden w-full transition-all duration-[var(--VIARA-motion-base)] min-[1500px]:sticky min-[1500px]:top-5 min-[1500px]:block"
                        aria-label={t('settings.navigationLabel')}
                    >
                        {/* Sidebar Header & Collapse Toggle */}
                        <div className={`flex items-center border-b border-[var(--VIARA-line)] p-3.5 ${isNavCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
                            {!isNavCollapsed && (
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="settings-section-icon flex h-9 w-9 shrink-0 items-center justify-center">
                                        <SettingsIcon size={17} aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="break-words text-xs font-black text-[var(--VIARA-ink)]">
                                            {t('settings.navigationLabel')}
                                        </p>
                                        <p className="mt-0.5 text-[10px] font-semibold text-[var(--VIARA-muted)]">{sectionCountLabel}</p>
                                    </div>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsNavCollapsed(prev => !prev)}
                                title={isNavCollapsed ? t('common.expand', { defaultValue: 'Expand Navigation' }) : t('common.minimize', { defaultValue: 'Minimize Navigation' })}
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition-all hover:border-[var(--VIARA-accent)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] ${isNavCollapsed ? 'mx-auto' : ''
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
                            <div className="relative mx-3.5 mb-3 mt-3.5">
                                <label htmlFor="settings-search" className="sr-only">{t('settings.search.label')}</label>
                                <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input
                                    id="settings-search"
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder={t('settings.search.placeholder')}
                                    className="ds-field h-10 pe-9 ps-9 text-xs font-semibold"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-[var(--VIARA-radius-control)] p-1.5 text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-accent-text)]"
                                        aria-label={t('settings.search.clear')}
                                        title={t('settings.search.clear')}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="my-3 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setIsNavCollapsed(false)}
                                    title={t('settings.search.label')}
                                    className="flex h-9 w-9 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent-text)]"
                                >
                                    <Search size={15} />
                                </button>
                            </div>
                        )}

                        <nav className="max-h-[calc(100vh-10rem)] space-y-5 overflow-y-auto px-3 pb-3.5">
                            {GROUP_ORDER.map(group => {
                                const groupTabs = filteredTabs.filter(tab => tab.group === group);
                                const groupTone = GROUP_TONES[group] || GROUP_TONES.personal;
                                if (!groupTabs.length) return null;
                                return (
                                    <div key={group}>
                                        {!isNavCollapsed ? (
                                            <div className="mb-1.5 flex items-center gap-2 px-2">
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${groupTone.dot}`} aria-hidden="true" />
                                                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">
                                                    {t(`settings.groups.${group}`)}
                                                </p>
                                                <span className="h-px min-w-3 flex-1 bg-[var(--VIARA-line)]" />
                                                <span dir="ltr" className="rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface-muted)] px-1.5 py-0.5 text-[9px] font-black tabular-nums text-[var(--VIARA-muted)]">
                                                    {new Intl.NumberFormat(locale).format(groupTabs.length)}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="my-2 border-t border-[var(--VIARA-line)]" />
                                        )}
                                        <div className="space-y-1.5">
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
                                <div className="rounded-[var(--VIARA-radius-surface)] border border-dashed border-[var(--VIARA-line)] px-3 py-6 text-center">
                                    <Search size={20} className="mx-auto text-[var(--VIARA-muted)]" aria-hidden="true" />
                                    {!isNavCollapsed && (
                                        <>
                                            <p className="mt-2 text-xs font-bold text-[var(--VIARA-ink)]">{t('settings.search.emptyTitle')}</p>
                                            <p className="mt-1 text-[11px] text-[var(--VIARA-muted)]">{t('settings.search.emptyDescription')}</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </nav>
                    </aside>

                    <main className="min-w-0">
                        <nav data-workspace-tabs className="settings-section min-[1500px]:hidden" aria-label={t('settings.navigationLabel')}>
                            <div className="flex items-center justify-between gap-3 border-b border-[var(--VIARA-line)] px-4 py-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="settings-section-icon flex h-9 w-9 shrink-0 items-center justify-center">
                                        <SettingsIcon size={17} aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-[var(--VIARA-ink)]">{t('settings.navigationLabel')}</p>
                                        <p className="mt-0.5 text-[10px] font-semibold text-[var(--VIARA-muted)]">{sectionCountLabel}</p>
                                    </div>
                                </div>
                                <span className={`rounded-[var(--VIARA-radius-control)] border px-2 py-1 text-[10px] font-bold ${activeTone.badge}`}>
                                    {activeGroupLabel}
                                </span>
                            </div>
                            <div className="max-h-[380px] space-y-4 overflow-y-auto p-3 [scrollbar-width:thin] sm:p-4">
                                {GROUP_ORDER.map(group => {
                                    const groupTabs = filteredTabs.filter(tab => tab.group === group);
                                    const groupTone = GROUP_TONES[group] || GROUP_TONES.personal;
                                    if (!groupTabs.length) return null;
                                    return (
                                        <section key={group} aria-label={t(`settings.groups.${group}`)}>
                                            <div className="mb-2 flex items-center gap-2 px-1">
                                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${groupTone.dot}`} aria-hidden="true" />
                                                <h3 className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">
                                                    {t(`settings.groups.${group}`)}
                                                </h3>
                                                <span className="h-px min-w-3 flex-1 bg-[var(--VIARA-line)]" />
                                                <span dir="ltr" className="rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface-muted)] px-1.5 py-0.5 text-[9px] font-black tabular-nums text-[var(--VIARA-muted)]">
                                                    {new Intl.NumberFormat(locale).format(groupTabs.length)}
                                                </span>
                                            </div>
                                            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                                                {groupTabs.map(tab => (
                                                    <div key={tab.id}>
                                                        <NavItem
                                                            tab={tab}
                                                            selected={active.id === tab.id}
                                                            collapsed={false}
                                                            groupName={t(`settings.groups.${group}`)}
                                                            onClick={handleTabChange}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    );
                                })}
                                {filteredTabs.length === 0 && (
                                    <div className="rounded-[var(--VIARA-radius-surface)] border border-dashed border-[var(--VIARA-line)] px-3 py-6 text-center">
                                        <Search size={20} className="mx-auto text-[var(--VIARA-muted)]" aria-hidden="true" />
                                        <p className="mt-2 text-xs font-bold text-[var(--VIARA-ink)]">{t('settings.search.emptyTitle')}</p>
                                        <p className="mt-1 text-[11px] text-[var(--VIARA-muted)]">{t('settings.search.emptyDescription')}</p>
                                    </div>
                                )}
                            </div>
                        </nav>

                        <section className="settings-workspace-section min-w-0" aria-labelledby={`settings-panel-${active.id}`}>
                            <h2 id={`settings-panel-${active.id}`} className="sr-only">{active.label}</h2>
                            <div key={`${active.id}-${animKey}`} className="settings-panel-enter">
                                <Suspense fallback={
                                    <div className="settings-section flex items-center justify-center p-12 text-[var(--VIARA-muted)]">
                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--VIARA-accent)] border-t-transparent" />
                                    </div>
                                }>
                                    {ActiveComponent ? <ActiveComponent embedded={true} /> : null}
                                </Suspense>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default Settings;
