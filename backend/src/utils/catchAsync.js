/**
 * Wraps async Express route handlers to automatically catch unhandled promise
 * rejections and pass them to the global error handler (`next(error)`).
 * This eliminates the need for boilerplate try/catch blocks in future controllers.
 * 
 * @param {Function} fn The async route handler
 * @returns {Function} Express middleware function
 */
const catchAsync = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
