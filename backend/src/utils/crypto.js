const crypto = require('crypto');
const logger = require('../config/logger');

// ENCRYPTION_KEY is validated at startup by validateEnv.js
const GCM_IV_LENGTH = 12;

const getKeyring = () => {
    let configured = {};
    if (process.env.ENCRYPTION_KEYS) {
        configured = JSON.parse(process.env.ENCRYPTION_KEYS);
    }
    return { default: process.env.ENCRYPTION_KEY, ...configured };
};

const getEncryptionKey = (keyId = process.env.ENCRYPTION_KEY_ID || 'default') => {
    const keyHex = getKeyring()[keyId];
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex || '')) {
        throw new Error(`Encryption key '${keyId}' is unavailable or invalid`);
    }
    return { keyId, key: Buffer.from(keyHex, 'hex') };
};

function encrypt(text) {
    if (!text) return null;

    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const { keyId, key } = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(String(text), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v2:${keyId}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
    if (!text) return null;

    const textParts = String(text).split(':');
    let decipher;
    let encryptedText;

    if (textParts[0] === 'v2') {
        if (![4, 5].includes(textParts.length)) throw new Error('Invalid encrypted value');
        const keyId = textParts.length === 5 ? textParts[1] : 'default';
        const { key } = getEncryptionKey(keyId);
        const [ivHex, tagHex, ciphertextHex] = textParts.slice(-3);
        decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        encryptedText = Buffer.from(ciphertextHex, 'hex');
    } else {
        throw new Error('Invalid encrypted value: legacy AES-CBC format is no longer supported. Run backend/scripts/reencryptPii.js migration.');
    }

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
}

/**
 * Generate a deterministic HMAC-SHA256 hash for blind indexing
 */
function hash(text) {
    if (!text) return null;
    if (!process.env.BLIND_INDEX_KEY) {
        throw new Error('BLIND_INDEX_KEY is required for blind indexing');
    }
    const blindIndexKey = process.env.BLIND_INDEX_KEY;
    const key = /^[0-9a-fA-F]{64}$/.test(blindIndexKey)
        ? Buffer.from(blindIndexKey, 'hex')
        : Buffer.from(blindIndexKey, 'utf8');
    return crypto.createHmac('sha256', key)
        .update(String(text).toLowerCase()) // Hash lowercase to allow case-insensitive search
        .digest('hex');
}

module.exports = { encrypt, decrypt, hash };
