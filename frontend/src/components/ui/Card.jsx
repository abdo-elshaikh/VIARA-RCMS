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
    onKeyDown,
    ...props
}) => {
    const interactive = hoverable || onClick;
    const handleKeyDown = (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !onClick || event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick(event);
        }
    };

    return (
        <div
            className={`ds-card border ${interactive ? 'ds-card-interactive' : ''} ${className}`}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            {...props}
        >
            {header && (
                <div className="ds-card-header border-b">
                    {typeof header === 'string' ? (
                        <h3 className="text-lg font-bold text-[var(--VIARA-ink)]">{header}</h3>
                    ) : (
                        header
                    )}
                </div>
            )}

            <div className="ds-card-body">
                {children}
            </div>

            {footer && (
                <div className="ds-card-footer border-t">
                    {footer}
                </div>
            )}
        </div>
    );
};

export default Card;
