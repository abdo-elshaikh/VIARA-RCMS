const { z } = require('zod');

/**
 * Middleware factory to validate request body against a Zod schema
 * @param {z.ZodSchema} schema - Zod validation schema
 * @returns {Function} Express middleware function
 */
const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            // Validate and parse request body
            const validated = schema.parse(req.body);

            // Replace req.body with validated data
            req.body = validated;

            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                // Format Zod errors for client
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                return res.status(400).json({
                    error: 'Validation failed',
                    details: formattedErrors
                });
            }

            // Pass other errors to error handler
            next(error);
        }
    };
};

/**
 * Middleware to validate query parameters
 * @param {z.ZodSchema} schema - Zod validation schema
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const validated = schema.parse(req.query);
            req.query = validated;
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: formattedErrors
                });
            }
            next(error);
        }
    };
};

module.exports = {
    validateRequest,
    validateQuery
};
