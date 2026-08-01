import React, { useId } from 'react';

const PageHeader = ({ 
    icon: Icon, 
    eyebrowIcon: EyebrowIcon,
    eyebrow, 
    title, 
    description, 
    actions,
    children,
    meta,
    compact = false,
    className = '',
    contentClassName = '',
    actionsClassName = '',
    ariaLabel
}) => {
    const headingId = useId();
    const paddingClass = compact ? 'px-4 py-4 sm:px-5' : 'px-4 py-4 sm:px-5 lg:px-6 lg:py-5';
    const iconSize = compact ? 20 : 22;

    return (
        <section
            className={`rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-ink)] ${paddingClass} ${className}`}
            aria-labelledby={title ? headingId : undefined}
            aria-label={!title ? ariaLabel : undefined}
        >
            <div className={`grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center ${contentClassName}`}>
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    {Icon && (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-100 bg-teal-50 text-teal-700 shadow-sm dark:border-teal-900/60 dark:bg-teal-950/35 dark:text-teal-300 sm:h-12 sm:w-12">
                            <Icon size={iconSize} aria-hidden="true" />
                        </span>
                    )}
                    <div className="min-w-0">
                        {eyebrow && (
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-teal-700 dark:text-teal-300 sm:text-xs">
                                {EyebrowIcon && <EyebrowIcon size={13} aria-hidden="true" />}
                                {eyebrow}
                            </div>
                        )}
                        {title && (
                            <h1 id={headingId} className="break-words text-2xl font-black leading-tight tracking-tight text-slate-950 dark:text-[var(--rcms-ink)] sm:text-3xl">
                                {title}
                            </h1>
                        )}
                        {description && (
                            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500 dark:text-[var(--rcms-muted)]">
                                {description}
                            </p>
                        )}
                        {meta && (
                            <div className="mt-5 flex min-w-0 flex-wrap gap-2">
                                {meta}
                            </div>
                        )}
                        {children}
                    </div>
                </div>

                {actions && (
                    <div className={`flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end ${actionsClassName}`}>
                        {actions}
                    </div>
                )}
            </div>
        </section>
    );
};

export default PageHeader;
