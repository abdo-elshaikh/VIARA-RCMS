const logger = require('../utils/logger');

const { AppError, ValidationError, AuthenticationError, ConflictError } = require('../utils/errors');

/**
 * Centralized error handling middleware
 * Handles all errors and sends appropriate responses
 */
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    let error = err;

    // Database Constraint Violation mapping
    if (error.code === '23505') {
        error = new ConflictError('Database conflict: Resource already exists');
    }
    if (error.code === '23503') {
        error = new ConflictError('The resource is still referenced by another record');
    }
    if (['22P02', '23502', '23514'].includes(error.code)) {
        const detail = err.detail || err.message || 'The request contains an invalid value';
        error = new ValidationError(detail.includes('The request contains') ? detail : `Invalid value: ${detail}`);
    }
    // JWT Token mappings
    if (error.name === 'JsonWebTokenError') {
        error = new AuthenticationError('Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
        error = new AuthenticationError('Token has expired');
    }

    // Default error values
    let { statusCode = 500, message, isOperational = false } = error;

    // Log the error using Winston
    if (statusCode >= 500) {
        // Unexpected server errors (bugs, DB crashes, etc.)
        logger.error(`[${req.method} ${req.url}] ${message}`, { stack: err.stack, user: req.user?.user_id });
    } else {
        // Operational errors (400, 401, 404, etc.)
        logger.warn(`[${req.method} ${req.url}] ${message}`);
    }

    // Don't leak error details in production for non-operational errors
    if (!isOperational && process.env.NODE_ENV === 'production') {
        message = 'An unexpected error occurred';
    }

    // Send error response
    // Ensure consistent structure for API responses
    const errorResponse = {
        success: false,
        status: statusCode >= 500 ? 'error' : 'fail',
        message,
        error: message,
        code: statusCode
    };

    if (process.env.NODE_ENV !== 'production') {
        errorResponse.stack = error.stack;
        if (error.details) errorResponse.details = error.details;
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
};

/**
 * Handle 404 - Not Found
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Route not found: ${req.originalUrl}`, 404);
    next(error);
};

module.exports = {
    AppError,
    errorHandler,
    notFoundHandler
};
