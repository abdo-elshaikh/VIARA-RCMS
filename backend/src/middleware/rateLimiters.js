const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { getLicense } = require('../services/licenseService');
const { createRateLimitStore } = require('../services/rateLimitStore');
const crypto = require('crypto');


const isDevelopment = process.env.NODE_ENV !== 'production';
const isPerfTest = isDevelopment && process.env.PERF_TEST === 'true';
const authenticatedKey = (req) => {
    const id = req.user?.user_id || req.user?.userId || req.user?.patient_id || req.user?.doctor_id;
    return id ? `user:${req.user?.role || 'staff'}:${id}` : `ip:${ipKeyGenerator(req.ip)}`;
};

// Patient views are a normal high-frequency clinical workflow. Keep the
// limiter high enough for search and navigation, but isolate authenticated
// users so staff behind the same facility NAT do not lock each other out.
const patientDataLimiter = rateLimit({
    store: createRateLimitStore('patientDataLimiter'),
    windowMs: 15 * 60 * 1000,
    limit: isPerfTest ? 100000 : (isDevelopment ? 1000 : 1200),
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests for patient data, please try again later.' }
});

// Invoice Limiter: high enough for normal reception, cashier searches, pagination, and live polling
const invoiceLimiter = rateLimit({
    store: createRateLimitStore('invoiceLimiter'),
    windowMs: 60 * 1000,
    max: isPerfTest ? 100000 : (isDevelopment ? 1000 : 240),
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many invoice requests, please try again later.' }
});

// Sensitive Operations Limiter: 5 per day per user/IP
const sensitiveOpLimiter = rateLimit({
    store: createRateLimitStore('sensitiveOpLimiter'),
    windowMs: 24 * 60 * 60 * 1000,
    max: isPerfTest ? 100000 : (isDevelopment ? 100 : 5),
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sensitive operations requested, please try again later.' }
});

// Integration setup involves several save/test/retry actions while an admin is
// validating credentials. Keep it guarded, but do not share the very small
// daily quota used for identity, backup restore, and privacy-sensitive actions.
const integrationOpLimiter = rateLimit({
    store: createRateLimitStore('integrationOpLimiter'),
    windowMs: isDevelopment ? 60 * 1000 : 15 * 60 * 1000,
    max: isDevelopment ? 300 : 60,
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many integration operations requested, please wait a moment and try again.' }
});

// Notification Limiter: 20 per minute per user/IP
const notificationLimiter = rateLimit({
    store: createRateLimitStore('notificationLimiter'),
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: authenticatedKey,
    message: { error: 'Too many notification requests, please try again later.' }
});

// Public MRN lookups expose a narrowly scoped clinical result. Keep them
// isolated from normal API traffic and deliberately difficult to enumerate.
const publicCaseStatusLimiter = rateLimit({
    store: createRateLimitStore('publicCaseStatusLimiter'),
    windowMs: 15 * 60 * 1000,
    limit: isDevelopment ? 100 : 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many case-status checks. Please wait and try again.' }
});

// Anonymous booking accepts contact details and creates operational work.
// Keep a separate, tighter quota so status checks cannot exhaust it.
const publicBookingLimiter = rateLimit({
    store: createRateLimitStore('publicBookingLimiter'),
    windowMs: 60 * 60 * 1000,
    limit: isDevelopment ? 100 : 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many appointment requests. Please wait and try again.' }
});

// PACS webhook limiter: rate-limited per source IP since it's machine-to-machine
const pacsWebhookLimiter = rateLimit({
    store: createRateLimitStore('pacsWebhookLimiter'),
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isDevelopment ? 300 : 60, // 60 webhooks per 5 min in production
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { error: 'Too many PACS webhook requests, please try again later.' }
});

// ── AI Report Limiter ──────────────────────────────────────────────────────────
// Applies to: POST /api/exams/:id/ai-preliminary-draft
//             POST /api/exams/:id/improve-report
//
// Rationale: each call sends text + exam context to an LLM (potential $$$).
// A radiologist writing a report rarely needs more than ~10 improvements per
// session. 20 per 5-minute window is generous for normal use, and the daily
// cap of 100 prevents accidental scripted looping.
const aiReportLimiter = rateLimit({
    store: createRateLimitStore('aiReportLimiter'),
    windowMs: 5 * 60 * 1000,          // 5-minute rolling window
    max: isDevelopment ? 500 : 20,     // 20 AI calls / 5 min / user in production
    keyGenerator: authenticatedKey,    // per-user, not per-IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipFailedRequests: false,         // count failures — they still cost a call
    message: {
        error: 'Too many AI report requests. Please wait a moment before trying again.',
        code: 'AI_REPORT_RATE_LIMIT'
    }
});

// Separate daily hard-cap so a misconfigured client cannot exhaust the API key
// across thousands of calls over the course of a day.
const aiReportDailyLimiter = rateLimit({
    store: createRateLimitStore('aiReportDailyLimiter'),
    windowMs: 24 * 60 * 60 * 1000,    // 24-hour window
    max: isDevelopment ? 5000 : 100,   // 100 calls/day/user in production
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        error: 'Daily AI report quota reached. Quota resets every 24 hours.',
        code: 'AI_REPORT_DAILY_LIMIT'
    }
});

// ── AI PACS Image Analysis Limiter ────────────────────────────────────────────
// Applies to: POST /api/pacs/exams/:examId/ai-analysis  (queue new job)
//             POST /api/pacs/ai-analysis/process         (trigger processing)
//
// Vision calls are significantly more expensive than text completions due to
// image encoding and multi-image context. Keep limits tighter than report AI.
const pacsAiLimiter = rateLimit({
    store: createRateLimitStore('pacsAiLimiter'),
    windowMs: 10 * 60 * 1000,         // 10-minute rolling window
    max: isDevelopment ? 200 : 10,    // 10 vision requests / 10 min / user
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        error: 'Too many PACS AI analysis requests. Please wait before queuing another job.',
        code: 'PACS_AI_RATE_LIMIT'
    }
});

// ── AI Settings Test Limiter ───────────────────────────────────────────────────
// Applies to: POST /api/settings/ai/test
//
// The test endpoint makes a live API call to the configured provider.
// Restrict heavily — admins rarely need to test more than a few times.
const aiSettingsTestLimiter = rateLimit({
    store: createRateLimitStore('aiSettingsTestLimiter'),
    windowMs: 10 * 60 * 1000,         // 10-minute window
    max: isDevelopment ? 100 : 5,     // 5 tests per 10 min per user
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        error: 'Too many AI connection tests. Please wait before testing again.',
        code: 'AI_TEST_RATE_LIMIT'
    }
});

// Public waiting-room display board: a TV polls a few times per minute, and
// several screens may sit behind the same facility NAT. Generous per-IP cap,
// but isolated from authenticated API traffic.
const displayBoardLimiter = rateLimit({
    store: createRateLimitStore('displayBoardLimiter'),
    windowMs: 60 * 1000,
    limit: isDevelopment ? 600 : 120,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many display board requests, please try again later.' }
});

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
    store: createRateLimitStore('authLimiter'),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isPerfTest ? 10000 : (isDevelopment ? 100 : 100),
    message: {
        error: 'Too many login attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

// A distributed guess attack must not gain a fresh account quota per IP.
// Store only a keyed digest of the login identifier in Redis.
const authAccountLimiter = rateLimit({
    store: createRateLimitStore('authAccountLimiter'),
    windowMs: 15 * 60 * 1000,
    limit: isPerfTest ? 10000 : 10,
    keyGenerator: req => crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(String(req.body?.email || req.body?.username || ipKeyGenerator(req.ip)).trim().toLowerCase()).digest('hex'),
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many failed sign-in attempts. Please wait before trying again.' }
});

const passwordResetRequestLimiter = rateLimit({
    store: createRateLimitStore('passwordResetRequestLimiter'),
    windowMs: 60 * 60 * 1000,
    limit: isDevelopment ? 100 : 5,
    keyGenerator: req => crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(String(req.body?.email || ipKeyGenerator(req.ip)).trim().toLowerCase()).digest('hex'),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many password reset requests. Please wait before trying again.' }
});

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
    store: createRateLimitStore('apiLimiter'),
    windowMs: 60 * 1000,
    max: isPerfTest ? 100000 : 6000, // Facility NAT edge cap; domain limits apply separately.
    message: {
        error: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter limiter for sensitive operations (delete, update critical data)
const strictLimiter = rateLimit({
    store: createRateLimitStore('strictLimiter'),
    keyGenerator: authenticatedKey,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 200 : 20, // Higher limit for development
    message: {
        error: 'Rate limit exceeded for this operation'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ── Trial edition — tighter limits ────────────────────────────────────────────
// Trial instances get a stricter API limiter to discourage production misuse.
const trialApiLimiter = rateLimit({
    store: createRateLimitStore('trialApiLimiter'),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isPerfTest ? 100000 : (isDevelopment ? 1000 : 200),
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trial edition rate limit exceeded. Upgrade for higher limits.' }
});

const trialAuthLimiter = rateLimit({
    store: createRateLimitStore('trialAuthLimiter'),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isPerfTest ? 10000 : 100,
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts in trial mode. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Returns the appropriate rate limiter based on the active license edition.
 * Trial edition → stricter limiter; others → standard limiter.
 *
 * @param {import('express-rate-limit').RateLimitRequestHandler} standardLimiter
 * @param {import('express-rate-limit').RateLimitRequestHandler} [trialLimiterOverride]
 * @returns {import('express').RequestHandler}
 */
function trialAwareLimiter(standardLimiter, trialLimiterOverride) {
    const trialLimit = trialLimiterOverride || trialApiLimiter;
    return (req, res, next) => {
        const license = getLicense();
        const limiter = (license?.edition === 'trial') ? trialLimit : standardLimiter;
        return limiter(req, res, next);
    };
}

module.exports = {
    authLimiter,
    authAccountLimiter,
    passwordResetRequestLimiter,
    apiLimiter,
    strictLimiter,
    patientDataLimiter,
    invoiceLimiter,
    sensitiveOpLimiter,
    integrationOpLimiter,
    notificationLimiter,
    publicCaseStatusLimiter,
    publicBookingLimiter,
    displayBoardLimiter,
    pacsWebhookLimiter,
    aiReportLimiter,
    aiReportDailyLimiter,
    pacsAiLimiter,
    aiSettingsTestLimiter,
    authenticatedKey,
    // Trial-aware
    trialApiLimiter,
    trialAuthLimiter,
    trialAwareLimiter,
};

