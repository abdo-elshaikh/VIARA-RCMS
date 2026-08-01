/**
 * Custom Application Error class for operational errors
 * Operational errors are expected errors that should be handled gracefully
 */
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);

        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation Error', details = null) {
        super(message, 400);
        this.name = 'ValidationError';
        if (details) this.details = details;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication Failed') {
        super(message, 401);
        this.name = 'AuthenticationError';
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Not Authorized') {
        super(message, 403);
        this.name = 'AuthorizationError';
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource Not Found') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

class ConflictError extends AppError {
    constructor(message = 'Resource Conflict') {
        super(message, 409);
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
