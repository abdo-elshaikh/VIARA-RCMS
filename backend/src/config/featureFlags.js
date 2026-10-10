/**
 * featureFlags.js
 * ---------------
 * Single source of truth for which system features are available in each
 * license edition.  Import this map wherever you need to gate a feature —
 * never hard-code edition names in route files directly.
 *
 * Editions (ordered by tier):
 *   trial      → 30-day evaluation with tight quotas
 *   standard   → Full single-branch production license
 *   enterprise → Multi-branch, SSO, unlimited users
 *   developer  → Internal / Developer mode — all features always on
 */

'use strict';

/** @type {Record<string, string[]>} */
const EDITION_FEATURES = {
    // Trial is a working single-branch evaluation, not a demo shell: the
    // included front-desk features hard-depend on these modules, so omitting
    // them made the trial unusable. Opening a reception shift requires an
    // attendance clock-in (see receptionShiftController + attendanceWorkGate),
    // which lives under the 'hr' gate, and a center cannot bill the patients
    // 'appointments' lets it book without 'finance'. Premium-only modules
    // (analytics, pacs, crm, insurance, inventory, backup, import, export,
    // end-of-day) stay gated so the trial is still a limited edition.
    trial: [
        'appointments',      // limited to TRIAL_MAX_APPOINTMENTS_PER_MONTH
        'patients',          // limited to TRIAL_MAX_PATIENTS
        'reception',
        'display',
        'chat',
        'notifications',
        'profile',
        'hr',                // attendance clock-in is a shift-open prerequisite
        'finance',           // front-desk invoicing/payments for booked patients
    ],

    standard: [
        'appointments',
        'patients',
        'reception',
        'display',
        'chat',
        'notifications',
        'profile',
        'finance',
        'insurance',
        'clinical',
        'hr',
        'crm',
        'inventory',
        'equipment',
        'analytics',
        'backup',
        'import',
        'pacs',
        'portal',
        'audit',
        'rbac',
        'privacy',
        'settings',
        'safety',
        'end-of-day',
        'export',
    ],

    enterprise: [
        // Everything in standard, plus:
        'appointments',
        'patients',
        'reception',
        'display',
        'chat',
        'notifications',
        'profile',
        'finance',
        'insurance',
        'clinical',
        'hr',
        'crm',
        'inventory',
        'equipment',
        'analytics',
        'backup',
        'import',
        'pacs',
        'portal',
        'audit',
        'rbac',
        'privacy',
        'settings',
        'safety',
        'end-of-day',
        'export',
        'multi-branch',
        'sso',
        'advanced-analytics',
        'custom-integrations',
    ],

    // Developer edition mirrors enterprise — never gated
    developer: ['*'],
};

/**
 * Trial-specific hard quotas.
 * These are checked inside quotaService.js, not here.
 */
const TRIAL_QUOTAS = {
    MAX_PATIENTS:               50,
    MAX_APPOINTMENTS_PER_MONTH: 100,
    MAX_USERS:                  3,
    MAX_REPORTS_PER_DAY:        10,
};

/**
 * Returns true if the given edition includes the requested feature.
 *
 * @param {string} edition   - One of 'trial' | 'standard' | 'enterprise' | 'developer'
 * @param {string} feature   - Feature key from EDITION_FEATURES
 * @returns {boolean}
 */
function editionHasFeature(edition, feature) {
    const allowed = EDITION_FEATURES[edition] || EDITION_FEATURES.trial;
    return allowed.includes('*') || allowed.includes(feature);
}

module.exports = { EDITION_FEATURES, TRIAL_QUOTAS, editionHasFeature };
