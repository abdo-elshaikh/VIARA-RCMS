/**
 * branchContext.js
 * ----------------
 * Provides synchronous access to the currently active branch UUID across the
 * frontend, supporting both standalone fetch helpers and Redux state.
 */

let branchProvider = null;

export const configureActiveBranchProvider = (provider) => {
    branchProvider = typeof provider === 'function' ? provider : null;
};

export const getActiveBranchId = () => {
    try {
        // A cleared workspace selection is authoritative, even when another
        // tab still has a branch in shared browser storage.
        if (branchProvider) return branchProvider() || null;
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('viara_active_branch_id') || null;
        }
    } catch {
        // Fallback for isolated browser storage contexts
    }
    return null;
};

export const setActiveBranchId = (branchId) => {
    try {
        if (typeof localStorage !== 'undefined') {
            if (branchId) {
                localStorage.setItem('viara_active_branch_id', String(branchId));
            } else {
                localStorage.removeItem('viara_active_branch_id');
            }
        }
        window.dispatchEvent(new CustomEvent('viara:branch-changed', { detail: { branchId } }));
    } catch {
        // Fallback
    }
};
