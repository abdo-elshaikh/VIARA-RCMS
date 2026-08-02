import { useEffect, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Check,
    ChevronRight,
    CircleUserRound,
    LogOut,
    Menu,
    ShieldCheck,
    X,
} from 'lucide-react';
import LanguageToggle from '../../ui/LanguageToggle';
import ThemeToggle from '../../ui/ThemeToggle';

interface TabItem {
    id?: string;
    key?: string;
    label: string;
    icon?: any;
    count?: number;
}

interface DashboardLayoutProps {
    children: ReactNode;
    icon?: any;
    title?: string;
    subtitle?: string;
    userName?: string;
    centerName?: string;
    centerLogo?: string;
    centerInitials?: string;
    onLogout?: () => void;
    tabs?: TabItem[];
    activeTab?: string;
    onTabChange?: (tabKey: string) => void;
}

export const DashboardLayout = ({
    children,
    icon: Icon,
    title,
    subtitle,
    userName,
    centerName,
    centerLogo,
    centerInitials,
    onLogout,
    tabs = [],
    activeTab,
    onTabChange,
}: DashboardLayoutProps) => {
    const { i18n, t } = useTranslation();
    const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const isRtl = language === 'ar';
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const activeTabDetails = tabs.find(({ id, key }) => (id || key) === activeTab) || tabs[0];
    const ActiveSectionIcon = activeTabDetails?.icon;

    const selectTab = (tabKey: string) => {
        onTabChange?.(tabKey);
        setMobileNavOpen(false);
        window.requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
    };

    useEffect(() => {
        if (!mobileNavOpen) return undefined;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileNavOpen(false);
        };
        window.addEventListener('keydown', handleKey);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleKey);
            document.body.style.overflow = '';
        };
    }, [mobileNavOpen]);

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="prototype-portal portal-theme portal-dashboard portal-dashboard-page min-h-screen bg-background text-foreground selection:bg-primary-600/20">
            <a href="#main" className="portal-skip-link">{t('common.skipToContent', 'Skip to main content')}</a>

            <header className="portal-workspace-header sticky top-0 z-50 border-b border-[#dce5ec] bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#091827]/95">
                <div className="mx-auto flex min-h-[4.25rem] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                    <div className="flex shrink-0 items-center gap-3">
                        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary-600 to-primary-900 text-white shadow-md shadow-primary-900/20">
                            {centerLogo ? (
                                <img src={centerLogo} alt="" className="h-full w-full object-contain p-1.5" />
                            ) : Icon ? (
                                <Icon className="h-5 w-5" />
                            ) : (
                                <span className="text-xs font-black tracking-wider">{centerInitials || 'RCMS'}</span>
                            )}
                            <span className="absolute inset-x-1 bottom-1 h-px bg-white/40" />
                        </span>
                        <div className="hidden min-w-0 sm:block">
                            <p className="max-w-56 truncate text-sm font-extrabold tracking-tight text-foreground">{title}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-primary-700 dark:text-primary-300">
                                <ShieldCheck className="h-3 w-3 text-primary-500" />
                                {subtitle}
                            </p>
                        </div>
                    </div>

                    <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 px-4 md:flex lg:justify-start lg:ps-8">
                        {ActiveSectionIcon && (
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
                                <ActiveSectionIcon className="h-4 w-4" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{t('common.currentSection', 'Current section')}</p>
                            <p className="truncate text-xs font-extrabold text-foreground">{activeTabDetails?.label}</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <ThemeToggle className="!h-9 !w-9" />
                        <LanguageToggle variant="compact" />
                        <button
                            type="button"
                            onClick={onLogout}
                            title={t('common.signOut', 'Sign out')}
                            aria-label={t('common.signOut', 'Sign out')}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-rose-400/30 dark:hover:bg-rose-400/10 dark:hover:text-rose-300 lg:hidden"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                        {tabs.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen(true)}
                                aria-expanded={mobileNavOpen}
                                aria-controls="mobile-workspace-nav"
                                aria-label={t('common.openNav', 'Open navigation')}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-foreground shadow-sm transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] lg:hidden"
                            >
                                <Menu className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[16rem_minmax(0,1fr)]">
                <aside className="portal-workspace-sidebar sticky top-[4.25rem] hidden h-[calc(100svh-4.25rem)] min-w-0 flex-col border-e border-[#dce5ec] bg-white/80 px-4 py-5 backdrop-blur-xl dark:border-white/10 dark:bg-[#091827]/80 lg:flex">
                    <div className="px-2 pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[.16em] text-primary-700 dark:text-primary-300">{t('common.workspace', 'Workspace')}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('common.chooseSection', 'Choose a section')}</p>
                    </div>

                    <nav className="grid gap-1" aria-label={t('common.navAria', 'Portal navigation')}>
                        {tabs.map((tab) => {
                            const tabKey = tab.id || tab.key || '';
                            const isActive = activeTab === tabKey;
                            const TabIcon = tab.icon;
                            return (
                                <button
                                    key={tabKey}
                                    type="button"
                                    onClick={() => selectTab(tabKey)}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`portal-workspace-tab group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-xs font-bold transition-all ${isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-muted-foreground hover:bg-primary-50 hover:text-primary-800 dark:hover:bg-white/[0.06] dark:hover:text-primary-300'}`}
                                >
                                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${isActive ? 'bg-white/15 text-white' : 'bg-primary-50 text-primary-700 group-hover:bg-white dark:bg-white/[0.06] dark:text-primary-300'}`}>
                                        {TabIcon && <TabIcon className="h-4 w-4" />}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                                    {tab.count != null && (
                                        <span className={`min-w-6 rounded-md px-1.5 py-1 text-center text-[10px] ${isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>{tab.count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="mt-auto border-t border-slate-200 pt-4 dark:border-white/10">
                        <div className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-3 dark:bg-white/[0.04]">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300"><CircleUserRound className="h-5 w-5" /></span>
                            <div className="min-w-0 text-start">
                                <p className="truncate text-xs font-extrabold text-foreground">{userName}</p>
                                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">{centerName}</p>
                            </div>
                        </div>
                        <button type="button" onClick={onLogout} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-rose-400/30 dark:hover:bg-rose-400/10 dark:hover:text-rose-300">
                            <LogOut className="h-4 w-4" />
                            {t('common.signOut', 'Sign out')}
                        </button>
                    </div>
                </aside>

                <main id="main" tabIndex={-1} className="app-content min-w-0 space-y-6 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8">
                    {children}
                </main>
            </div>

            {mobileNavOpen && (
                <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-workspace-title">
                    <button type="button" className="absolute inset-0 bg-[#071B32]/45 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} aria-label={t('common.closeNav', 'Close navigation')} />
                    <section id="mobile-workspace-nav" className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-hidden rounded-t-[2rem] border-t border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0b1728]">
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300"><CircleUserRound className="h-5 w-5" /></span>
                                <div className="min-w-0">
                                    <p id="mobile-workspace-title" className="truncate text-sm font-bold text-foreground">{userName || t('common.workspace', 'Workspace')}</p>
                                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{centerName || t('common.chooseSection', 'Choose a section')}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setMobileNavOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15" aria-label={t('common.closeNav', 'Close navigation')}>
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <nav className="grid max-h-[calc(86dvh-5rem)] gap-1.5 overflow-y-auto p-4" aria-label={t('common.navAria', 'Portal navigation')}>
                            {tabs.map(({ id, key, label, icon: TabIcon, count }) => {
                                const tabKey = id || key || '';
                                const isActive = activeTab === tabKey;
                                return (
                                    <button key={tabKey} type="button" onClick={() => selectTab(tabKey)} aria-current={isActive ? 'page' : undefined} className={`portal-workspace-tab flex min-h-12 items-center gap-3 rounded-xl px-4 text-start text-xs font-bold ${isActive ? 'bg-primary-600 text-white' : 'text-foreground hover:bg-primary-50 dark:hover:bg-white/[0.06]'}`}>
                                        {TabIcon && <TabIcon className="h-4 w-4 shrink-0" />}
                                        <span className="min-w-0 flex-1 truncate">{label}</span>
                                        {count != null && <span className={isActive ? 'text-white/80' : 'text-primary-700 dark:text-primary-300'}>{count}</span>}
                                        {isActive ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                                    </button>
                                );
                            })}
                        </nav>
                    </section>
                </div>
            )}
        </div>
    );
};
