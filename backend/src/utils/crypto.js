const crypto = require('crypto');
const logger = require('../config/logger');

// ENCRYPTION_KEY is validated at startup by validateEnv.js
const GCM_IV_LENGTH = 12;

const getKeyring = () => {
    let configured = {};
    if (process.env.ENCRYPTION_KEYS) {
        try {
            configured = JSON.parse(process.env.ENCRYPTION_KEYS);
        } catch (error) {
            logger.warn?.('Invalid ENCRYPTION_KEYS config; ignoring it for decryption fallback.', { error: error.message });
        }
    }
    return {
        default: process.env.ENCRYPTION_KEY,
        backup: process.env.BACKUP_ENCRYPTION_KEY,
        ...configured
    };
};

const getEncryptionKey = (keyId = process.env.ENCRYPTION_KEY_ID || 'default') => {
    const keyHex = getKeyring()[keyId];
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex || '')) {
        throw new Error(`Encryption key '${keyId}' is unavailable or invalid`);
    }
    return { keyId, key: Buffer.from(keyHex, 'hex') };
};

const getDecryptKeyCandidates = (preferredKeyId) => {
    const keyring = getKeyring();
    const orderedIds = [];
    if (preferredKeyId) orderedIds.push(preferredKeyId);
    if (process.env.ENCRYPTION_KEY_ID && process.env.ENCRYPTION_KEY_ID !== preferredKeyId) {
        orderedIds.push(process.env.ENCRYPTION_KEY_ID);
    }
    if ('default' !== preferredKeyId) orderedIds.push('default');
    if ('backup' !== preferredKeyId && process.env.BACKUP_ENCRYPTION_KEY) orderedIds.push('backup');
    for (const [keyId, keyHex] of Object.entries(keyring)) {
        if (keyHex && !orderedIds.includes(keyId)) orderedIds.push(keyId);
    }

    const uniqueCandidates = [];
    for (const keyId of orderedIds) {
        const keyHex = keyring[keyId];
        if (!/^[0-9a-fA-F]{64}$/.test(keyHex || '')) continue;
        if (!uniqueCandidates.find(candidate => candidate.keyId === keyId)) {
            uniqueCandidates.push({ keyId, key: Buffer.from(keyHex, 'hex') });
        }
    }

    return uniqueCandidates;
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
    if (textParts[0] !== 'v2') {
        throw new Error('Invalid encrypted value: legacy AES-CBC format is no longer supported. Run backend/scripts/reencryptPii.js migration.');
    }

    if (![4, 5].includes(textParts.length)) {
        throw new Error('Invalid encrypted value');
    }

    const preferredKeyId = textParts.length === 5 ? textParts[1] : 'default';
    const [ivHex, tagHex, ciphertextHex] = textParts.slice(-3);
    const encryptedText = Buffer.from(ciphertextHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const candidateKeys = getDecryptKeyCandidates(preferredKeyId);
    let lastError;

    for (const { keyId, key } of candidateKeys) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([
                decipher.update(encryptedText),
                decipher.final()
            ]);
            return decrypted.toString();
        } catch (error) {
            lastError = error;
            const isKnownAuthFailure = !error || [
                'ERR_CRYPTO_INVALID_IV',
                'ERR_CRYPTO_INVALID_TAG',
                'ERR_CRYPTO_UNKNOWN',
                'ERR_INVALID_ARG_TYPE',
                'ERR_INVALID_STATE',
                'ERR_INVALID_ARG_VALUE'
            ].includes(error.code) || /Unsupported state or unable to authenticate data|Invalid authentication tag/i.test(String(error.message || ''));
            if (!isKnownAuthFailure) {
                throw error;
            }
        }
    }

    if (lastError) {
        throw lastError;
    }

    throw new Error(`Unable to decrypt value for key '${preferredKeyId}'`);
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
