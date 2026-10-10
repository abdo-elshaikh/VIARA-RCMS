// Minimal in-app navigation guard registry.
//
// Components with unsaved work (e.g. the RBAC staged-permission editor)
// register a confirmation callback; container-level navigators (Settings tab
// switches, router transitions) consult it before navigating away.

let activeGuard = null;

/**
 * Register a guard. Return false (or a falsy confirmation) to block navigation.
 * The guard itself is responsible for prompting the user.
 * @returns {() => void} unregister function
 */
export const registerNavigationGuard = (guard) => {
    activeGuard = guard;
    return () => {
        if (activeGuard === guard) activeGuard = null;
    };
};

/** @returns {boolean} true when navigation may proceed. */
export const confirmNavigation = () => {
    if (typeof activeGuard !== 'function') return true;
    return Boolean(activeGuard());
};
