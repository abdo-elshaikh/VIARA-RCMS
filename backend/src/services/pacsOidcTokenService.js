const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const OIDC_ENV = {
    issuer: 'PACS_OIDC_ISSUER',
    audience: 'PACS_OIDC_AUDIENCE',
    jwksUrl: 'PACS_OIDC_JWKS_URL'
};
const MAX_JWKS_BYTES = 256 * 1024;
const JWKS_CACHE_MS = 5 * 60 * 1000;
const JWKS_REFRESH_COOLDOWN_MS = 30 * 1000;
const jwksCache = new Map();
const jwksInFlight = new Map();
const jwksRefreshInFlight = new Map();
const jwksRefreshTimes = new Map();
const jwksRefreshErrors = new Map();

const getConfiguration = () => {
    const configured = Object.values(OIDC_ENV).some((name) => Boolean(process.env[name]?.trim()));
    if (!configured) return null;

    const missing = Object.values(OIDC_ENV).filter((name) => !process.env[name]?.trim());
    if (missing.length) {
        const error = new Error(`Incomplete PACS OIDC configuration: ${missing.join(', ')}`);
        error.code = 'PACS_OIDC_CONFIGURATION';
        throw error;
    }

    let issuer;
    let jwksUrl;
    try {
        issuer = new URL(process.env[OIDC_ENV.issuer]);
        jwksUrl = new URL(process.env[OIDC_ENV.jwksUrl]);
    } catch {
        const error = new Error('PACS OIDC issuer and JWKS URL must be absolute URLs');
        error.code = 'PACS_OIDC_CONFIGURATION';
        throw error;
    }
    const isProduction = process.env.NODE_ENV === 'production';
    const isLoopback = (url) => ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    const isDevelopmentHost = (url) => ['localhost', '127.0.0.1', '::1', 'keycloak'].includes(url.hostname);
    if ((issuer.protocol !== 'https:' && (isProduction || !isLoopback(issuer)))
        || (jwksUrl.protocol !== 'https:' && (isProduction || !isDevelopmentHost(jwksUrl)))) {
        const error = new Error('PACS OIDC issuer and JWKS URL must use HTTPS');
        error.code = 'PACS_OIDC_CONFIGURATION';
        throw error;
    }
    if (issuer.search || issuer.hash || issuer.username || issuer.password
        || jwksUrl.search || jwksUrl.hash || jwksUrl.username || jwksUrl.password) {
        const error = new Error('PACS OIDC issuer and JWKS URL cannot contain credentials, query strings, or fragments');
        error.code = 'PACS_OIDC_CONFIGURATION';
        throw error;
    }

    const maxTokenTtlSeconds = Number.parseInt(process.env.PACS_OIDC_MAX_TOKEN_TTL_SECONDS || '300', 10);
    if (!Number.isInteger(maxTokenTtlSeconds) || maxTokenTtlSeconds < 60 || maxTokenTtlSeconds > 600) {
        const error = new Error('PACS_OIDC_MAX_TOKEN_TTL_SECONDS must be between 60 and 600');
        error.code = 'PACS_OIDC_CONFIGURATION';
        throw error;
    }

    return {
        issuer: process.env[OIDC_ENV.issuer].trim(),
        audience: process.env[OIDC_ENV.audience].trim(),
        jwksUrl: jwksUrl.toString(),
        userIdClaim: process.env.PACS_OIDC_USER_ID_CLAIM?.trim() || 'viara_user_id',
        requiredScope: process.env.PACS_OIDC_REQUIRED_SCOPE?.trim() || 'pacs.read',
        maxTokenTtlSeconds
    };
};

const isConfigured = () => Object.values(OIDC_ENV).some((name) => Boolean(process.env[name]?.trim()));

const readBoundedBody = async (response) => {
    if (!response.body?.getReader) {
        const text = await response.text();
        if (Buffer.byteLength(text) > MAX_JWKS_BYTES) throw new Error('JWKS response is too large');
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_JWKS_BYTES) {
                await reader.cancel();
                throw new Error('JWKS response is too large');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    chunks.forEach((chunk) => {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return new TextDecoder().decode(body);
};

const fetchSigningKeys = async (config, forceRefresh = false) => {
    const cached = jwksCache.get(config.jwksUrl);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.keys;
    if (jwksInFlight.has(config.jwksUrl)) return jwksInFlight.get(config.jwksUrl);

    const request = (async () => {
        let response;
        try {
            response = await fetch(config.jwksUrl, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(5000),
                redirect: 'error'
            });
        } catch (cause) {
            const error = new Error('PACS OIDC signing key service is unavailable', { cause });
            error.code = 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE';
            throw error;
        }
        if (!response.ok) {
            const error = new Error(`PACS OIDC signing key service returned HTTP ${response.status}`);
            error.code = 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE';
            throw error;
        }

        let body;
        try {
            const contentLength = Number(response.headers?.get?.('content-length') || 0);
            if (contentLength > MAX_JWKS_BYTES) throw new Error('JWKS response is too large');
            const text = await readBoundedBody(response);
            body = JSON.parse(text);
        } catch (cause) {
            const error = new Error('PACS OIDC signing key response is invalid', { cause });
            error.code = 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE';
            throw error;
        }

        if (!Array.isArray(body?.keys) || body.keys.length > 50) {
            const error = new Error('PACS OIDC signing key response is invalid');
            error.code = 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE';
            throw error;
        }

        const keys = new Map();
        for (const jwk of body.keys) {
            if (!jwk || typeof jwk.kid !== 'string' || jwk.use && jwk.use !== 'sig') continue;
            if (jwk.alg && !['RS256', 'ES256'].includes(jwk.alg)) continue;
            if (!['RSA', 'EC'].includes(jwk.kty)) continue;
            if (jwk.kty === 'RSA' && jwk.alg === 'ES256') continue;
            if (jwk.kty === 'EC' && (jwk.alg === 'RS256' || jwk.crv !== 'P-256')) continue;
            try {
                const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
                if (jwk.kty === 'RSA' && (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) continue;
                keys.set(jwk.kid, key);
            } catch {
                // Ignore unusable keys and reject tokens that refer to them.
            }
        }
        if (!keys.size) {
            const error = new Error('PACS OIDC signing key response has no usable keys');
            error.code = 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE';
            throw error;
        }
        jwksCache.set(config.jwksUrl, { keys, expiresAt: Date.now() + JWKS_CACHE_MS });
        return keys;
    })();

    jwksInFlight.set(config.jwksUrl, request);
    try {
        return await request;
    } finally {
        jwksInFlight.delete(config.jwksUrl);
    }
};

const getSigningKey = async (config, kid) => {
    const cachedBeforeFetch = jwksCache.get(config.jwksUrl);
    const keys = await fetchSigningKeys(config);
    const key = keys.get(kid);
    if (!key) {
        const usedFreshCache = cachedBeforeFetch && cachedBeforeFetch.expiresAt > Date.now();
        if (!usedFreshCache) {
            const error = new Error('PACS OIDC token signing key is unknown');
            error.code = 'PACS_OIDC_INVALID_TOKEN';
            throw error;
        }

        if (jwksRefreshInFlight.has(config.jwksUrl)) {
            await jwksRefreshInFlight.get(config.jwksUrl);
        } else if (Date.now() - (jwksRefreshTimes.get(config.jwksUrl) || 0) >= JWKS_REFRESH_COOLDOWN_MS) {
            jwksRefreshTimes.set(config.jwksUrl, Date.now());
            const refresh = fetchSigningKeys(config, true);
            jwksRefreshInFlight.set(config.jwksUrl, refresh);
            try {
                await refresh;
                jwksRefreshErrors.delete(config.jwksUrl);
            } catch (error) {
                jwksRefreshErrors.set(config.jwksUrl, error);
                throw error;
            } finally {
                jwksRefreshInFlight.delete(config.jwksUrl);
            }
        } else if (jwksRefreshErrors.has(config.jwksUrl)) {
            throw jwksRefreshErrors.get(config.jwksUrl);
        }

        const refreshedKeys = jwksCache.get(config.jwksUrl)?.keys || keys;
        const refreshedKey = refreshedKeys.get(kid);
        if (!refreshedKey) {
            const error = new Error('PACS OIDC token signing key is unknown');
            error.code = 'PACS_OIDC_INVALID_TOKEN';
            throw error;
        }
        return refreshedKey;
    }
    return key;
};

const verifyJwt = (token, config) => new Promise((resolve, reject) => {
    let keyResolutionError = null;
    jwt.verify(token, (header, callback) => {
        if (!header?.kid || !['RS256', 'ES256'].includes(header.alg)) {
            const error = new Error('PACS OIDC token signing algorithm is not allowed');
            error.code = 'PACS_OIDC_INVALID_TOKEN';
            callback(error);
            return;
        }
        getSigningKey(config, header.kid).then(
            (key) => callback(null, key),
            (error) => {
                keyResolutionError = error;
                callback(error);
            }
        );
    }, {
        algorithms: ['RS256', 'ES256'],
        issuer: config.issuer,
        audience: config.audience,
        clockTolerance: 5
    }, (error, claims) => {
        if (error) {
            if (keyResolutionError) return reject(keyResolutionError);
            error.code = error.code || 'PACS_OIDC_INVALID_TOKEN';
            return reject(error);
        }
        resolve(claims);
    });
});

const readClaim = (claims, path) => path.split('.').reduce(
    (value, part) => value && typeof value === 'object' ? value[part] : undefined,
    claims
);

const verifyPacsOidcToken = async (token) => {
    const config = getConfiguration();
    if (!config) {
        const error = new Error('PACS OIDC authentication is not configured');
        error.code = 'PACS_OIDC_CONFIGURATION';
        throw error;
    }
    const claims = await verifyJwt(token, config);
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = Number(claims.iat);
    const expiresAt = Number(claims.exp);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
        || issuedAt > now + 30
        || expiresAt <= now
        || expiresAt - issuedAt > config.maxTokenTtlSeconds) {
        const error = new Error('PACS OIDC token lifetime is invalid');
        error.code = 'PACS_OIDC_INVALID_TOKEN';
        throw error;
    }

    const scopeClaim = claims.scope || claims.scp || '';
    const scopes = Array.isArray(scopeClaim) ? scopeClaim : String(scopeClaim).split(/\s+/);
    if (!scopes.includes(config.requiredScope)) {
        const error = new Error('PACS OIDC token is missing the required scope');
        error.code = 'PACS_OIDC_INVALID_TOKEN';
        throw error;
    }

    const userId = readClaim(claims, config.userIdClaim);
    if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        const error = new Error('PACS OIDC token does not identify a VIARA user');
        error.code = 'PACS_OIDC_INVALID_TOKEN';
        throw error;
    }

    return { claims, userId };
};

module.exports = {
    isConfigured,
    verifyPacsOidcToken
};
