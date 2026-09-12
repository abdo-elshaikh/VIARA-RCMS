import React from 'react';

const PagePanel = ({ title, description, icon: Icon, action, children, className = '' }) => {
    return (
        <section className={`ds-panel flex min-h-[420px] min-w-0 flex-col border backdrop-blur-xl ${className}`}>
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--VIARA-line)] pb-5">
                <div className="flex min-w-0 items-start gap-3">
                    {Icon && (
                        <span className="ds-panel-icon flex h-10 w-10 shrink-0 items-center justify-center">
                            <Icon size={19} aria-hidden="true" />
                        </span>
                    )}
                    <div className="min-w-0">
                        {title && <h2 className="text-base font-bold text-[var(--VIARA-ink)]">{title}</h2>}
                        {description && <p className="mt-1 text-sm leading-5 text-[var(--VIARA-muted)]">{description}</p>}
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
