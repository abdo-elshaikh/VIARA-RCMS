import React, { useCallback, useRef } from 'react';

/**
 * Button component with multiple variants, sizes, icon support, and ripple effect.
 *
 * Props:
 *  icon      – Lucide icon component rendered before children (start side)
 *  iconEnd   – Lucide icon component rendered after children (end side)
 *  iconOnly  – renders a square icon-only button (hides children visually)
 *  iconSize  – pixel size for the icon (auto-sized per button size if omitted)
 */
const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    loading = false,
    type = 'button',
    icon: Icon,
    iconEnd: IconEnd,
    iconOnly = false,
    iconSize,
    onClick,
    ...props
}) => {
    const btnRef = useRef(null);

    const defaultIconSize = { sm: 14, md: 16, lg: 18 }[size] || 16;
    const resolvedIconSize = iconSize || defaultIconSize;

    const handleClick = useCallback((e) => {
        // Lightweight CSS ripple on click
        const btn = btnRef.current;
        if (btn && !disabled && !loading) {
            const circle = document.createElement('span');
            const rect = btn.getBoundingClientRect();
            const d = Math.max(rect.width, rect.height);
            circle.style.cssText = [
                `position:absolute`,
                `width:${d}px`,
                `height:${d}px`,
                `left:${e.clientX - rect.left - d / 2}px`,
                `top:${e.clientY - rect.top - d / 2}px`,
                `border-radius:50%`,
                `background:currentColor`,
                `opacity:0.16`,
                `transform:scale(0)`,
                `animation:btn-ripple 480ms linear forwards`,
                `pointer-events:none`,
            ].join(';');
            btn.appendChild(circle);
            setTimeout(() => circle.remove(), 520);
        }
        onClick?.(e);
    }, [disabled, loading, onClick]);

    const variants = {
        primary:   'ds-button-primary',
        secondary: 'ds-button-secondary',
        success:   'ds-button-success',
        danger:    'ds-button-danger',
        outline:   'ds-button-outline',
        ghost:     'ds-button-ghost',
    };

    const sizes = {
        sm: 'ds-button-sm',
        md: 'ds-button-md',
        lg: 'ds-button-lg',
    };

    const iconOnlySizes = {
        sm: 'h-7 w-7 !p-0',
        md: 'h-9 w-9 !p-0',
        lg: 'h-11 w-11 !p-0',
    };

    return (
        <button
            ref={btnRef}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            onClick={handleClick}
            className={`ds-button relative overflow-hidden ${variants[variant] || variants.primary} ${iconOnly ? (iconOnlySizes[size] || iconOnlySizes.md) : (sizes[size] || sizes.md)} ${className}`}
            {...props}
        >
            {loading ? (
                <svg
                    className={`animate-spin ${iconOnly ? '' : '-ms-0.5 me-1.5'} h-4 w-4 shrink-0`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
            ) : Icon ? (
                <Icon
                    size={resolvedIconSize}
                    aria-hidden="true"
                    className={`shrink-0 ${!iconOnly && children ? '-ms-0.5 me-1.5' : ''}`}
                />
            ) : null}

            {iconOnly ? (
                <span className="sr-only">{children}</span>
            ) : (
                children
            )}

            {!loading && IconEnd && (
                <IconEnd
                    size={resolvedIconSize}
                    aria-hidden="true"
                    className={`shrink-0 ${children ? 'ms-1.5 -me-0.5' : ''}`}
                />
            )}
        </button>
    );
};

export default Button;
