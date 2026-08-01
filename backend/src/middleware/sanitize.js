/**
 * Sanitizes input payloads to prevent XSS.
 * Removes HTML tags from all string fields in req.body, req.query, and req.params.
 */
const PASSTHROUGH_KEYS = new Set([
    'password', 'currentPassword', 'newPassword', 'confirmPassword',
    'api_key', 'api_secret', 'token', 'refreshToken', 'twoFactorCode'
]);

const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
            if (!PASSTHROUGH_KEYS.has(key)) {
                obj[key] = obj[key].replace(/<\/?[^>]+(>|$)/g, "");
            }
        } else if (typeof obj[key] === 'object') {
            sanitizeObject(obj[key]);
        }
    }
};

const sanitizeInput = (req, res, next) => {
    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);
    next();
};

module.exports = sanitizeInput;
