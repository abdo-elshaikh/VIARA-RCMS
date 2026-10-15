/**
 * Custom Application Error class for operational errors
 * Operational errors are expected errors that should be handled gracefully
 */
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true, code = null, details = null) {
        super(message);

        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.code = code || `${statusCode}`;
        if (details) this.details = details;

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation Error', details = null, code = 'VALIDATION_ERROR') {
        super(message, 400, true, code);
        this.name = 'ValidationError';
        if (details) this.details = details;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication Failed', code = 'AUTH_FAILED') {
        super(message, 401, true, code);
        this.name = 'AuthenticationError';
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Not Authorized', code = 'FORBIDDEN') {
        super(message, 403, true, code);
        this.name = 'AuthorizationError';
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource Not Found', code = 'NOT_FOUND') {
        super(message, 404, true, code);
        this.name = 'NotFoundError';
    }
}

class ConflictError extends AppError {
    constructor(message = 'Resource Conflict', code = 'CONFLICT') {
        super(message, 409, true, code);
        this.name = 'ConflictError';
    }
}

module.exports = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError
};
