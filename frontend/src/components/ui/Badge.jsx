import React from 'react';

const variants = {
    default: 'ds-status-neutral',
    primary: 'ds-status-accent',
    success: 'ds-status-success',
    warning: 'ds-status-warning',
    error: 'ds-status-danger',
    purple: 'ds-status-info',
    outline: 'ds-status-neutral'
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
                ds-status font-semibold uppercase tracking-wide border
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
