import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * ScrollToTop — a floating button that appears once the user scrolls
 * past a threshold and smoothly returns to the top of the target element.
 *
 * Props:
 *  scrollRef   – ref of the scrollable container (defaults to window)
 *  threshold   – px scrolled before button appears (default 400)
 *  ariaLabel   – accessible label (default 'Scroll to top')
 */
const ScrollToTop = ({
    scrollRef,
    threshold = 400,
    ariaLabel = 'Scroll to top',
}) => {
    const [visible, setVisible] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        const container = scrollRef?.current || window;

        const getScrollY = () =>
            container === window
                ? window.scrollY
                : container.scrollTop;

        const onScroll = () => {
            // Debounce to avoid excessive state updates during fast scrolling
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setVisible(getScrollY() > threshold);
            }, 60);
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', onScroll);
            clearTimeout(timerRef.current);
        };
    }, [scrollRef, threshold]);

    const handleClick = () => {
        const container = scrollRef?.current || window;
        if (container === window) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={ariaLabel}
            style={{
                position: 'fixed',
                insetBlockEnd: '1.5rem',
                insetInlineEnd: '1.5rem',
                zIndex: 50,
                opacity: visible ? 1 : 0,
                transform: visible ? 'scale(1) translateY(0)' : 'scale(0.85) translateY(8px)',
                pointerEvents: visible ? 'auto' : 'none',
                transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(.22,.68,0,1.18)',
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] shadow-lg shadow-black/10 backdrop-blur-sm transition-colors hover:border-[var(--VIARA-accent)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] dark:shadow-black/30"
        >
            <ArrowUp size={17} aria-hidden="true" />
        </button>
    );
};

export default ScrollToTop;
