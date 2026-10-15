import { useEffect, useRef } from 'react';

/**
 * Returns all accessible, visible focusable elements within a container element.
 */
export const getFocusableElements = (container) => {
    if (!container) return [];
    return [...container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary:first-of-type, [tabindex]:not([tabindex="-1"])'
    )].filter((element) => {
        if (element.matches(':disabled') || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;

        let current = element;
        while (current && container.contains(current)) {
            if (current.tagName === 'DETAILS' && !current.open && !current.querySelector(':scope > summary')?.contains(element)) return false;
            const style = window.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
            current = current.parentElement;
        }
        return true;
    });
};

/**
 * useFocusTrap
 * Traps Tab focus inside containerRef when isActive is true.
 * Automatically restores focus to previous activeElement on close/unmount.
 * Optionally listens to Escape and locks body scroll.
 */
export const useFocusTrap = ({
    containerRef,
    isActive,
    onEscape,
    lockScroll = true,
    initialFocusRef = null,
}) => {
    const previousFocusRef = useRef(null);
    const wasActiveRef = useRef(false);
    const onEscapeRef = useRef(onEscape);
    onEscapeRef.current = onEscape;

    if (isActive && !wasActiveRef.current) {
        previousFocusRef.current = document.activeElement;
    }
    wasActiveRef.current = isActive;

    useEffect(() => {
        if (!isActive) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && onEscapeRef.current) {
                event.preventDefault();
                event.stopPropagation();
                onEscapeRef.current();
                return;
            }

            if (event.key !== 'Tab' || !containerRef.current) return;

            const focusable = getFocusableElements(containerRef.current);
            if (!focusable.length) {
                event.preventDefault();
                containerRef.current.focus?.();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeIndex = focusable.indexOf(document.activeElement);

            if (activeIndex === -1) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && activeIndex === 0) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
                event.preventDefault();
                first.focus();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.addEventListener('keydown', handleKeyDown);
        if (lockScroll) {
            document.body.style.overflow = 'hidden';
        }

        const rafId = window.requestAnimationFrame(() => {
            if (initialFocusRef?.current) {
                initialFocusRef.current.focus?.();
            } else if (containerRef.current) {
                const firstFocusable = getFocusableElements(containerRef.current)[0];
                (firstFocusable || containerRef.current)?.focus?.();
            }
        });

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (lockScroll) {
                document.body.style.overflow = previousOverflow;
            }
            window.cancelAnimationFrame(rafId);
            const focusTarget = previousFocusRef.current;
            window.requestAnimationFrame(() => focusTarget?.focus?.());
        };
    }, [isActive, containerRef, lockScroll, initialFocusRef]);
};

export default useFocusTrap;
