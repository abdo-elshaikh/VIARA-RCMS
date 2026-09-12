const crypto = require('crypto');

const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

const normalizeContact = (contact, channel) => {
    const value = String(contact || '').trim();
    return channel === 'Email' ? value.toLowerCase() : value;
};

const getSecret = () => process.env.NOTIFICATION_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET;

const signaturePayload = ({ contact, channel, expiresAt }) => [
    TOKEN_VERSION,
    String(expiresAt),
    channel,
    normalizeContact(contact, channel)
].join('\n');

const sign = (payload, secret) => crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

const createUnsubscribeToken = ({ contact, channel, ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() }) => {
    if (!['Email', 'SMS'].includes(channel)) throw new Error('Unsupported unsubscribe channel');
    if (!normalizeContact(contact, channel)) throw new Error('Unsubscribe contact is required');
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
        throw new Error('Invalid unsubscribe token lifetime');
    }
    const secret = getSecret();
    if (!secret) throw new Error('Notification unsubscribe secret is not configured');
    const expiresAt = Math.floor(now / 1000) + ttlSeconds;
    const signature = sign(signaturePayload({ contact, channel, expiresAt }), secret);
    return `${TOKEN_VERSION}.${expiresAt}.${signature}`;
};

const verifyUnsubscribeToken = ({ token, contact, channel, now = Date.now() }) => {
    try {
        if (!['Email', 'SMS'].includes(channel)) return false;
        if (!normalizeContact(contact, channel)) return false;
        const secret = getSecret();
        if (!secret) return false;
        const [version, expiresValue, suppliedSignature, extra] = String(token || '').split('.');
        if (version !== TOKEN_VERSION || extra !== undefined || !/^\d+$/.test(expiresValue || '')) return false;

        const expiresAt = Number(expiresValue);
        const nowSeconds = Math.floor(now / 1000);
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + MAX_TTL_SECONDS) {
            return false;
        }

        const expectedSignature = sign(signaturePayload({ contact, channel, expiresAt }), secret);
        const expected = Buffer.from(expectedSignature);
        const supplied = Buffer.from(suppliedSignature || '');
        return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
    } catch {
        return false;
    }
};

module.exports = {
    createUnsubscribeToken,
    verifyUnsubscribeToken,
    normalizeContact,
    DEFAULT_TTL_SECONDS,
    MAX_TTL_SECONDS
};
