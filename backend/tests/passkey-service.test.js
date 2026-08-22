jest.mock('@simplewebauthn/server', () => ({
    generateAuthenticationOptions: jest.fn().mockResolvedValue({ challenge: 'authentication-challenge' }),
    generateRegistrationOptions: jest.fn().mockResolvedValue({ challenge: 'registration-challenge' }),
    verifyAuthenticationResponse: jest.fn(),
    verifyRegistrationResponse: jest.fn()
}));

const webauthn = require('@simplewebauthn/server');
const PasskeyService = require('../src/services/passkeyService');

describe('PasskeyService options', () => {
    beforeEach(() => {
        process.env.CLIENT_URL = 'http://localhost:5173';
        delete process.env.WEBAUTHN_ORIGIN;
        delete process.env.WEBAUTHN_RP_ID;
    });

    test('requires user verification for authentication', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ credential_id: 'credential', transports: ['internal'] }] })
            .mockResolvedValueOnce({ rows: [] }) };
        const result = await PasskeyService.authenticationOptions(db, { user_id: '00000000-0000-4000-8000-000000000001' });
        expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({ rpID: 'localhost', userVerification: 'required' }));
        expect(result).toEqual(expect.objectContaining({ ceremonyId: expect.any(String), options: { challenge: 'authentication-challenge' } }));
    });

    test('uses no attestation and required user verification for registration', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        await PasskeyService.registrationOptions(db, { user_id: '00000000-0000-4000-8000-000000000001', email: 'staff@example.com', full_name: 'Staff User' });
        expect(webauthn.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
            attestationType: 'none',
            authenticatorSelection: expect.objectContaining({ userVerification: 'required' })
        }));
    });

    test('prevents account-less requests from offering unrelated discoverable passkeys', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        await PasskeyService.authenticationOptions(db, null);
        expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({
            allowCredentials: [expect.objectContaining({ id: expect.any(String), transports: ['internal'] })]
        }));
    });
});
