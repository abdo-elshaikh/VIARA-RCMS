import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser } from '../../store/authSlice';
import { resolveWorkspaceNavigation } from '../../config/routes';

// Reject inaccessible sections before mounting their page (and its data queries).
// The visual boundary is intentionally compact so page-level headers remain primary.
const WorkspaceSectionBoundary = ({ children }) => {
    const user = useSelector(selectCurrentUser);
    const location = useLocation();
    const { t, i18n } = useTranslation('navigation');
    const isRtl = i18n.dir() === 'rtl';

    if (location.pathname === '/settings') {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'profile' || tab === 'security' || user?.mustChangePassword) {
            return <Navigate to={tab === 'profile' && !user?.mustChangePassword ? '/profile' : '/profile?section=security'} replace />;
        }
    }

    const resolved = resolveWorkspaceNavigation(location.pathname, location.search, user);
    if (!resolved) return children;
    if (resolved.redirect) return <Navigate to={`${resolved.redirect}${location.hash}`} replace />;

    const workspaceLabel = t(`items.${resolved.workspace.key}`);
    const activeLabel = t(`items.${resolved.active.key}`);
    const showParent = resolved.workspace.key !== resolved.active.key;

    return (
        <section
            aria-labelledby="workspace-section-heading"
            data-workspace-boundary
            className={`min-w-0 ${location.pathname === '/equipment' ? '' : '[&_[data-workspace-tabs]]:hidden [&_[data-workspace-layout]]:!grid-cols-1'}`}
        >
            <header
                className="mb-2.5 flex min-h-6 min-w-0 items-center px-1"
                aria-live="polite"
                aria-atomic="true"
            >
                <nav
                    aria-label={t('breadcrumb', { defaultValue: 'Breadcrumb' })}
                    className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-2xs backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-400"
                >
                    <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60 motion-reduce:hidden" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600 dark:bg-teal-400" />
                    </span>
                    {showParent && (
                        <>
                            <Link
                                to={resolved.workspace.to}
                                className="max-w-44 truncate text-slate-600 transition-colors hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-300"
                            >
                                {workspaceLabel}
                            </Link>
                            <ChevronRight
                                size={12}
                                aria-hidden="true"
                                className={`shrink-0 text-slate-300 dark:text-slate-600 ${isRtl ? 'rotate-180' : ''}`}
                            />
                        </>
                    )}
                    <h2
                        id="workspace-section-heading"
                        aria-current="page"
                        className="max-w-56 truncate font-black text-slate-900 dark:text-white"
                    >
                        {activeLabel}
                    </h2>
                </nav>
            </header>
            {children}
        </section>
    );
};

export default WorkspaceSectionBoundary;
