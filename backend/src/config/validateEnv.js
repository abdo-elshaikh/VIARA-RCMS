/**
 * Validate required environment variables on application startup
 * Throws error if any required variables are missing or invalid
 * In non-production environments, generate safe defaults when placeholders are present
 */
const crypto = require('crypto');

const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'PORT',
    'ORTHANC_PASSWORD',
    'PACS_WEBHOOK_SECRET',
    'BLIND_INDEX_KEY'
];

const optionalEnvVars = [
    'NODE_ENV',
    'CLIENT_URL',
    'LOG_LEVEL'
];

/**
 * Validate environment variables
 * @throws {Error} If required variables are missing or invalid
 */
function validateEnv() {
    const missing = [];
    const invalid = [];

    // In development, allow REPLACE_ME placeholders by generating safe defaults
    if (process.env.NODE_ENV !== 'production') {
        if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).startsWith('REPLACE_ME')) {
            process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
            console.warn('⚠️  Development: generated temporary JWT_SECRET (do NOT use in production)');
        }
        if (!process.env.ENCRYPTION_KEY || String(process.env.ENCRYPTION_KEY).startsWith('REPLACE_ME')) {
            // AES-256 key: 32 bytes -> 64 hex chars
            process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
            console.warn('⚠️  Development: generated temporary ENCRYPTION_KEY (do NOT use in production)');
        }
    }

    // Check required variables
    requiredEnvVars.forEach((envVar) => {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    });

    if (process.env.NODE_ENV === 'production') {
        if (!process.env.BACKUP_ENCRYPTION_KEY) missing.push('BACKUP_ENCRYPTION_KEY');
        if (!process.env.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS');
        if (!process.env.CLAMSCAN_PATH) missing.push('CLAMSCAN_PATH');
        if (!process.env.WEBAUTHN_ORIGIN) missing.push('WEBAUTHN_ORIGIN');
        if (!process.env.WEBAUTHN_RP_ID) missing.push('WEBAUTHN_RP_ID');
        if (!process.env.WEBAUTHN_RP_NAME) missing.push('WEBAUTHN_RP_NAME');

        for (const variable of ['CLIENT_URL', 'PORTAL_CLIENT_URL']) {
            if (!process.env[variable]) {
                missing.push(variable);
                continue;
            }
            try {
                if (new URL(process.env[variable]).protocol !== 'https:') {
                    invalid.push(`${variable} must use HTTPS in production`);
                }
            } catch {
                invalid.push(`${variable} must be a valid absolute URL`);
            }
        }

        const pacsOidcConfig = ['PACS_OIDC_ISSUER', 'PACS_OIDC_AUDIENCE', 'PACS_OIDC_JWKS_URL'];
        if (pacsOidcConfig.some((name) => process.env[name])) {
            for (const name of pacsOidcConfig) {
                if (!process.env[name]?.trim()) missing.push(name);
            }
            for (const name of ['PACS_OIDC_ISSUER', 'PACS_OIDC_JWKS_URL']) {
                if (!process.env[name]) continue;
                try {
                    const url = new URL(process.env[name]);
                    if (!['https:', ...(process.env.NODE_ENV === 'production' ? [] : ['http:'])].includes(url.protocol)
                        || url.search || url.hash || url.username || url.password) {
                        invalid.push(`${name} must be an HTTPS URL without credentials, query, or fragment`);
                    }
                    if (process.env.NODE_ENV !== 'production' && url.protocol === 'http:'
                        && !(name === 'PACS_OIDC_JWKS_URL'
                            ? ['localhost', '127.0.0.1', '::1', 'keycloak'].includes(url.hostname)
                            : ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
                        invalid.push(`${name} may use HTTP only on loopback or the local Keycloak service outside production`);
                    }
                } catch {
                    invalid.push(`${name} must be a valid absolute URL`);
                }
            }
            if (process.env.PACS_OIDC_MAX_TOKEN_TTL_SECONDS) {
                const ttl = Number.parseInt(process.env.PACS_OIDC_MAX_TOKEN_TTL_SECONDS, 10);
                if (!Number.isInteger(ttl) || ttl < 60 || ttl > 600) {
                    invalid.push('PACS_OIDC_MAX_TOKEN_TTL_SECONDS must be between 60 and 600');
                }
            }
            if (process.env.PACS_OIDC_USER_ID_CLAIM
                && !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(process.env.PACS_OIDC_USER_ID_CLAIM)) {
                invalid.push('PACS_OIDC_USER_ID_CLAIM must be a simple claim name or dotted path');
            }
        }

        if (process.env.WEBAUTHN_ORIGIN && process.env.WEBAUTHN_RP_ID) {
            try {
                const webauthnUrl = new URL(process.env.WEBAUTHN_ORIGIN);
                const rpId = process.env.WEBAUTHN_RP_ID.toLowerCase();
                if (webauthnUrl.protocol !== 'https:' || webauthnUrl.origin !== process.env.WEBAUTHN_ORIGIN.replace(/\/$/, '')) {
                    invalid.push('WEBAUTHN_ORIGIN must be an exact HTTPS origin');
                }
                if (webauthnUrl.hostname !== rpId && !webauthnUrl.hostname.endsWith(`.${rpId}`)) {
                    invalid.push('WEBAUTHN_RP_ID must equal or be a parent domain of WEBAUTHN_ORIGIN');
                }
            } catch {
                invalid.push('WEBAUTHN_ORIGIN must be a valid absolute URL');
            }
        }

        for (const origin of String(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)) {
            try {
                const url = new URL(origin);
                if (url.protocol !== 'https:' || url.origin !== origin.replace(/\/$/, '')) {
                    invalid.push('ALLOWED_ORIGINS must contain only exact HTTPS origins');
                    break;
                }
            } catch {
                invalid.push('ALLOWED_ORIGINS must contain only valid absolute origins');
                break;
            }
        }
    }

    // Validate specific variable formats
    if (process.env.ENCRYPTION_KEY) {
        // Must be exactly 64 hex characters (32 bytes for AES-256)
        const hexPattern = /^[0-9a-fA-F]{64}$/;
        if (!hexPattern.test(process.env.ENCRYPTION_KEY)) {
            invalid.push('ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)');
        }
    }

    if (process.env.BLIND_INDEX_KEY && process.env.BLIND_INDEX_KEY.length < 32) {
        invalid.push('BLIND_INDEX_KEY must be at least 32 characters when provided');
    }
    if (process.env.BACKUP_ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(process.env.BACKUP_ENCRYPTION_KEY)) {
        invalid.push('BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
    }

    if (process.env.ENCRYPTION_KEYS) {
        try {
            const keyring = JSON.parse(process.env.ENCRYPTION_KEYS);
            for (const [keyId, key] of Object.entries(keyring)) {
                if (!/^[0-9a-fA-F]{64}$/.test(key)) invalid.push(`ENCRYPTION_KEYS.${keyId} must be 64 hexadecimal characters`);
            }
            const activeKeyId = process.env.ENCRYPTION_KEY_ID || 'default';
            if (activeKeyId !== 'default' && !keyring[activeKeyId]) {
                invalid.push('ENCRYPTION_KEY_ID must identify a key in ENCRYPTION_KEYS');
            }
        } catch {
            invalid.push('ENCRYPTION_KEYS must be a valid JSON object');
        }
    }

    if (process.env.JWT_SECRET) {
        // Enforce minimum 32 characters and valid format for security
        const jwtPattern = /^[A-Za-z0-9\-_]{32,}$/;
        if (!jwtPattern.test(process.env.JWT_SECRET)) {
            invalid.push('JWT_SECRET must be at least 32 characters long and contain only safe characters (A-Z, a-z, 0-9, -, _)');
        }
        // Reject known weak/placeholder patterns
        const WEAK_SECRET_PATTERNS = [
            /dev_jwt_secret_change_this/i,
            /replace_with/i,
            /change_this/i,
            /test_jwt_secret/i,
        ];
        if (WEAK_SECRET_PATTERNS.some(p => p.test(process.env.JWT_SECRET))) {
            invalid.push('JWT_SECRET appears to be a weak/placeholder value — use a randomly generated secret');
        }
    }

    const WEAK_PASSWORD_PATTERNS = [
        /dev_pacs_webhook_secret_change_this/i,
        /dev_blind_index_key_change_this/i,
        /^admin$/i,
    ];
    for (const [name, value] of [['ORTHANC_PASSWORD', process.env.ORTHANC_PASSWORD], ['PACS_WEBHOOK_SECRET', process.env.PACS_WEBHOOK_SECRET], ['BLIND_INDEX_KEY', process.env.BLIND_INDEX_KEY]]) {
        if (value && WEAK_PASSWORD_PATTERNS.some(p => p.test(value))) {
            invalid.push(`${name} appears to be a weak/placeholder value — use a randomly generated secret`);
        }
    }

    if (process.env.PORT) {
        const port = parseInt(process.env.PORT, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            invalid.push('PORT must be a valid port number (1-65535)');
        }
    }

    // Report errors
    if (missing.length > 0 || invalid.length > 0) {
        console.error('=========================================');
        console.error('❌ FATAL ERROR: Invalid Environment Variables Configuration');
        
        if (missing.length > 0) {
            console.error('\nMissing Required Variables:');
            missing.forEach(v => console.error(`   - ${v}`));
            if (missing.includes('JWT_SECRET')) {
                console.error('\n   To generate a secure JWT_SECRET, run:');
                console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
            }
        }
        
        if (invalid.length > 0) {
            console.error('\nInvalid Variable Formats:');
            invalid.forEach(v => console.error(`   - ${v}`));
        }
        
        console.error('=========================================');
        process.exit(1);
    }

    // Log success
    console.log('✅ Environment variables validated successfully');

    // Log warnings for optional but recommended variables
    optionalEnvVars.forEach((envVar) => {
        if (!process.env[envVar]) {
            console.warn(`⚠️  Optional variable not set: ${envVar}`);
        }
    });

    // Set defaults
    if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'development';
        console.log('ℹ️  NODE_ENV not set, defaulting to: development');
    }

    if (!process.env.CLIENT_URL) {
        process.env.CLIENT_URL = 'http://localhost:5173';
        console.log('ℹ️  CLIENT_URL not set, defaulting to: http://localhost:5173');
    }
}

module.exports = validateEnv;
