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
    const baseStyles = 'ds-field';
    const stateStyles = error
        ? 'ds-field-error'
        : '';

    return (
        <div className={`${containerClassName}`}>
            {label && (
                <label htmlFor={inputId} className="ds-field-label mb-2 block text-sm font-semibold">
                    {label}
                    {required && <span className="ms-1 text-[var(--VIARA-danger)]" aria-hidden="true">*</span>}
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
                <p id={errorId} role="alert" className="ds-field-error-copy mt-1 text-sm">
                    {error.message || error}
                </p>
            )}

            {helperText && !error && (
                <p id={helperId} className="ds-field-help mt-1 text-sm">
                    {helperText}
                </p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
