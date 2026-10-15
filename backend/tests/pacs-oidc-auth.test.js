const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const issuer = 'https://identity.example.test/realms/viara';
const audience = 'viara-pacs';
const userId = '4a8cc118-1d4e-4411-bbf7-6e9464fce34e';
const privateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = {
    keys: [{
        ...privateKey.publicKey.export({ format: 'jwk' }),
        kid: 'viara-test-key',
        use: 'sig',
        alg: 'RS256'
    }]
};
const originalJwk = jwks.keys[0];

process.env.JWT_SECRET = 'pacs-oidc-test-secret-with-at-least-32-characters';
const { authenticateDicomWeb, configureAuthDatabase } = require('../src/middleware/authMiddleware');

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
});

const signToken = (claims = {}, options = {}) => jwt.sign({
    viara_user_id: userId,
    scope: 'openid pacs.read',
    ...claims
}, privateKey.privateKey, {
    algorithm: 'RS256',
    issuer,
    audience,
    expiresIn: '5m',
    keyid: 'viara-test-key',
    ...options
});

const makeRequest = (token) => ({
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    path: '/api/pacs/dicom-web/studies/1.2.3/metadata',
    originalUrl: '/api/pacs/dicom-web/studies/1.2.3/metadata'
});

describe('PACS OIDC DICOMweb authentication', () => {
    const originalFetch = global.fetch;
    const originalEnv = {
        PACS_OIDC_ISSUER: process.env.PACS_OIDC_ISSUER,
        PACS_OIDC_AUDIENCE: process.env.PACS_OIDC_AUDIENCE,
        PACS_OIDC_JWKS_URL: process.env.PACS_OIDC_JWKS_URL,
        PACS_OIDC_USER_ID_CLAIM: process.env.PACS_OIDC_USER_ID_CLAIM,
        PACS_OIDC_REQUIRED_SCOPE: process.env.PACS_OIDC_REQUIRED_SCOPE,
        PACS_OIDC_MAX_TOKEN_TTL_SECONDS: process.env.PACS_OIDC_MAX_TOKEN_TTL_SECONDS
    };
    const activeUser = {
        user_id: userId,
        role: 'Radiologist',
        email: 'reader@example.test',
        full_name: 'Test Reader',
        must_change_password: false
    };

    beforeEach(() => {
        jwks.keys = [originalJwk];
        process.env.PACS_OIDC_ISSUER = issuer;
        process.env.PACS_OIDC_AUDIENCE = audience;
        process.env.PACS_OIDC_JWKS_URL = `${issuer}/protocol/openid-connect/certs`;
        process.env.PACS_OIDC_USER_ID_CLAIM = 'viara_user_id';
        process.env.PACS_OIDC_REQUIRED_SCOPE = 'pacs.read';
        process.env.PACS_OIDC_MAX_TOKEN_TTL_SECONDS = '300';
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () => JSON.stringify(jwks)
        }));
    });

    afterEach(() => {
        configureAuthDatabase(undefined);
        global.fetch = originalFetch;
        Object.entries(originalEnv).forEach(([name, value]) => {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        });
    });

    test('accepts a valid OIDC token and resolves current identity and role from VIARA', async () => {
        const db = { query: jest.fn(async () => ({ rows: [activeUser] })) };
        configureAuthDatabase(db);
        const req = makeRequest(signToken());
        const next = jest.fn();

        await authenticateDicomWeb(req, makeResponse(), next);

        expect(next).toHaveBeenCalledWith();
        expect(req.authType).toBe('pacs_oidc');
        expect(req.user).toEqual(activeUser);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('is_active = TRUE'), [userId]);
    });

    test('supports the local Keycloak service as a development JWKS host', async () => {
        process.env.PACS_OIDC_ISSUER = 'http://localhost:8081/realms/viara';
        process.env.PACS_OIDC_JWKS_URL = 'http://keycloak:8080/realms/viara/protocol/openid-connect/certs';
        const localToken = jwt.sign({
            viara_user_id: userId,
            scope: 'openid pacs.read'
        }, privateKey.privateKey, {
            algorithm: 'RS256',
            issuer: process.env.PACS_OIDC_ISSUER,
            audience,
            expiresIn: '5m',
            keyid: 'viara-test-key'
        });
        configureAuthDatabase({ query: jest.fn(async () => ({ rows: [activeUser] })) });
        const next = jest.fn();

        await authenticateDicomWeb(makeRequest(localToken), makeResponse(), next);

        expect(global.fetch).toHaveBeenCalledWith(
            process.env.PACS_OIDC_JWKS_URL,
            expect.any(Object)
        );
        expect(next).toHaveBeenCalledWith();
    });

    test('keeps standard VIARA JWT authentication working when PACS OIDC is enabled', async () => {
        configureAuthDatabase({
            query: jest.fn(async () => ({ rows: [{ current_session_id: 'session-1', is_active: true, role: 'Radiologist', must_change_password: false }] }))
        });
        const token = jwt.sign({
            user_id: userId,
            role: 'Radiologist',
            session_id: 'session-1'
        }, process.env.JWT_SECRET, { expiresIn: '5m' });
        const req = makeRequest(token);
        const next = jest.fn();

        await authenticateDicomWeb(req, makeResponse(), next);

        expect(next).toHaveBeenCalledWith();
        expect(req.authType).toBe('jwt');
    });

    test('does not accept an OIDC token under a non-Bearer authorization scheme', async () => {
        configureAuthDatabase({ query: jest.fn() });
        const req = makeRequest(signToken());
        req.headers.authorization = `Basic ${signToken()}`;
        const res = makeResponse();

        await authenticateDicomWeb(req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Access Denied: No Token Provided' }));
    });

    test.each([
        ['wrong audience', {}, { audience: 'another-api' }],
        ['missing PACS scope', { scope: 'openid profile' }, {}],
        ['token lifetime over the configured maximum', {}, { expiresIn: '11m' }]
    ])('rejects OIDC credentials with %s', async (_label, claims, options) => {
        configureAuthDatabase({ query: jest.fn() });
        const res = makeResponse();
        const next = jest.fn();

        await authenticateDicomWeb(makeRequest(signToken(claims, options)), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_PACS_OIDC_TOKEN' }));
        expect(next).not.toHaveBeenCalled();
    });

    test.each([
        { label: 'missing or inactive', rows: [] },
        { label: 'password change required', rows: [{ ...activeUser, must_change_password: true }] }
    ])('rejects a VIARA account that is $label', async ({ rows }) => {
        configureAuthDatabase({ query: jest.fn(async () => ({ rows })) });
        const res = makeResponse();

        await authenticateDicomWeb(makeRequest(signToken()), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PACS_OIDC_USER_UNAVAILABLE' }));
    });

    test('fails closed when the identity provider signing keys cannot be fetched', async () => {
        process.env.PACS_OIDC_JWKS_URL = 'https://identity.example.test/other-realm/certs';
        global.fetch = jest.fn(async () => { throw new Error('connection refused'); });
        const res = makeResponse();

        await authenticateDicomWeb(makeRequest(signToken()), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PACS_OIDC_KEY_SERVICE_UNAVAILABLE' }));
    });

    test('refreshes once to accept a newly rotated signing key', async () => {
        process.env.PACS_OIDC_JWKS_URL = `${issuer}/rotated-keys`;
        const rotated = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        const rotatedJwk = {
            ...rotated.publicKey.export({ format: 'jwk' }),
            kid: 'viara-rotated-key',
            use: 'sig',
            alg: 'RS256'
        };
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () => JSON.stringify({
                keys: global.fetch.mock.calls.length === 1 ? [originalJwk] : [originalJwk, rotatedJwk]
            })
        }));
        configureAuthDatabase({ query: jest.fn(async () => ({ rows: [activeUser] })) });
        const initialNext = jest.fn();
        await authenticateDicomWeb(makeRequest(signToken()), makeResponse(), initialNext);
        expect(initialNext).toHaveBeenCalledWith();

        const req = makeRequest(jwt.sign({
            viara_user_id: userId,
            scope: 'pacs.read'
        }, rotated.privateKey, {
            algorithm: 'RS256',
            issuer,
            audience,
            expiresIn: '5m',
            keyid: rotatedJwk.kid
        }));
        const next = jest.fn();

        await authenticateDicomWeb(req, makeResponse(), next);

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenCalledWith();
        expect(req.authType).toBe('pacs_oidc');
    });

    test('throttles repeated refreshes for unknown signing keys', async () => {
        process.env.PACS_OIDC_JWKS_URL = `${issuer}/unknown-kid`;
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: async () => JSON.stringify(jwks)
        }));
        const token = signToken({}, { keyid: 'unknown-signing-key' });
        const res = makeResponse();

        await authenticateDicomWeb(makeRequest(token), res, jest.fn());
        await authenticateDicomWeb(makeRequest(token), res, jest.fn());
        await authenticateDicomWeb(makeRequest(token), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(401);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('fails closed when OIDC is only partially configured', async () => {
        delete process.env.PACS_OIDC_AUDIENCE;
        const res = makeResponse();

        await authenticateDicomWeb(makeRequest(signToken()), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PACS_OIDC_CONFIGURATION' }));
    });
});
