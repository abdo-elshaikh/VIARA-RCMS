const crypto = require('crypto');
const { AppError } = require('./errorHandler');
const { decrypt } = require('../utils/crypto');
const stripe = require('stripe');
const twilio = require('twilio');

const safeEqual = (actual, expected) => {
    const actualBuffer = Buffer.from(actual || '', 'utf8');
    const expectedBuffer = Buffer.from(expected || '', 'utf8');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

/**
 * Middleware to verify incoming webhooks from external integration providers.
 * Requires the provider name to look up the correct API secret.
 *
 * IMPORTANT: Routes using this middleware MUST be mounted with a raw body parser
 * (express.raw()) BEFORE express.json() consumes the body, so that signature
 * verification operates on the exact bytes the provider signed.
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
        const secret = storedSecret.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(storedSecret)
            ? decrypt(storedSecret)
            : storedSecret;

        if (providerName === 'Stripe') {
            const signatureHeader = req.headers['stripe-signature'];
            if (!signatureHeader) return next(new AppError('Missing Stripe signature', 401));

            const rawBody = req.rawBody;
            if (!rawBody) return next(new AppError('Raw body not captured for Stripe webhook verification', 500));

            const stripeClient = stripe(secret);
            try {
                stripeClient.webhooks.constructEvent(rawBody, signatureHeader, secret);
            } catch (sigErr) {
                return next(new AppError(`Invalid Stripe signature: ${sigErr.message}`, 401));
            }

        } else if (providerName === 'Twilio') {
            const signatureHeader = req.headers['x-twilio-signature'];
            if (!signatureHeader) return next(new AppError('Missing Twilio signature', 401));

            // Twilio validation requires the raw URL, method, and POST params.
            // The raw body is URL-encoded form data; parse it for param extraction.
            const rawBody = req.rawBody;
            if (!rawBody) return next(new AppError('Raw body not captured for Twilio webhook verification', 500));

            const originalUrl = req.originalUrl;
            const params = new URLSearchParams(rawBody.toString());

            if (!twilio.validateRequest(secret, originalUrl, params, signatureHeader)) {
                return next(new AppError('Invalid Twilio signature', 401));
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
