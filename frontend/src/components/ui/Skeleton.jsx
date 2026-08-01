import React from 'react';

/**
 * Skeleton loading component for creating placeholder UI
 */
const Skeleton = ({
    width,
    height,
    className = '',
    variant = 'text', // 'text', 'circular', 'rectangular'
    animation = 'pulse', // 'pulse', 'wave', 'none'
}) => {
    const baseStyles = 'bg-slate-200 dark:bg-[var(--rcms-surface-muted)]';

    const animations = {
        pulse: 'animate-pulse',
        wave: 'animate-pulse-slow',
        none: '',
    };

    const variants = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    };

    const inlineStyles = {
        width: width || '100%',
        height: height || (variant === 'text' ? '1em' : '100%'),
    };

    return (
        <div
            className={`${baseStyles} ${variants[variant]} ${animations[animation]} ${className}`}
            style={inlineStyles}
            aria-hidden="true"
        />
    );
};

// Preset skeleton components for common use cases
Skeleton.Text = ({ lines = 3, className = '' }) => (
    <div className={`space-y-2 ${className}`}>
        {[...Array(lines)].map((_, i) => (
            <Skeleton
                key={i}
                height="16px"
                width={i === lines - 1 ? '70%' : '100%'}
            />
        ))}
    </div>
);

Skeleton.Card = ({ className = '' }) => (
    <div className={`bg-white dark:bg-[var(--rcms-surface-raised)] rounded-2xl shadow-card border border-slate-100 dark:border-[var(--rcms-line)] p-6 ${className}`}>
        <div className="flex items-start gap-4 mb-4">
            <Skeleton variant="circular" width="48px" height="48px" />
            <div className="flex-1">
                <Skeleton height="20px" width="60%" className="mb-2" />
                <Skeleton height="16px" width="40%" />
            </div>
        </div>
        <Skeleton.Text lines={3} />
    </div>
);

Skeleton.Table = ({ rows = 5, columns = 4, className = '' }) => (
    <div className={`bg-white dark:bg-[var(--rcms-surface-raised)] rounded-2xl shadow-card border border-slate-100 dark:border-[var(--rcms-line)] overflow-hidden ${className}`}>
        {/* Header */}
        <div className="flex gap-4 p-4 border-b border-slate-100 bg-slate-50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)]">
            {[...Array(columns)].map((_, i) => (
                <Skeleton key={`header-${i}`} height="20px" width="100%" />
            ))}
        </div>

        {/* Rows */}
        {[...Array(rows)].map((_, rowIndex) => (
            <div key={`row-${rowIndex}`} className="flex gap-4 p-4 border-b border-slate-100 dark:border-[var(--rcms-line)]">
                {[...Array(columns)].map((_, colIndex) => (
                    <Skeleton key={`cell-${rowIndex}-${colIndex}`} height="16px" width="100%" />
                ))}
            </div>
        ))}
    </div>
);

export default Skeleton;
