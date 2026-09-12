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
    const baseStyles = 'ds-button';

    const variants = {
        primary: 'ds-button-primary',
        secondary: 'ds-button-secondary',
        success: 'ds-button-success',
        danger: 'ds-button-danger',
        outline: 'ds-button-outline',
        ghost: 'ds-button-ghost',
    };

    const sizes = {
        sm: 'ds-button-sm',
        md: 'ds-button-md',
        lg: 'ds-button-lg',
    };

    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
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
