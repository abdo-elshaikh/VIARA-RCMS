import React from 'react';

/**
 * Card component with optional header, footer, and hover effects
 */
const Card = ({
    children,
    header,
    footer,
    className = '',
    hoverable = false,
    onClick,
    ...props
}) => {
    const baseStyles = 'bg-white dark:bg-[var(--rcms-surface-raised)] rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:shadow-black/20 border border-slate-200/80 dark:border-[var(--rcms-line)] transition-all duration-200';
    const hoverStyles = hoverable || onClick ? 'hover:border-cyan-200 dark:hover:border-cyan-300/30 hover:shadow-[0_16px_35px_-24px_rgba(15,23,42,0.38)] dark:hover:shadow-black/40 hover:-translate-y-0.5 cursor-pointer' : '';

    return (
        <div
            className={`${baseStyles} ${hoverStyles} ${className}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            {...props}
        >
            {header && (
                <div className="border-b border-slate-100 px-5 py-4 dark:border-[var(--rcms-line)] sm:px-6">
                    {typeof header === 'string' ? (
                        <h3 className="text-lg font-bold text-slate-800 dark:text-[var(--rcms-ink)]">{header}</h3>
                    ) : (
                        header
                    )}
                </div>
            )}

            <div className="p-5 sm:p-6">
                {children}
            </div>

            {footer && (
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] rounded-b-2xl">
                    {footer}
                </div>
            )}
        </div>
    );
};

export default Card;
