const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const isDevelopment = process.env.NODE_ENV !== 'production';
const authenticatedKey = (req) => req.user?.user_id || req.user?.userId || ipKeyGenerator(req.ip);

// Patient views are a normal high-frequency clinical workflow. Keep the
// limiter high enough for search and navigation, but isolate authenticated
// users so staff behind the same facility NAT do not lock each other out.
const patientDataLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isDevelopment ? 1000 : 120,
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests for patient data, please try again later.' }
});

// Invoice Limiter: high enough for normal reception, cashier searches, pagination, and live polling
const invoiceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isDevelopment ? 1000 : 240,
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many invoice requests, please try again later.' }
});

// Sensitive Operations Limiter: 5 per day per user/IP
const sensitiveOpLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: isDevelopment ? 100 : 5,
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many sensitive operations requested, please try again later.' }
});

// Integration setup involves several save/test/retry actions while an admin is
// validating credentials. Keep it guarded, but do not share the very small
// daily quota used for identity, backup restore, and privacy-sensitive actions.
const integrationOpLimiter = rateLimit({
    windowMs: isDevelopment ? 60 * 1000 : 15 * 60 * 1000,
    max: isDevelopment ? 300 : 60,
    keyGenerator: authenticatedKey,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many integration operations requested, please wait a moment and try again.' }
});

// Notification Limiter: 20 per minute per user/IP
const notificationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: authenticatedKey,
    message: { error: 'Too many notification requests, please try again later.' }
});

// Public MRN lookups expose a narrowly scoped clinical result. Keep them
// isolated from normal API traffic and deliberately difficult to enumerate.
const publicCaseStatusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isDevelopment ? 100 : 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many case-status checks. Please wait and try again.' }
});

// Anonymous booking accepts contact details and creates operational work.
// Keep a separate, tighter quota so status checks cannot exhaust it.
const publicBookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: isDevelopment ? 100 : 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many appointment requests. Please wait and try again.' }
});

// PACS webhook limiter: rate-limited per source IP since it's machine-to-machine
const pacsWebhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isDevelopment ? 300 : 60, // 60 webhooks per 5 min in production
    keyGenerator: ipKeyGenerator,
    message: { error: 'Too many PACS webhook requests, please try again later.' }
});

// Public waiting-room display board: a TV polls a few times per minute, and
// several screens may sit behind the same facility NAT. Generous per-IP cap,
// but isolated from authenticated API traffic.
const displayBoardLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: isDevelopment ? 600 : 120,
    keyGenerator: ipKeyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many display board requests, please try again later.' }
});

module.exports = {
    patientDataLimiter,
    invoiceLimiter,
    sensitiveOpLimiter,
    integrationOpLimiter,
    notificationLimiter,
    publicCaseStatusLimiter,
    publicBookingLimiter,
    displayBoardLimiter,
    pacsWebhookLimiter
};
