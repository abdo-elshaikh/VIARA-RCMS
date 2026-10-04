/**
 * trialGuard.js
 * -------------
 * Express middleware that enforces trial-edition restrictions on every
 * authenticated API request.
 *
 * Responsibilities
 * ================
 *  1. Short-circuit expired trial licenses with HTTP 402.
 *  2. Inject informational headers so the SPA can show a countdown banner:
 *       X-Trial-Days-Remaining: <n>
 *       X-Trial-Warning: true   (only in last 7 days)
 *  3. Pass through immediately for non-trial editions.
 *
 * Usage (in server.js, mounted once so no route group can be left unguarded)
 * =======================================================================
 *   const trialGuard = require('./middleware/trialGuard');
 *   app.use('/api', trialGuard);
 */

'use strict';

const { getLicense } = require('../services/licenseService');
const logger = require('../config/logger');

const WARNING_THRESHOLD_DAYS = 7;
const UPGRADE_URL = process.env.UPGRADE_URL || 'https://viara.net/upgrade';

// The SPA needs to read the licence to render the "expired, contact us" banner
// and the upgrade call to action. Locking these would leave the user staring at
// an error with no explanation, so they stay readable even once the trial has
// expired.
//
// This middleware is mounted with app.use('/api', ...), so Express strips the
// mount point and req.path is mount-relative ('/license/info'), while
// req.originalUrl keeps the full path. Accept both forms so the exemption holds
// regardless of how the middleware is mounted.
const ALWAYS_READABLE = /^\/(?:api\/)?license\//;

// Endpoints needed to establish a session.
//
// Without these, an expired trial cannot log in at all, so the SPA never boots,
// never renders the expiry banner, and never shows the upgrade call to action —
// the user is left staring at a bare 402 on the login screen. Both licence
// routes above require a bearer token, so without a way to get one the
// exemption above is unreachable.
//
// These routes grant no access to clinical or financial data, and the auth
// routes are already rate limited (authLimiter) independently of this guard.
const SESSION_BOOTSTRAP = new Set([
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/passkeys/authenticate/options',
    '/auth/passkeys/authenticate/verify',
]);

// Mounted with app.use('/api', ...), so req.path is mount-relative. Normalise
// so the same set works whether or not the /api prefix is present.
const isSessionBootstrap = (path) =>
    SESSION_BOOTSTRAP.has(path.replace(/^\/api(?=\/)/, ''));

// Countdown warnings are emitted once per distinct remaining-days value. The
// previous code logged on every guarded request, which on a busy server meant
// tens of thousands of identical log lines per day.
const lastExpiryWarningAt = new Set();

/**
 * @type {import('express').RequestHandler}
 */
const trialGuard = (req, res, next) => {
    const license = getLicense();

    // ── Non-trial editions pass through immediately ──────────────────────────
    if (!license || license.edition !== 'trial') {
        return next();
    }

    // ── Compute days remaining ───────────────────────────────────────────────
    // getLicense() derives this from expiresAt on every call, so an expiry that
    // happens while the process is running is seen immediately.
    const daysRemaining = license.daysRemaining;

    // ── Attach informational headers to every response ───────────────────────
    if (daysRemaining !== null) {
        res.setHeader('X-Trial-Days-Remaining', String(daysRemaining));

        if (daysRemaining <= WARNING_THRESHOLD_DAYS) {
            res.setHeader('X-Trial-Warning', 'true');
        }
    }

    // ── Block if trial has expired ───────────────────────────────────────────
    // Reading the licence and establishing a session stay open: the SPA needs
    // both to explain why it is locked and offer a way out.
    const exempt = ALWAYS_READABLE.test(req.path) || isSessionBootstrap(req.path);

    if (daysRemaining !== null && daysRemaining <= 0 && !exempt) {
        logger.warn(`Trial expired — blocked request: ${req.method} ${req.originalUrl}`, {
            userId: req.user?.user_id,
            ip: req.ip,
        });

        return res.status(402).json({
            error: 'trial_expired',
            message: 'انتهت صلاحية النسخة التجريبية. يرجى التواصل معنا لتفعيل الترخيص الكامل.',
            upgradeUrl: UPGRADE_URL,
        });
    }

    // ── Log a warning when nearing expiry (server-side only) ─────────────────
    // Only on the way down, so this does not repeat on every single request.
    if (daysRemaining !== null
        && daysRemaining <= WARNING_THRESHOLD_DAYS
        && daysRemaining > 0
        && !lastExpiryWarningAt.has(daysRemaining)) {
        lastExpiryWarningAt.add(daysRemaining);
        logger.warn(`Trial license expires in ${daysRemaining} day(s)`);
    }

    return next();
};

module.exports = trialGuard;
