/**
 * Validate required environment variables on application startup
 * Throws error if any required variables are missing or invalid
 */

const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'PORT'
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

    // Check required variables
    requiredEnvVars.forEach((envVar) => {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    });

    if (process.env.NODE_ENV === 'production') {
        if (!process.env.BLIND_INDEX_KEY) missing.push('BLIND_INDEX_KEY');
        if (!process.env.BACKUP_ENCRYPTION_KEY) missing.push('BACKUP_ENCRYPTION_KEY');
        if (!process.env.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS');
        if (!process.env.CLAMSCAN_PATH) missing.push('CLAMSCAN_PATH');

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
