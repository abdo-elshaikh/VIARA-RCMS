jest.mock('dns', () => ({
    promises: {
        lookup: jest.fn()
    }
}));

const dns = require('dns');
const { validateCustomAiEndpointUrl } = require('../src/utils/customAiEndpointUrl');

beforeEach(() => {
    dns.promises.lookup.mockReset();
    dns.promises.lookup.mockResolvedValue({ address: '93.184.216.34' });
});

describe('custom AI endpoint URL policy', () => {
    it('accepts a public HTTPS endpoint', async () => {
        dns.promises.lookup.mockResolvedValue({ address: '93.184.216.34' });
        expect(await validateCustomAiEndpointUrl('https://api.example.com/v1', { production: true }))
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
    ])('rejects unsafe destination %s', async (value) => {
        await expect(validateCustomAiEndpointUrl(value, { production: true })).rejects.toThrow();
    });

    it('requires HTTPS in production', async () => {
        await expect(validateCustomAiEndpointUrl('http://api.example.com/v1', { production: true }))
            .rejects.toThrow('must use HTTPS in production');
        expect(await validateCustomAiEndpointUrl('http://api.example.com/v1', { production: false }))
            .toBe('http://api.example.com/v1');
    });

    it('rejects a hostname that resolves to a prohibited IP', async () => {
        dns.promises.lookup.mockResolvedValue({ address: '127.0.0.1' });
        await expect(validateCustomAiEndpointUrl('https://evil.example.com/v1', { production: true }))
            .rejects.toThrow('prohibited IP address');
    });
});
