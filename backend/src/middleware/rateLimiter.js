const rateLimit = require('express-rate-limit');
const isDevelopment = process.env.NODE_ENV !== 'production';

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 25 : 5,
    message: {
        error: 'Too many login attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: isDevelopment
});

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 100, // Higher limit for development
    message: {
        error: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter limiter for sensitive operations (delete, update critical data)
const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 200 : 20, // Higher limit for development
    message: {
        error: 'Rate limit exceeded for this operation'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    authLimiter,
    apiLimiter,
    strictLimiter
};
