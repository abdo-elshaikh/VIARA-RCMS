import React from 'react';

const PagePanel = ({ title, description, icon: Icon, action, children, className = '' }) => {
    return (
        <section className={`flex min-h-[420px] min-w-0 flex-col rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]/80 p-5 sm:p-6 ${className}`}>
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100/50 dark:border-[var(--rcms-line)] pb-5">
                <div className="flex min-w-0 items-start gap-3">
                    {Icon && (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 ring-1 ring-cyan-100 dark:ring-cyan-900/50">
                            <Icon size={19} />
                        </span>
                    )}
                    <div className="min-w-0">
                        {title && <h2 className="text-base font-bold text-slate-950 dark:text-[var(--rcms-ink)]">{title}</h2>}
                        {description && <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-[var(--rcms-muted)]">{description}</p>}
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
