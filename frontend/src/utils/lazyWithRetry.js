import { lazy } from 'react';

/**
 * Wraps React.lazy with automatic retry / recovery on dynamic import failures
 * caused by Vite dev server restarts or production deployments (stale chunk hashes).
 *
 * @param {() => Promise<{ default: React.ComponentType<any> }>} componentImport
 * @param {string} [name='chunk']
 * @returns {React.LazyExoticComponent<React.ComponentType<any>>}
 */
export function lazyWithRetry(componentImport, name = 'chunk') {
    return lazy(async () => {
        const storageKey = `viara-lazy-retry-${name}`;
        const hasBeenRetried = typeof window !== 'undefined'
            ? window.sessionStorage.getItem(storageKey) === 'true'
            : false;

        try {
            const component = await componentImport();
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(storageKey);
            }
            return component;
        } catch (error) {
            const isChunkLoadError =
                error?.name === 'TypeError' ||
                error?.message?.includes?.('Failed to fetch dynamically imported module') ||
                error?.message?.includes?.('Importing a module script failed') ||
                error?.message?.includes?.('dynamically imported module') ||
                error?.message?.includes?.('Loading chunk') ||
                error?.message?.includes?.('Failed to load module script');

            if (isChunkLoadError && typeof window !== 'undefined' && !hasBeenRetried) {
                window.sessionStorage.setItem(storageKey, 'true');
                window.location.reload();
                return new Promise(() => {}); // Pause until reload triggers
            }

            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(storageKey);
            }
            throw error;
        }
    });
}

export default lazyWithRetry;
