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

// Invoice Limiter: 10 per minute per user/IP
const invoiceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: authenticatedKey,
    message: { error: 'Too many invoice requests, please try again later.' }
});

// Sensitive Operations Limiter: 5 per day per user/IP
const sensitiveOpLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 5,
    keyGenerator: authenticatedKey,
    message: { error: 'Too many sensitive operations requested, please try again later.' }
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

// PACS webhook limiter: rate-limited per source IP since it's machine-to-machine
const pacsWebhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isDevelopment ? 300 : 60, // 60 webhooks per 5 min in production
    keyGenerator: ipKeyGenerator,
    message: { error: 'Too many PACS webhook requests, please try again later.' }
});

module.exports = {
    patientDataLimiter,
    invoiceLimiter,
    sensitiveOpLimiter,
    notificationLimiter,
    publicCaseStatusLimiter,
    pacsWebhookLimiter
};
