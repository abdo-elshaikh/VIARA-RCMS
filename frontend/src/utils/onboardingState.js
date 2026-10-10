/**
 * onboardingState.js
 * ------------------
 * First-run marker for the setup wizard.
 *
 * Kept in its own module (rather than in the lazy-loaded Onboarding page) so
 * App.jsx can read it without pulling the whole wizard into the main bundle.
 *
 * The marker is intentionally per-browser, not per-user: onboarding configures
 * the installation as a whole, so a second operator on the same workstation
 * should land on the dashboard, not repeat the wizard.
 */

const COMPLETE_KEY = 'viara_onboarding_complete';

/**
 * True once the wizard has been completed or skipped on this browser.
 * When localStorage is unavailable (private mode, blocked storage) we treat
 * onboarding as complete so the user is never trapped in a loop.
 *
 * @returns {boolean}
 */
export const isOnboardingComplete = () => {
    try {
        return localStorage.getItem(COMPLETE_KEY) === '1';
    } catch {
        return true;
    }
};

/** Record that the wizard has been completed or skipped. */
export const markOnboardingComplete = () => {
    try {
        localStorage.setItem(COMPLETE_KEY, '1');
    } catch {
        /* storage unavailable — the wizard will re-prompt next session */
    }
};

export { COMPLETE_KEY };
