// PageHeader.jsx - VIARA Modern Unified Workspace Header
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';

const metricToneClasses = {
    teal: 'page-header-metric-tone-accent',
    cyan: 'page-header-metric-tone-accent',
    blue: 'page-header-metric-tone-accent',
    sky: 'page-header-metric-tone-accent',
    emerald: 'page-header-metric-tone-accent',
    violet: 'page-header-metric-tone-accent',
    purple: 'page-header-metric-tone-accent',
    fuchsia: 'page-header-metric-tone-accent',
    indigo: 'page-header-metric-tone-accent',
    amber: 'page-header-metric-tone-warning',
    rose: 'page-header-metric-tone-danger',
    slate: 'page-header-metric-tone-neutral',
};

const metricToneIconClasses = {
    teal: 'bg-teal-600 text-white border-teal-700/80 shadow-xs shadow-teal-600/30 dark:bg-teal-600 dark:border-teal-500',
    cyan: 'bg-cyan-600 text-white border-cyan-700/80 shadow-xs shadow-cyan-600/30 dark:bg-cyan-600 dark:border-cyan-500',
    blue: 'bg-blue-600 text-white border-blue-700/80 shadow-xs shadow-blue-600/30 dark:bg-blue-600 dark:border-blue-500',
    sky: 'bg-sky-600 text-white border-sky-700/80 shadow-xs shadow-sky-600/30 dark:bg-sky-600 dark:border-sky-500',
    emerald: 'bg-emerald-600 text-white border-emerald-700/80 shadow-xs shadow-emerald-600/30 dark:bg-emerald-600 dark:border-emerald-500',
    indigo: 'bg-indigo-600 text-white border-indigo-700/80 shadow-xs shadow-indigo-600/30 dark:bg-indigo-600 dark:border-indigo-500',
    violet: 'bg-violet-600 text-white border-violet-700/80 shadow-xs shadow-violet-600/30 dark:bg-violet-600 dark:border-violet-500',
    purple: 'bg-purple-600 text-white border-purple-700/80 shadow-xs shadow-purple-600/30 dark:bg-purple-600 dark:border-purple-500',
    fuchsia: 'bg-fuchsia-600 text-white border-fuchsia-700/80 shadow-xs shadow-fuchsia-600/30 dark:bg-fuchsia-600 dark:border-fuchsia-500',
    amber: 'bg-amber-600 text-white border-amber-700/80 shadow-xs shadow-amber-600/30 dark:bg-amber-500 dark:border-amber-400',
    rose: 'bg-rose-600 text-white border-rose-700/80 shadow-xs shadow-rose-600/30 dark:bg-rose-600 dark:border-rose-500',
    slate: 'bg-slate-700 text-white border-slate-800/80 shadow-xs shadow-slate-700/30 dark:bg-slate-700 dark:border-slate-600',
};

const metricToneCardClasses = {
    teal: 'border-teal-300/90 bg-gradient-to-br from-teal-50/90 via-teal-50/40 to-white hover:border-teal-500 hover:shadow-md hover:shadow-teal-500/15 dark:border-teal-800/80 dark:from-teal-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-teal-600',
    cyan: 'border-cyan-300/90 bg-gradient-to-br from-cyan-50/90 via-cyan-50/40 to-white hover:border-cyan-500 hover:shadow-md hover:shadow-cyan-500/15 dark:border-cyan-800/80 dark:from-cyan-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-cyan-600',
    blue: 'border-blue-300/90 bg-gradient-to-br from-blue-50/90 via-blue-50/40 to-white hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/15 dark:border-blue-800/80 dark:from-blue-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-blue-600',
    sky: 'border-sky-300/90 bg-gradient-to-br from-sky-50/90 via-sky-50/40 to-white hover:border-sky-500 hover:shadow-md hover:shadow-sky-500/15 dark:border-sky-800/80 dark:from-sky-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-sky-600',
    emerald: 'border-emerald-300/90 bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white hover:border-emerald-500 hover:shadow-md hover:shadow-emerald-500/15 dark:border-emerald-800/80 dark:from-emerald-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-emerald-600',
    indigo: 'border-indigo-300/90 bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-500/15 dark:border-indigo-800/80 dark:from-indigo-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-indigo-600',
    violet: 'border-violet-300/90 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-white hover:border-violet-500 hover:shadow-md hover:shadow-violet-500/15 dark:border-violet-800/80 dark:from-violet-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-violet-600',
    purple: 'border-purple-300/90 bg-gradient-to-br from-purple-50/90 via-purple-50/40 to-white hover:border-purple-500 hover:shadow-md hover:shadow-purple-500/15 dark:border-purple-800/80 dark:from-purple-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-purple-600',
    fuchsia: 'border-fuchsia-300/90 bg-gradient-to-br from-fuchsia-50/90 via-fuchsia-50/40 to-white hover:border-fuchsia-500 hover:shadow-md hover:shadow-fuchsia-500/15 dark:border-fuchsia-800/80 dark:from-fuchsia-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-fuchsia-600',
    amber: 'border-amber-300/90 bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-white hover:border-amber-500 hover:shadow-md hover:shadow-amber-500/15 dark:border-amber-800/80 dark:from-amber-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-amber-600',
    rose: 'border-rose-300/90 bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white hover:border-rose-500 hover:shadow-md hover:shadow-rose-500/15 dark:border-rose-800/80 dark:from-rose-950/50 dark:via-slate-900 dark:to-slate-900 dark:hover:border-rose-600',
    slate: 'border-slate-300/90 bg-gradient-to-br from-slate-100/90 via-slate-50/50 to-white hover:border-slate-500 hover:shadow-md hover:shadow-slate-500/15 dark:border-slate-700/80 dark:from-slate-900/80 dark:via-slate-900 dark:to-slate-950 dark:hover:border-slate-600',
};

const isValidMetric = (metric) =>
    metric && typeof metric === 'object' && 'label' in metric && ('value' in metric || metric.loading);

const Metric = ({ metric, index, density, compact }) => {
    const isActionable = !!metric.onClick;
    const isError = !!metric.error;
    const isLoading = !!metric.loading;
    const value = isError ? '—' : metric.value;
    const toneClass = metricToneClasses[metric.tone] || metricToneClasses.teal;
    const iconClass = metricToneIconClasses[metric.tone] || metricToneIconClasses.teal;
    const cardToneClass = metricToneCardClasses[metric.tone] || metricToneCardClasses.teal;
    const metricKey = metric.key || metric.label || index;

    const metricClasses = [
        'page-header-metric',
        'group',
        'relative',
        'flex',
        'min-w-0',
        'items-center',
        'justify-between',
        'text-start',
        'transition-all duration-200',
        cardToneClass,
        density.metric,
        isActionable && 'page-header-metric-action cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]',
        metric.className || '',
    ].filter(Boolean).join(' ');

    if (isActionable) {
        return (
            <button
                key={metricKey}
                type="button"
                onClick={metric.onClick}
                aria-label={`${value} ${metric.label}`}
                aria-busy={isLoading || undefined}
                className={metricClasses}
            >
                <MetricContent metric={metric} density={density} compact={compact} toneClass={toneClass} iconClass={iconClass} isError={isError} isLoading={isLoading} value={value} isActionable={isActionable} />
            </button>
        );
    }

    return (
        <div
            key={metricKey}
            aria-busy={isLoading || undefined}
            className={metricClasses}
        >
            <MetricContent metric={metric} density={density} compact={compact} toneClass={toneClass} iconClass={iconClass} isError={isError} isLoading={isLoading} value={value} isActionable={isActionable} />
        </div>
    );
};

const MetricContent = ({ metric, density, compact, toneClass, iconClass, isError, isLoading, value, isActionable }) => {
    const metricIconSize = compact ? 16 : 18;

    return (
        <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline gap-2">
                    <span className={`page-header-metric-value truncate font-black tabular-nums tracking-tight text-slate-950 dark:text-white ${density.metricValue}`} dir="ltr">
                        {isLoading ? '…' : value}
                    </span>
                    {metric.badge && (
                        <span className="page-header-metric-badge shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1">
                            {metric.badge}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <span className="page-header-metric-label block truncate text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        {metric.label}
                    </span>
                </div>

                {metric.detail && (
                    <p className="page-header-metric-detail truncate text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        {metric.detail}
                    </p>
                )}
            </div>

            {metric.icon && (
                <span className={`page-header-metric-icon-wrapper grid shrink-0 place-items-center rounded-xl border shadow-xs transition-all duration-200 group-hover:scale-105 group-hover:shadow-md ${density.metricIcon} ${toneClass} ${iconClass}`}>
                    {isLoading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                    ) : (
                        <metric.icon size={metricIconSize} aria-hidden="true" />
                    )}
                </span>
            )}

            {isActionable && (
                <span className="shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-180">
                    <ChevronRight size={14} />
                </span>
            )}
        </div>
    );
};

const densityClasses = {
    comfortable: {
        root: '',
        content: 'gap-4 p-4 sm:px-5 sm:py-5 lg:px-6',
        lead: 'gap-3.5 sm:gap-4',
        icon: 'h-11 w-11 rounded-2xl sm:h-12 sm:w-12',
        eyebrow: 'mb-1.5 gap-1.5 text-[10px] tracking-[.14em] sm:text-[11px]',
        title: 'text-2xl sm:text-3xl font-extrabold',
        description: 'mt-1.5 text-sm leading-relaxed max-w-3xl',
        meta: 'gap-2',
        actions: 'gap-2 sm:gap-2.5',
        metric: 'gap-3 px-4 py-3.5',
        metricIcon: 'h-10 w-10 rounded-xl',
        metricValue: 'text-xl sm:text-2xl',
    },
    compact: {
        root: 'app-page-header--compact',
        content: 'gap-3 p-3 sm:px-4 sm:py-3.5',
        lead: 'gap-2.5',
        icon: 'h-9 w-9 rounded-lg',
        eyebrow: 'mb-1 gap-1.5 text-[9px] tracking-[.13em] sm:text-[10px]',
        title: 'text-xl sm:text-2xl font-bold',
        description: 'mt-1 text-xs leading-5 sm:text-[13px] max-w-2xl',
        meta: 'gap-1.5',
        actions: 'gap-1.5',
        metric: 'gap-2 px-3 py-2',
        metricIcon: 'h-7 w-7 rounded-lg',
        metricValue: 'text-sm sm:text-base',
    },
};

const STORAGE_KEY = 'viara_show_header_metrics';

const PageHeader = ({
    icon: Icon,
    logoUrl,
    leading,
    eyebrowIcon: EyebrowIcon,
    eyebrow,
    title,
    description,
    actions,
    children,
    meta,
    metrics = [],
    metricsLabel,
    compact = false,
    className = '',
    contentClassName = '',
    actionsClassName = '',
    ariaLabel
}) => {
    const headingId = useId();
    const metricsId = useId();
    const { t } = useTranslation('common');
    const [showMetrics, setShowMetrics] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved !== null ? JSON.parse(saved) : true;
        } catch {
            return true;
        }
    });

    const toggleMetrics = () => {
        setShowMetrics((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Ignore storage errors
            }
            return next;
        });
    };

    const density = compact ? densityClasses.compact : densityClasses.comfortable;
    const iconSize = compact ? 18 : 22;
    const visibleMetrics = Array.isArray(metrics)
        ? metrics.filter(isValidMetric)
        : [];
    const hasMetrics = visibleMetrics.length > 0;

    const toggleLabel = showMetrics
        ? t('pageHeader.hideMetrics', { defaultValue: 'Hide statistics' })
        : t('pageHeader.showMetrics', { defaultValue: 'Show statistics' });

    return (
        <section
            className={`app-page-header ${density.root} ${className}`}
            aria-labelledby={title ? headingId : undefined}
            aria-label={!title ? ariaLabel : undefined}
        >
            <div className="page-header-glow" aria-hidden="true" />
            <div className="page-header-glow-secondary" aria-hidden="true" />

            {/* Header Content Area */}
            <div className={`page-header-content relative flex flex-col gap-3.5 ${density.content} ${contentClassName}`}>
                {/* Top Section: Title & Identity + Action Buttons */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className={`flex min-w-0 flex-1 items-start ${density.lead}`}>
                        {leading ? (
                            <div className="shrink-0">{leading}</div>
                        ) : logoUrl ? (
                            <div className="relative flex shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800/90 dark:ring-emerald-500/40">
                                <img
                                    src={logoUrl}
                                    alt=""
                                    className="h-11 w-11 sm:h-12 sm:w-12 object-contain"
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = '/center-logo.png';
                                    }}
                                />
                            </div>
                        ) : Icon ? (
                            <span className={`page-header-icon flex shrink-0 items-center justify-center border shadow-xs transition-transform duration-200 hover:scale-105 ${density.icon}`}>
                                <Icon size={iconSize} aria-hidden="true" />
                            </span>
                        ) : null}

                        <div className="min-w-0 flex-1">
                            {eyebrow && (
                                <div className={`page-header-eyebrow inline-flex flex-wrap items-center font-black uppercase text-teal-800 dark:text-teal-300 ${density.eyebrow}`}>
                                    {EyebrowIcon && <EyebrowIcon size={compact ? 11 : 12} aria-hidden="true" />}
                                    <span>{eyebrow}</span>
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-600 shadow-xs shadow-teal-600/50" />
                                </div>
                            )}
                            {title && (
                                <h1 id={headingId} className={`page-header-title break-normal leading-tight tracking-tight text-slate-900 dark:text-white ${density.title}`}>
                                    {title}
                                </h1>
                            )}
                            {description && (
                                <p className={`page-header-description font-medium text-slate-600 dark:text-slate-300 ${density.description}`}>
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Right Action Section */}
                    {actions && (
                        <div className={`page-header-actions flex shrink-0 flex-wrap items-center ${density.actions} ${actionsClassName} lg:justify-end`}>
                            {actions}
                        </div>
                    )}
                </div>

                {/* Secondary Section: Metadata Badges & Children */}
                {(meta || children) && (
                    <div className="page-header-meta-row flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                        {meta && (
                            <div className={`page-header-meta flex min-w-0 flex-wrap items-center ${density.meta}`}>
                                {meta}
                            </div>
                        )}
                        {children && <div className="page-header-children flex-1">{children}</div>}
                    </div>
                )}
            </div>

            {/* Metrics Section with Toolbar */}
            {hasMetrics && (
                <div className="page-header-metrics-section border-t border-slate-200/80 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/30">
                    <div className="page-header-metrics-toolbar flex items-center justify-between px-4 py-2 sm:px-5">
                        <div className="flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full bg-teal-500/80 shadow-xs shadow-teal-500/50 animate-pulse" aria-hidden="true" />
                            <span className="text-xs font-bold tracking-wide text-slate-600 dark:text-slate-300">
                                {metricsLabel || t('pageHeader.indicators', { defaultValue: 'Overview & Statistics' })}
                            </span>
                        </div>

                        <button
                            type="button"
                            aria-label={toggleLabel}
                            title={toggleLabel}
                            aria-expanded={showMetrics}
                            aria-controls={metricsId}
                            onClick={toggleMetrics}
                            className="page-header-metrics-toggle inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-slate-300/90 bg-white px-2.5 py-1 text-xs font-black text-slate-700 shadow-2xs transition-all duration-200 hover:border-teal-400 hover:bg-slate-50 hover:scale-[1.02] active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-600"
                        >
                            {showMetrics ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                            <span>{toggleLabel}</span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300" aria-hidden="true">
                                {visibleMetrics.length}
                            </span>
                        </button>
                    </div>

                    {showMetrics && (
                        <div
                            id={metricsId}
                            className="page-header-metrics px-4 pb-4 pt-1 sm:px-5 sm:pb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))] transition-all duration-200"
                            role="group"
                            aria-label={metricsLabel}
                        >
                            {visibleMetrics.map((metric, index) => (
                                <Metric
                                    key={metric.key || metric.label || index}
                                    metric={metric}
                                    index={index}
                                    density={density}
                                    compact={compact}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default PageHeader;