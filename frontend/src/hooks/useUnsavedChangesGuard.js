import { useEffect, useRef } from 'react';
import { registerNavigationGuard } from '../utils/navigationGuard';

/**
 * useUnsavedChangesGuard
 * Protects users from accidentally losing unsaved work in forms or editors.
 * Intercepts both:
 * 1. Internal in-app navigation (sidebar links, global search, breadcrumbs) via navigationGuard.
 * 2. External browser navigation (refresh, tab close, back/forward) via window 'beforeunload'.
 *
 * @param {boolean} isDirty - Whether the form currently has uncommitted changes.
 * @param {string|Function} [message] - Confirmation prompt message or generator function.
 */
export const useUnsavedChangesGuard = (isDirty, message = 'You have unsaved changes. Are you sure you want to leave?') => {
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const messageRef = useRef(message);
    messageRef.current = message;

    // Guard internal router/navigation transitions
    useEffect(() => {
        if (!isDirty) return undefined;

        const unregister = registerNavigationGuard(() => {
            if (!isDirtyRef.current) return true;
            const prompt = typeof messageRef.current === 'function' ? messageRef.current() : messageRef.current;
            return window.confirm(prompt);
        });

        return unregister;
    }, [isDirty]);

    // Guard external browser tab close, reload, or URL bar navigation
    useEffect(() => {
        if (!isDirty) return undefined;

        const handleBeforeUnload = (event) => {
            if (!isDirtyRef.current) return;
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);
};

export default useUnsavedChangesGuard;
