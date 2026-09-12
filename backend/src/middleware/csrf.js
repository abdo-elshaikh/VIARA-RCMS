const crypto = require('crypto');
const logger = require('../config/logger');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
    '/api/auth/login',
    '/api/portal/login',
    '/api/doctor-portal/login',
    '/api/pacs/webhook',
    '/api/webhooks/stripe',
    '/api/webhooks/twilio',
    '/api/notifications/webhook/twilio',
    '/api/notifications/unsubscribe'
]);

/**
 * Double-submit cookie CSRF protection middleware.
 *
 * On every response, ensures a csrf_token cookie is set (32-byte random hex).
 * For state-changing methods (POST, PUT, DELETE, PATCH), requires the
 * x-csrf-token header to match the cookie value.
 *
 * Only credential bootstrap and signed machine-to-machine callbacks are
 * exempt. Public portal mutations use the same protection as authenticated
 * browser requests.
 */
function csrfProtection() {
    return (req, res, next) => {
        if (SAFE_METHODS.has(req.method)) {
            ensureCsrfCookie(req, res);
            return next();
        }

        const requestPath = String(req.originalUrl || req.path || req.url || '').split('?')[0];
        if (EXEMPT_PATHS.has(requestPath)) {
            ensureCsrfCookie(req, res);
            return next();
        }

        const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
        const headerToken = req.headers[CSRF_HEADER_NAME];

        if (!cookieToken || !headerToken) {
            logger.warn('CSRF token mismatch', {
                method: req.method,
                path: req.path,
                hasCookie: !!cookieToken,
                hasHeader: !!headerToken,
            });
            const { AppError } = require('./errorHandler');
            return next(new AppError('CSRF token validation failed', 403, true, 'CSRF_ERROR'));
        }

        const cookieBuf = Buffer.from(cookieToken);
        const headerBuf = Buffer.from(headerToken);

        if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
            logger.warn('CSRF token mismatch', {
                method: req.method,
                path: req.path,
                hasCookie: !!cookieToken,
                hasHeader: !!headerToken,
            });
            const { AppError } = require('./errorHandler');
            return next(new AppError('CSRF token validation failed', 403, true, 'CSRF_ERROR'));
        }

        ensureCsrfCookie(req, res);
        next();
    };
}

function ensureCsrfCookie(req, res) {
    const existing = req.cookies?.[CSRF_COOKIE_NAME];
    if (existing) return;

    const token = crypto.randomBytes(32).toString('hex');
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
    });
}

module.exports = { csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME };
