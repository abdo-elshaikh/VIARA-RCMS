const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export const checkBackendHealth = async ({ timeoutMs = 4500 } = {}) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { online: false, backendAvailable: false };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${API_BASE_URL}/v1/health`, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) return { online: true, backendAvailable: false };

        const payload = await response.json().catch(() => null);
        return {
            online: true,
            backendAvailable: payload?.status === 'OK',
        };
    } catch {
        return { online: Boolean(navigator?.onLine), backendAvailable: false };
    } finally {
        window.clearTimeout(timeoutId);
    }
};
