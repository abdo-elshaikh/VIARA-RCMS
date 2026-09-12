import React, { useId } from 'react';

const metricToneClasses = {
    teal: 'page-header-metric-tone-accent',
    cyan: 'page-header-metric-tone-accent',
    blue: 'page-header-metric-tone-accent',
    sky: 'page-header-metric-tone-accent',
    emerald: 'page-header-metric-tone-accent',
    violet: 'page-header-metric-tone-accent',
    amber: 'page-header-metric-tone-warning',
    rose: 'page-header-metric-tone-danger',
    slate: 'page-header-metric-tone-neutral',
};

const densityClasses = {
    comfortable: {
        root: '',
        content: 'gap-3 p-4 sm:px-5 sm:py-4 lg:px-5',
        lead: 'gap-3',
        icon: 'h-10 w-10 rounded-xl sm:h-11 sm:w-11',
        eyebrow: 'mb-1.5 gap-1.5 text-[10px] tracking-[.14em] sm:text-[11px]',
        title: 'text-2xl',
        description: 'mt-1.5 text-sm leading-5',
        meta: 'mt-2.5 gap-2',
        actions: 'gap-2',
        metric: 'gap-2.5 px-4 py-3',
        metricIcon: 'h-9 w-9 rounded-xl',
        metricValue: 'text-lg',
    },
    compact: {
        root: 'app-page-header--compact',
        content: 'gap-3 p-3 sm:px-4 sm:py-3.5',
        lead: 'gap-2.5',
        icon: 'h-9 w-9 rounded-lg',
        eyebrow: 'mb-1 gap-1.5 text-[9px] tracking-[.13em] sm:text-[10px]',
        title: 'text-xl sm:text-2xl',
        description: 'mt-1 text-xs leading-5 sm:text-[13px]',
        meta: 'mt-2 gap-1.5',
        actions: 'gap-1.5',
        metric: 'gap-2.5 px-3.5 py-2.5',
        metricIcon: 'h-8 w-8 rounded-lg',
        metricValue: 'text-base',
    },
};

const PageHeader = ({
    icon: Icon,
    logoUrl,
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
    const density = compact ? densityClasses.compact : densityClasses.comfortable;
    const iconSize = compact ? 18 : 20;
    const metricIconSize = compact ? 15 : 17;
    const visibleMetrics = Array.isArray(metrics) ? metrics.filter(Boolean) : [];

    return (
        <section
            className={`app-page-header ${density.root} ${className}`}
            aria-labelledby={title ? headingId : undefined}
            aria-label={!title ? ariaLabel : undefined}
        >
            <div className="page-header-glow" aria-hidden="true" />
            <div className={`page-header-content relative grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center ${density.content} ${contentClassName}`}>
                <div className={`flex min-w-0 items-start ${density.lead}`}>
                    {logoUrl ? (
                        <div className="relative flex shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 shadow-md ring-1 ring-slate-200/80 dark:ring-emerald-500/40">
                            <img
                                src={logoUrl}
                                alt={title || ''}
                                className="h-11 w-11 sm:h-12 sm:w-12 object-contain"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = '/center-logo.png';
                                }}
                            />
                        </div>
                    ) : Icon ? (
                        <span className={`page-header-icon flex shrink-0 items-center justify-center border shadow-sm ${density.icon}`}>
                            <Icon size={iconSize} aria-hidden="true" />
                        </span>
                    ) : null}
                    <div className="min-w-0">
                        {eyebrow && (
                            <div className={`page-header-eyebrow flex flex-wrap items-center font-black uppercase ${density.eyebrow}`}>
                                {EyebrowIcon && <EyebrowIcon size={compact ? 11 : 12} aria-hidden="true" />}
                                <span>{eyebrow}</span>
                            </div>
                        )}
                        {title && (
                            <h1 id={headingId} className={`page-header-title break-words font-black leading-tight tracking-tight ${density.title}`}>
                                {title}
                            </h1>
                        )}
                        {description && (
                            <p className={`page-header-description max-w-3xl font-medium ${density.description}`}>
                                {description}
                            </p>
                        )}
                        {meta && (
                            <div className={`page-header-meta flex min-w-0 flex-wrap ${density.meta}`}>
                                {meta}
                            </div>
                        )}
                        {children && <div className="page-header-children">{children}</div>}
                    </div>
                </div>

                {actions && (
                    <div className={`page-header-actions flex min-w-0 flex-col sm:flex-row sm:flex-wrap xl:justify-end ${density.actions} ${actionsClassName}`}>
                        {actions}
                    </div>
                )}
            </div>

            {visibleMetrics.length > 0 && (
                <div
                    className="page-header-metrics relative grid [grid-template-columns:repeat(auto-fit,minmax(min(155px,100%),1fr))]"
                    role="group"
                    aria-label={metricsLabel}
                >
                    {visibleMetrics.map((metric, index) => {
                        const MetricIcon = metric.icon;
                        const Component = metric.onClick ? 'button' : 'div';
                        const value = metric.error ? '—' : metric.value;
                        return (
                            <Component
                                key={metric.key || metric.label || index}
                                {...(metric.onClick ? { type: 'button', onClick: metric.onClick } : {})}
                                aria-busy={metric.loading || undefined}
                                className={`page-header-metric group flex min-w-0 items-center text-start transition ${density.metric} ${metric.onClick ? 'page-header-metric-action cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset' : ''} ${metric.className || ''}`}
                            >
                                {MetricIcon && (
                                    <span className={`grid shrink-0 place-items-center border ${density.metricIcon} ${metricToneClasses[metric.tone] || metricToneClasses.teal}`}>
                                        {metric.loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <MetricIcon size={metricIconSize} aria-hidden="true" />}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className={`page-header-metric-value truncate font-black tabular-nums ${density.metricValue}`}>{metric.loading ? '…' : value}</span>
                                        {metric.badge && <span className="page-header-metric-badge shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1">{metric.badge}</span>}
                                    </span>
                                    <span className="page-header-metric-label block truncate text-[10px] font-black uppercase tracking-wide">{metric.label}</span>
                                    {metric.detail && <span className="page-header-metric-detail mt-0.5 block truncate text-[10px] font-semibold">{metric.detail}</span>}
                                </span>
                            </Component>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default PageHeader;
