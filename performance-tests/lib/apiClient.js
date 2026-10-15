/**
 * HTTP Client with automatic cookie tracking, CSRF token handling, and latency profiling
 */

const { performance } = require('perf_hooks');

class ApiClient {
    constructor(baseUrl, defaultTimeoutMs = 15000) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.defaultTimeoutMs = defaultTimeoutMs;
        this.token = null;
        this.cookies = new Map();
        this.csrfToken = null;
    }

    setToken(token) {
        this.token = token;
    }

    clearSession() {
        this.token = null;
        this.cookies.clear();
        this.csrfToken = null;
    }

    _updateCookies(response) {
        const setCookieHeaders = typeof response.headers?.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : [response.headers.get('set-cookie')].filter(Boolean);

        for (const cookieHeader of setCookieHeaders) {
            const parts = cookieHeader.split(';')[0].split('=');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                this.cookies.set(name, value);
                if (name === 'csrf_token') {
                    this.csrfToken = decodeURIComponent(value);
                }
            }
        }
    }

    _getCookieString() {
        const entries = [];
        for (const [name, value] of this.cookies.entries()) {
            entries.push(`${name}=${value}`);
        }
        return entries.join('; ');
    }

    async request(endpoint, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
        const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

        const headers = {
            'Accept': 'application/json',
            ...(options.headers || {})
        };

        if (this.token && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const cookieString = this._getCookieString();
        if (cookieString && !headers['Cookie']) {
            headers['Cookie'] = cookieString;
        }

        // Automatic CSRF injection for mutation methods
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && this.csrfToken && !headers['x-csrf-token']) {
            headers['x-csrf-token'] = this.csrfToken;
        }

        let body = options.body;
        if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Buffer)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }

        const startTime = performance.now();
        let status = 0;
        let ok = false;
        let data = null;
        let error = null;

        try {
            const controller = new AbortController();
            const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(url, {
                method,
                headers,
                body,
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutHandle));

            const endTime = performance.now();
            const duration = Math.round((endTime - startTime) * 100) / 100;
            status = res.status;
            ok = res.ok;
            this._updateCookies(res);

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                try {
                    data = await res.json();
                } catch {
                    data = null;
                }
            } else {
                try {
                    data = await res.text();
                } catch {
                    data = null;
                }
            }

            return {
                ok,
                status,
                duration,
                data,
                headers: Object.fromEntries(res.headers.entries()),
                error: ok ? null : (data?.message || data?.error || `HTTP ${status}`)
            };
        } catch (err) {
            const endTime = performance.now();
            const duration = Math.round((endTime - startTime) * 100) / 100;
            const isTimeout = err.name === 'AbortError';

            return {
                ok: false,
                status: isTimeout ? 408 : 0,
                duration,
                data: null,
                headers: {},
                error: isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message
            };
        }
    }

    get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    post(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', body });
    }

    put(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', body });
    }

    patch(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'PATCH', body });
    }

    delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }
}

module.exports = ApiClient;
