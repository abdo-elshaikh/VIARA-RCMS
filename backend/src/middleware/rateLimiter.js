/**
 * Backward compatibility proxy: re-exports rate limiters from unified rateLimiters.js
 */
const {
    authLimiter,
    apiLimiter,
    strictLimiter
} = require('./rateLimiters');

module.exports = {
    authLimiter,
    apiLimiter,
    strictLimiter
};
