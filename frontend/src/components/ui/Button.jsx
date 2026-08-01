import React from 'react';

/**
 * Button component with multiple variants and sizes
 */
const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    loading = false,
    type = 'button',
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';

    const variants = {
        primary: 'bg-cyan-700 text-white shadow-sm hover:bg-cyan-800 hover:shadow-md hover:-translate-y-0.5',
        secondary: 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-ink)] dark:hover:bg-[var(--rcms-surface-hover)]',
        success: 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 hover:-translate-y-0.5',
        danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 hover:-translate-y-0.5',
        outline: 'border border-cyan-700 bg-white text-cyan-700 hover:bg-cyan-50 dark:border-cyan-300/35 dark:bg-transparent dark:text-cyan-200 dark:hover:bg-cyan-400/10',
        ghost: 'text-slate-700 hover:bg-slate-100 dark:text-[var(--rcms-ink)] dark:hover:bg-[var(--rcms-surface-hover)]',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-lg',
    };

    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            {loading && (
                <svg className="animate-spin -ms-1 me-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            {children}
        </button>
    );
};

export default Button;
