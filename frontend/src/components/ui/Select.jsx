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
                <label htmlFor={selectId} className="ds-field-label mb-1.5 ms-1 block text-sm font-semibold">
                    {label}{required && <span className="ms-1 text-[var(--VIARA-danger)]" aria-hidden="true">*</span>}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    id={selectId}
                    required={required}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-errormessage={error ? errorId : undefined}
                    aria-describedby={error ? errorId : helperText ? helperId : undefined}
                    className={`ds-field appearance-none pe-10 text-sm font-medium ${error ? 'ds-field-error' : ''} ${className}`}
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
                <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 text-[var(--VIARA-muted)]" aria-hidden="true">
                    <ChevronDown size={16} />
                </div>
            </div>

            {error && (
                <p id={errorId} role="alert" className="ds-field-error-copy mt-1.5 ms-1 flex items-center gap-1 text-xs font-medium animate-slide-up">
                    {error.message || error}
                </p>
            )}

            {!error && helperText && (
                <p id={helperId} className="ds-field-help mt-1.5 ms-1 text-xs">
                    {helperText}
                </p>
            )}
        </div>
    );
});

Select.displayName = 'Select';

export default Select;
