import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { VIARA_BRAND } from '../config/brand';

/**
 * usePageTitle — Dynamically sets the browser tab title.
 *
 * Restores the original title on unmount to avoid stale titles
 * when navigating between pages.
 *
 * @param {string}  title      - Page-specific title segment.
 * @param {object}  [options]
 * @param {boolean} [options.suffix=true]  - Whether to append the brand name.
 * @param {string}  [options.separator='·'] - Character between page title and brand.
 */
const usePageTitle = (title, { suffix = true, separator = '·' } = {}) => {
    const { i18n } = useTranslation();
    const originalTitle = useRef(document.title);

    useEffect(() => {
        if (!title) return;
        const previousTitle = originalTitle.current;
        const brand = VIARA_BRAND?.shortName || VIARA_BRAND?.name || 'VIARA';
        const parts = [title, suffix && brand].filter(Boolean);
        document.title = parts.join(` ${separator} `);

        return () => {
            document.title = previousTitle;
        };
    // Re-run when title or language changes so translated titles stay in sync.
    }, [title, suffix, separator, i18n?.language]);
};

export default usePageTitle;
