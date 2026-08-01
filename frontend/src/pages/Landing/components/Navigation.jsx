import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Activity, Workflow } from 'lucide-react';
import { BrandLink } from './FloatingControls';

const NAV_ICONS = {
    overview: Activity,
    modules: Sparkles,
    workflow: Workflow,
};

export const MobileMenu = ({ t, isRtl, menuRef, centerName, centerInitials, logoUrl, navItems, focusZone, close }) => (
    <div
        className="fixed inset-0 z-50 bg-slate-950/60 p-3 pt-[4.5rem] backdrop-blur-md lg:hidden animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.primaryLabel', { defaultValue: 'Primary navigation' })}
    >
        <div
            id="landing-mobile-menu"
            ref={menuRef}
            className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-800 dark:bg-slate-950 animate-in slide-in-from-top-4 duration-300"
        >
            <BrandLink
                centerName={centerName}
                centerInitials={centerInitials}
                logoUrl={logoUrl}
                onClick={close}
                compact
                isRtl={isRtl}
                ariaLabel={centerName}
            />
            <nav className="mt-4 grid gap-1">
                {navItems.map((item, index) => {
                    const Icon = NAV_ICONS[item.id] || Sparkles;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            style={{ animationDelay: `${0.04 + index * 0.05}s` }}
                            onClick={() => {
                                focusZone(item.id);
                                close();
                            }}
                            className="flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 text-start text-sm font-bold text-slate-700 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100 animate-in slide-in-from-bottom-2 fill-mode-both"
                        >
                            <Icon size={15} strokeWidth={2} className="shrink-0 text-brand-500" />
                            {item.label}
                        </button>
                    );
                })}
            </nav>
            <Link
                to="/login"
                onClick={close}
                className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
                {t('managementLanding.openWorkspace', { defaultValue: isRtl ? 'فتح مساحة عمل الموظفين' : 'Open staff workspace' })}
            </Link>
        </div>
    </div>
);

export const ZoneDock = ({ t, navItems, activeZone, focusZone }) => (
    <nav
        aria-label={t('nav.primaryLabel', { defaultValue: 'Primary navigation' })}
        className="fixed inset-x-2.5 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-sm grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1.5 shadow-lg backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 lg:hidden"
    >
        {navItems.map((item) => {
            const Icon = NAV_ICONS[item.id] || Sparkles;
            const active = activeZone === item.id;
            return (
                <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => focusZone(item.id)}
                    className={`flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[9.5px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${active
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                        }`}
                >
                    <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                    <span className="w-full truncate px-0.5 text-center">{item.label}</span>
                </button>
            );
        })}
    </nav>
);
