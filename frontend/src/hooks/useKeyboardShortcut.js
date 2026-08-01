import { useEffect, useCallback } from 'react';

/**
 * Custom hook for global keyboard shortcuts
 * @param {string} key - Key to listen for (e.g., 'k', '/', 'Escape')
 * @param {Function} callback - Function to call when shortcut is triggered
 * @param {Object} options - Options for ctrl, shift, alt, meta modifiers
 */
function useKeyboardShortcut(key, callback, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
    const handleKeyDown = useCallback((event) => {
        if (typeof key !== 'string' || typeof event.key !== 'string') return;

        // Check if the key matches
        const keyMatch = event.key.toLowerCase() === key.toLowerCase();

        // Check if all required modifiers are pressed
        const ctrlMatch = ctrl === event.ctrlKey;
        const shiftMatch = shift === event.shiftKey;
        const altMatch = alt === event.altKey;
        const metaMatch = meta === event.metaKey;

        // Ignore if user is typing in an input/textarea
        const target = event.target;
        const tagName = target?.tagName || '';
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
        const isContentEditable = Boolean(target?.isContentEditable);

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch && !isTyping && !isContentEditable) {
            event.preventDefault();
            callback?.(event);
        }
    }, [key, callback, ctrl, shift, alt, meta]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
}

export default useKeyboardShortcut;
