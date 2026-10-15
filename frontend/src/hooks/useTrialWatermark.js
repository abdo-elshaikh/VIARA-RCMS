/**
 * useTrialWatermark.js
 * --------------------
 * Hook that returns the trial watermark string for use in PrintDocument.
 *
 * Usage
 * =====
 *   import { useTrialWatermark } from '../../hooks/useTrialWatermark';
 *
 *   // Inside a print component:
 *   const trialWatermark = useTrialWatermark();
 *   return (
 *       <PrintDocument watermark={trialWatermark || userSelectedWatermark}>
 *           ...
 *       </PrintDocument>
 *   );
 *
 * Behaviour
 * ---------
 * - Returns "نسخة تجريبية • TRIAL" for trial editions
 * - Returns null for all other editions (no watermark injected)
 * - Reading from localStorage key 'viara_license_edition' which is
 *   populated by TrialBanner on mount for performance (avoids extra fetch
 *   on every print page load).
 *   Falls back to the useLicense() hook if localStorage is empty.
 */

import { useMemo } from 'react';
import { useLicense } from './useLicense';

const TRIAL_WATERMARK_TEXT = 'نسخة تجريبية • TRIAL';

/**
 * @returns {string|null}  Watermark text or null for non-trial licenses.
 */
export function useTrialWatermark() {
    const { isTrial, loading } = useLicense();

    return useMemo(() => {
        // Fast path: check cache from TrialBanner
        try {
            const cached = sessionStorage.getItem('viara_license_edition');
            if (cached === 'trial') return TRIAL_WATERMARK_TEXT;
            if (cached && cached !== 'trial') return null;
        } catch { /* sessionStorage not available */ }

        if (loading) return null;
        return isTrial ? TRIAL_WATERMARK_TEXT : null;
    }, [isTrial, loading]);
}
