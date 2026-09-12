import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser } from '../../store/authSlice';
import { resolveWorkspaceNavigation } from '../../config/routes';

// Reject inaccessible sections before mounting their page (and its data queries).
// Standalone/embedded pages keep their local navigation outside this boundary.
const WorkspaceSectionBoundary = ({ children }) => {
    const user = useSelector(selectCurrentUser);
    const location = useLocation();
    const { t } = useTranslation('navigation');
    if (location.pathname === '/settings') {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'profile' || tab === 'security' || user?.mustChangePassword) {
            return <Navigate to={tab === 'profile' && !user?.mustChangePassword ? '/profile' : '/profile?section=security'} replace />;
        }
    }
    const resolved = resolveWorkspaceNavigation(location.pathname, location.search, user);
    if (!resolved) return children;
    if (resolved.redirect) return <Navigate to={`${resolved.redirect}${location.hash}`} replace />;
    return (
        <section aria-labelledby="workspace-section-heading" className="min-w-0 [&_[data-workspace-tabs]]:hidden [&_[data-workspace-layout]]:!grid-cols-1">
            <header className="mb-4 flex min-w-0 flex-wrap items-center gap-2 text-sm" aria-live="polite" aria-atomic="true">
                <span className="text-[var(--VIARA-muted)]">{t(`items.${resolved.workspace.key}`)}</span>
                <span aria-hidden="true" className="text-[var(--VIARA-muted)]">/</span>
                <h2 id="workspace-section-heading" className="font-bold text-[var(--VIARA-ink)]">{t(`items.${resolved.active.key}`)}</h2>
            </header>
            {children}
        </section>
    );
};

export default WorkspaceSectionBoundary;
