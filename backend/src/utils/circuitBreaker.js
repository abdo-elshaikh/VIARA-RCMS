const CircuitBreaker = require('opossum');

const DEFAULT_OPTIONS = {
    timeout: 30000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountBuckets: 10,
    rollingCountTimeout: 1000,
    name: 'unnamed-breaker'
};

const createCircuitBreaker = (fn, options = {}) => {
    const breaker = new CircuitBreaker(fn, { ...DEFAULT_OPTIONS, ...options });

    breaker.on('open', () => {
        console.warn(`Circuit breaker [${options.name || 'unnamed'}] opened`);
    });
    breaker.on('close', () => {
        console.warn(`Circuit breaker [${options.name || 'unnamed'}] closed`);
    });
    breaker.on('halfOpen', () => {
        console.warn(`Circuit breaker [${options.name || 'unnamed'}] half-open`);
    });

    return breaker;
};

const withRetry = async (fn, retries = 3, delay = 1000) => {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt < retries) {
                const backoff = delay * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, backoff));
            }
        }
    }
    throw lastErr;
};

module.exports = { createCircuitBreaker, withRetry };
