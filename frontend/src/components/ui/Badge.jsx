import React from 'react';

const variants = {
    default: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-[var(--VIARA-surface-muted)] dark:text-[var(--VIARA-muted)] dark:border-[var(--VIARA-line)]',
    primary: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] border-[rgba(var(--VIARA-accent-rgb),0.24)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.16)] dark:text-[var(--VIARA-accent-text)] dark:border-[rgba(var(--VIARA-accent-rgb),0.34)]',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    error: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
    purple: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
    outline: 'bg-white text-slate-600 border-slate-200 dark:bg-transparent dark:text-[var(--VIARA-muted)] dark:border-[var(--VIARA-line)]'
};

const sizes = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5'
};

const Badge = ({
    children,
    variant = 'default',
    size = 'md',
    className = "",
    icon: Icon,
    ...props
}) => {
    return (
        <span
            className={`
                inline-flex items-center gap-1.5 
                font-semibold uppercase tracking-wide rounded-full border
                ${variants[variant] || variants.default}
                ${sizes[size] || sizes.md}
                ${className}
            `}
            {...props}
        >
            {Icon && <Icon size={size === 'sm' ? 10 : 12} className="stroke-[2.5]" />}
            {children}
        </span>
    );
};

export default Badge;
