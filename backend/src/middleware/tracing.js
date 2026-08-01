const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Middleware that generates a unique reqId for each request
 * and stores it in AsyncLocalStorage so it can be accessed
 * by the logger from anywhere in the call stack.
 */
const tracingMiddleware = (req, res, next) => {
    const suppliedId = req.headers['x-request-id'];
    const reqId = typeof suppliedId === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(suppliedId)
        ? suppliedId
        : crypto.randomUUID();
    // Attach to req for direct access if needed
    req.id = reqId;
    res.setHeader('X-Request-ID', reqId);
    
    // Store in async context
    asyncLocalStorage.run(reqId, () => {
        next();
    });
};

const getReqId = () => {
    return asyncLocalStorage.getStore();
};

module.exports = {
    tracingMiddleware,
    getReqId
};
