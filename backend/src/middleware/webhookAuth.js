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

const secretCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const invalidateWebhookSecretCache = (providerName) => {
    if (providerName) secretCache.delete(`secret:${providerName}`);
    else secretCache.clear();
};

const getExternalRequestUrl = (req) => {
    const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return `${protocol}://${host}${req.originalUrl}`;
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
        const cacheKey = `secret:${providerName}`;
        let cached = secretCache.get(cacheKey);

        if (!cached || Date.now() > cached.expiresAt) {
            const result = await pool.query(
                `SELECT api_secret, webhook_secret, secret_version, last_rotated_at
                 FROM integrations
                 WHERE provider_name = $1 AND is_active = TRUE`,
                [providerName]
            );

            const row = result.rows[0];
            const missingProviderSecret = providerName === 'Stripe'
                ? (!row?.api_secret || (!row?.webhook_secret && !process.env.STRIPE_WEBHOOK_SECRET))
                : !row?.api_secret;
            if (!row || missingProviderSecret) {
                return next(new AppError('Integration not configured or inactive', 400));
            }

            const storedSecret = row.api_secret;
            const storedWebhookSecret = row.webhook_secret;
            const secret = storedSecret
                ? (storedSecret.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(storedSecret) ? decrypt(storedSecret) : storedSecret)
                : null;
            const webhookSecret = storedWebhookSecret
                ? (storedWebhookSecret.startsWith('v2:') || /^[0-9a-f]+:[0-9a-f]+$/i.test(storedWebhookSecret) ? decrypt(storedWebhookSecret) : storedWebhookSecret)
                : null;

            cached = {
                secret,
                webhookSecret,
                version: row.secret_version || 1,
                lastRotatedAt: row.last_rotated_at,
                expiresAt: Date.now() + CACHE_TTL_MS
            };
            secretCache.set(cacheKey, cached);
        }

        if (providerName === 'Stripe') {
            const signatureHeader = req.headers['stripe-signature'];
            if (!signatureHeader) return next(new AppError('Missing Stripe signature', 401));

            const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
            if (!rawBody) return next(new AppError('Raw body not captured for Stripe webhook verification', 500));

            const signingSecret = cached.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
            if (!signingSecret) {
                return next(new AppError('Stripe webhook signing secret is not configured', 500));
            }

            const stripeClient = stripe(cached.secret);
            try {
                req.body = stripeClient.webhooks.constructEvent(rawBody, signatureHeader, signingSecret);
            } catch (sigErr) {
                return next(new AppError('Invalid Stripe signature', 401));
            }

        } else if (providerName === 'Twilio' || providerName === 'WhatsApp') {
            const signatureHeader = req.headers['x-twilio-signature'];
            if (!signatureHeader) return next(new AppError('Missing Twilio signature', 401));

            const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
            if (!rawBody) return next(new AppError('Raw body not captured for Twilio webhook verification', 500));

            const url = getExternalRequestUrl(req);
            const params = Object.fromEntries(new URLSearchParams(rawBody.toString()).entries());

            if (!twilio.validateRequest(cached.secret, signatureHeader, url, params)) {
                return next(new AppError('Invalid Twilio signature', 401));
            }
            req.body = params;
        } else {
            return next(new AppError('Unsupported provider for webhook verification', 400));
        }

        req.integrationSecretVersion = cached.version;
        req.integrationLastRotatedAt = cached.lastRotatedAt;
        req.webhookSignatureVerified = providerName;
        next();

    } catch (error) {
        next(error);
    }
};

module.exports = { verifyWebhookSignature, getExternalRequestUrl, invalidateWebhookSecretCache };
