import React from 'react';

const PagePanel = ({ title, description, icon: Icon, action, children, className = '' }) => {
    return (
        <section className={`flex min-h-[420px] min-w-0 flex-col rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]/80 p-5 sm:p-6 ${className}`}>
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100/50 dark:border-[var(--VIARA-line)] pb-5">
                <div className="flex min-w-0 items-start gap-3">
                    {Icon && (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-1 ring-[rgba(var(--VIARA-accent-rgb),0.18)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.16)] dark:text-[var(--VIARA-accent-text)] dark:ring-[rgba(var(--VIARA-accent-rgb),0.24)]">
                            <Icon size={19} />
                        </span>
                    )}
                    <div className="min-w-0">
                        {title && <h2 className="text-base font-bold text-slate-950 dark:text-[var(--VIARA-ink)]">{title}</h2>}
                        {description && <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-[var(--VIARA-muted)]">{description}</p>}
                    </div>
                </div>
                {action && <div>{action}</div>}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
                {children}
            </div>
        </section>
    );
};

export default PagePanel;
