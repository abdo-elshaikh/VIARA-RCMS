import React from 'react';
import { useTranslation } from 'react-i18next';

// Deterministic skeleton bar heights: Math.random() in render made the
// component impure (different heights per re-render).
const SKELETON_BAR_HEIGHTS = [52, 78, 61, 88, 70, 45, 66];

/**
 * Skeleton loader for stat cards
 */
export const StatCardSkeleton = () => (
    <div className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-slate-100 animate-pulse dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]">
        <div className="p-6">
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <div className="h-3 w-24 bg-slate-200 rounded mb-3 dark:bg-[var(--VIARA-surface-muted)]"></div>
                    <div className="h-10 w-20 bg-slate-200 rounded dark:bg-[var(--VIARA-surface-muted)]"></div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-[var(--VIARA-surface-muted)]">
                    <div className="h-7 w-7 bg-slate-200 rounded dark:bg-[var(--VIARA-line-strong)]"></div>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <div className="h-6 w-16 bg-slate-200 rounded-full dark:bg-[var(--VIARA-surface-muted)]"></div>
                <div className="h-8 w-20 bg-slate-100 rounded dark:bg-[var(--VIARA-surface-muted)]"></div>
            </div>
        </div>
    </div>
);

/**
 * Skeleton loader for charts
 */
export const ChartSkeleton = ({ height = 'h-80' }) => (
    <div className={`bg-white rounded-2xl shadow-lg border border-slate-100 p-6 animate-pulse dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] ${height}`}>
        <div className="flex justify-between items-center mb-6">
            <div className="h-5 w-32 bg-slate-200 rounded dark:bg-[var(--VIARA-surface-muted)]"></div>
            <div className="flex gap-4">
                <div className="h-3 w-20 bg-slate-200 rounded dark:bg-[var(--VIARA-surface-muted)]"></div>
                <div className="h-3 w-20 bg-slate-200 rounded dark:bg-[var(--VIARA-surface-muted)]"></div>
            </div>
        </div>
        <div className="flex items-end justify-around h-64 gap-2" aria-hidden="true">
            {SKELETON_BAR_HEIGHTS.map((h, i) => (
                <div key={i} className="w-full bg-slate-200 rounded-t dark:bg-[var(--VIARA-surface-muted)]" style={{ height: `${h}%` }}></div>
            ))}
        </div>
    </div>
);

/**
 * Error display component with retry
 */
export const DashboardError = ({ error, retry }) => {
    const { t } = useTranslation('dashboard');
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[var(--VIARA-canvas)]" role="alert">
            <div className="bg-white rounded-2xl shadow-xl border border-red-100 p-8 max-w-md text-center dark:border-rose-400/20 dark:bg-[var(--VIARA-surface-raised)]">
                <div className="inline-flex p-4 rounded-full bg-red-50 mb-4">
                    <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2 dark:text-[var(--VIARA-ink)]">{t('error.title')}</h3>
                <p className="text-slate-600 mb-6 dark:text-[var(--VIARA-muted)]">
                    {error?.data?.message || error?.message || t('error.description')}
                </p>
                {retry && (
                    <button
                        onClick={retry}
                        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                    >
                        {t('error.retry')}
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * Loading overlay for refresh
 */
export const RefreshIndicator = () => {
    const { t } = useTranslation('dashboard');
    return (
        <div className="fixed top-4 end-4 z-50">
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-2 flex items-center gap-2 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" aria-hidden="true"></div>
                <span className="text-sm text-slate-700 font-medium dark:text-[var(--VIARA-ink)]" aria-live="polite">{t('error.updating')}</span>
            </div>
        </div>
    );
};
