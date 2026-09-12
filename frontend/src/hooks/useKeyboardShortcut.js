import { useEffect, useCallback } from 'react';

/**
 * Custom hook for cross-platform global keyboard shortcuts.
 * Supports Windows/Linux Ctrl and macOS Command (Meta) seamlessly.
 *
 * @param {string} key - Key to listen for (e.g., 'k', '/', 'Escape', '?', 'Enter')
 * @param {Function} callback - Function to execute when shortcut triggers
 * @param {Object} options - Modifier options and input filtering behavior
 */
function useKeyboardShortcut(
    key,
    callback,
    {
        ctrl = false,
        shift = false,
        alt = false,
        meta = false,
        ctrlOrMeta = true, // When true, ctrl: true also matches macOS metaKey (Cmd)
        ignoreInputs = true, // When false, triggers even if user is focused on an input/textarea
        preventDefault = true
    } = {}
) {
    const handleKeyDown = useCallback((event) => {
        if (typeof key !== 'string' || typeof event.key !== 'string') return;

        // Key comparison (case-insensitive for letters, exact for symbols)
        const keyMatch = event.key.toLowerCase() === key.toLowerCase() || event.key === key;

        // Modifier checks
        const isModifierExpected = ctrl || meta;
        let ctrlMetaMatch = true;

        if (isModifierExpected) {
            if (ctrlOrMeta) {
                ctrlMetaMatch = (ctrl || meta) ? (event.ctrlKey || event.metaKey) : (!event.ctrlKey && !event.metaKey);
            } else {
                ctrlMetaMatch = (ctrl === event.ctrlKey) && (meta === event.metaKey);
            }
        } else {
            ctrlMetaMatch = !event.ctrlKey && !event.metaKey;
        }

        // Shift matching (auto-accept shift if the target key is naturally shifted, e.g., '?')
        const shiftMatch = (key === '?' || shift) ? (shift ? event.shiftKey : true) : (shift === event.shiftKey);
        const altMatch = alt === event.altKey;

        // Check if user is currently typing in an editable field
        const target = event.target;
        const tagName = target?.tagName || '';
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || Boolean(target?.isContentEditable);

        if (keyMatch && ctrlMetaMatch && shiftMatch && altMatch) {
            if (ignoreInputs && isTyping) {
                return;
            }
            if (preventDefault) {
                event.preventDefault();
            }
            callback?.(event);
        }
    }, [key, callback, ctrl, shift, alt, meta, ctrlOrMeta, ignoreInputs, preventDefault]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
}

export default useKeyboardShortcut;
