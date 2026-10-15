/**
 * useLicense.js
 * -------------
 * React hook that fetches the current license info from the backend
 * on mount and exposes it to any component that needs it.
 *
 * The backend returns license metadata via:
 *   GET /api/license/info
 *
 * (This endpoint is added by licenseRoutes.js)
 *
 * Usage
 * =====
 *   const { edition, daysRemaining, isTrialExpired, isTrial } = useLicense();
 */

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentToken } from '../store/authSlice';
import { authenticatedFetch } from '../utils/authenticatedFetch';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * @typedef {Object} LicenseInfo
 * @property {'trial'|'standard'|'enterprise'|'developer'|null} edition
 * @property {number|null} daysRemaining
 * @property {boolean} isTrial
 * @property {boolean} isExpired
 * @property {string|null} customerId
 * @property {string[]} allowedModules
 * @property {boolean} loading
 * @property {string|null} error
 */

/** @returns {LicenseInfo} */
export function useLicense() {
    const token = useSelector(selectCurrentToken);
    const [info, setInfo] = useState({
        edition:        null,
        daysRemaining:  null,
        isTrial:        false,
        isExpired:      false,
        customerId:     null,
        allowedModules: [],
        loading:        Boolean(token),
        error:          null,
    });

    useEffect(() => {
        let cancelled = false;

        if (!token) {
            setInfo({
                edition: null,
                daysRemaining: null,
                isTrial: false,
                isExpired: false,
                customerId: null,
                allowedModules: [],
                loading: false,
                error: null,
            });
            return () => { cancelled = true; };
        }

        const load = async () => {
            try {
                const res = await authenticatedFetch(`${API_BASE}/license/info`, {
                    headers: { 'Accept': 'application/json' },
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();

                if (!cancelled) {
                    setInfo({
                        edition:        data.edition        ?? null,
                        daysRemaining:  data.daysRemaining  ?? null,
                        isTrial:        data.edition === 'trial',
                        isExpired:      data.edition === 'trial' && data.daysRemaining <= 0,
                        customerId:     data.customerId     ?? null,
                        allowedModules: data.allowedModules ?? [],
                        loading:        false,
                        error:          null,
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setInfo(prev => ({ ...prev, loading: false, error: err.message }));
                }
            }
        };

        load();
        return () => { cancelled = true; };
    }, [token]);

    return info;
}

/**
 * Returns true if the given feature is included in the current license.
 * Reads from response headers set by trialGuard on any authenticated request.
 *
 * @param {string[]} allowedModules  - From useLicense()
 * @param {string}   featureName
 * @returns {boolean}
 */
export function featureAllowed(allowedModules, featureName) {
    if (!allowedModules || allowedModules.length === 0) return true; // optimistic while loading
    return allowedModules.includes('*') || allowedModules.includes(featureName);
}
