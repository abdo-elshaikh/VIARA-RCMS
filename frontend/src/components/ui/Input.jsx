import React, { forwardRef, useId } from 'react';

/**
 * Input component with label, error states, and variants
 */
const Input = forwardRef(({
    label,
    error,
    helperText,
    className = '',
    containerClassName = '',
    type = 'text',
    required = false,
    id,
    ...props
}, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const baseStyles = 'w-full min-h-11 px-4 py-2.5 rounded-xl border text-slate-800 dark:text-[var(--rcms-ink)] placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all outline-none';
    const stateStyles = error
        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
        : 'border-slate-200 bg-white dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-600 hover:border-slate-300 dark:hover:border-[var(--rcms-line-strong)]';

    return (
        <div className={`${containerClassName}`}>
            {label && (
                <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700 dark:text-[var(--rcms-ink)] mb-2">
                    {label}
                    {required && <span className="ms-1 text-red-500">*</span>}
                </label>
            )}

            <input
                ref={ref}
                id={inputId}
                type={type}
                required={required}
                className={`${baseStyles} ${stateStyles} ${className}`}
                aria-invalid={error ? 'true' : 'false'}
                aria-errormessage={error ? errorId : undefined}
                aria-describedby={error ? errorId : helperText ? helperId : undefined}
                {...props}
            />

            {error && (
                <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
                    {error.message || error}
                </p>
            )}

            {helperText && !error && (
                <p id={helperId} className="mt-1 text-sm text-slate-500 dark:text-[var(--rcms-muted)]">
                    {helperText}
                </p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
