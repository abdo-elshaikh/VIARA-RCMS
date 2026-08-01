const { validateCustomAiEndpointUrl } = require('../src/utils/customAiEndpointUrl');

describe('custom AI endpoint URL policy', () => {
    it('accepts a public HTTPS endpoint', () => {
        expect(validateCustomAiEndpointUrl('https://api.example.com/v1', { production: true }))
            .toBe('https://api.example.com/v1');
    });

    it.each([
        'https://user:password@api.example.com/v1',
        'https://127.0.0.1/v1',
        'https://10.1.2.3/v1',
        'https://169.254.169.254/latest/meta-data',
        'https://192.0.2.10/v1',
        'https://[::1]/v1',
        'https://[fc00::1]/v1',
        'https://[fe80::1]/v1',
        'https://[::ffff:127.0.0.1]/v1',
        'https://[2001:db8::1]/v1'
    ])('rejects unsafe destination %s', (value) => {
        expect(() => validateCustomAiEndpointUrl(value, { production: true })).toThrow();
    });

    it('requires HTTPS in production', () => {
        expect(() => validateCustomAiEndpointUrl('http://api.example.com/v1', { production: true }))
            .toThrow('must use HTTPS in production');
        expect(validateCustomAiEndpointUrl('http://api.example.com/v1', { production: false }))
            .toBe('http://api.example.com/v1');
    });
});
