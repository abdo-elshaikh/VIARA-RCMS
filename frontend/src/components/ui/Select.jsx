import React, { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(({
    label,
    error,
    helperText,
    className = "",
    options = [],
    placeholder = "Select an option...",
    id,
    required = false,
    ...props
}, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="mb-1.5 ms-1 block text-sm font-semibold text-slate-700 dark:text-[var(--rcms-ink)]">
                    {label}{required && <span className="ms-1 text-red-500">*</span>}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    id={selectId}
                    required={required}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? errorId : helperText ? helperId : undefined}
                    className={`
                        w-full px-4 py-2.5 bg-white dark:bg-[var(--rcms-field)] border rounded-xl appearance-none
                        text-slate-700 dark:text-[var(--rcms-ink)] text-sm font-medium
                        focus:outline-none focus:ring-4 focus:ring-cyan-500/10 transition-all duration-200
                        disabled:bg-slate-50 dark:disabled:bg-[var(--rcms-surface)] disabled:text-slate-400 disabled:cursor-not-allowed
                        ${error
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                            : 'border-slate-200 dark:border-[var(--rcms-line)] focus:border-cyan-600 hover:border-slate-300 dark:hover:border-[var(--rcms-line-strong)]'
                        }
                        ${className}
                    `}
                    {...props}
                >
                    <option value="" disabled className="text-slate-400">
                        {placeholder}
                    </option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400">
                    <ChevronDown size={16} />
                </div>
            </div>

            {error && (
                <p id={errorId} role="alert" className="mt-1.5 ms-1 flex items-center gap-1 text-xs font-medium text-red-500 animate-slide-up">
                    {error.message || error}
                </p>
            )}

            {!error && helperText && (
                <p id={helperId} className="mt-1.5 ms-1 text-xs text-slate-400">
                    {helperText}
                </p>
            )}
        </div>
    );
});

Select.displayName = 'Select';

export default Select;
