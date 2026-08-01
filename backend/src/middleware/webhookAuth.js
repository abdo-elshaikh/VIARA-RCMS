const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const { decrypt } = require('../utils/crypto');

const safeEqual = (actual, expected) => {
    const actualBuffer = Buffer.from(actual || '', 'utf8');
    const expectedBuffer = Buffer.from(expected || '', 'utf8');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

/**
 * Middleware to verify incoming webhooks from external integration providers.
 * Requires the provider name to look up the correct API secret.
 */
const verifyWebhookSignature = (pool, providerName) => async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT api_secret FROM integrations WHERE provider_name = $1 AND is_active = TRUE',
            [providerName]
        );

        if (result.rows.length === 0 || !result.rows[0].api_secret) {
            return next(new AppError('Integration not configured or inactive', 400));
        }

        const storedSecret = result.rows[0].api_secret;
        // Preserve compatibility with credentials written before encryption was
        // introduced, while ensuring every new write is encrypted at rest.
        const secret = storedSecret.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(storedSecret)
            ? decrypt(storedSecret)
            : storedSecret;
        const payload = JSON.stringify(req.body);
        let signatureHeader = '';
        let expectedSignature = '';

        // Provider-specific signature logic
        if (providerName === 'Stripe') {
            signatureHeader = req.headers['stripe-signature'];
            if (!signatureHeader) return next(new AppError('Missing Stripe signature', 401));
            
            // Simplified Stripe mock validation
            const hmac = crypto.createHmac('sha256', secret);
            expectedSignature = hmac.update(payload).digest('hex');
            
            // In a real app, use the official stripe SDK: stripe.webhooks.constructEvent
            if (!safeEqual(signatureHeader, expectedSignature)) {
                return next(new AppError('Invalid Stripe Signature', 401));
            }

        } else if (providerName === 'Twilio') {
            signatureHeader = req.headers['x-twilio-signature'];
            if (!signatureHeader) return next(new AppError('Missing Twilio signature', 401));
            
            // Simplified Twilio mock validation
            const hmac = crypto.createHmac('sha1', secret);
            // Twilio uses URL-encoded params for signature, this is just a placeholder
            expectedSignature = hmac.update(payload).digest('base64');
            
            if (!safeEqual(signatureHeader, expectedSignature)) {
                return next(new AppError('Invalid Twilio Signature', 401));
            }
        } else {
            return next(new AppError('Unsupported provider for webhook verification', 400));
        }

        next();

    } catch (error) {
        next(error);
    }
};

module.exports = { verifyWebhookSignature };
