const mockClient = { isReady: false, isOpen: false, on: jest.fn(), sendCommand: jest.fn(), connect: jest.fn(), quit: jest.fn() };
jest.mock('redis', () => ({ createClient: jest.fn(() => mockClient) }));

describe('Shared quota storage', () => {
    const original = { ...process.env };
    let stores;
    beforeEach(() => {
        jest.resetModules(); jest.clearAllMocks();
        process.env.RATE_LIMIT_STORE = 'redis'; process.env.REDIS_URL = 'redis://127.0.0.1:6379';
        mockClient.isReady = false; mockClient.isOpen = false;
        mockClient.connect.mockImplementation(async () => { mockClient.isReady = true; mockClient.isOpen = true; });
        mockClient.quit.mockResolvedValue();
        mockClient.sendCommand.mockImplementation(async args => args[0] === 'SCRIPT' ? 'synthetic-sha' : [1, 60000]);
        stores = require('../src/services/rateLimitStore');
    });
    afterEach(async () => { await stores.closeRateLimitStore(); process.env = { ...original }; });
    test('policies share one connection but have independent key namespaces', async () => {
        const first = stores.createRateLimitStore('auth'), second = stores.createRateLimitStore('pacs');
        first.init({ windowMs: 60000 }); second.init({ windowMs: 60000 });
        await Promise.all([first.increment('source'), second.increment('source')]);
        expect(mockClient.connect).toHaveBeenCalledTimes(1);
        const commands = mockClient.sendCommand.mock.calls.map(([args]) => args).filter(args => args[0] === 'EVALSHA');
        expect(commands.map(args => args[3])).toEqual(expect.arrayContaining(['viara:rate-limit:auth:source', 'viara:rate-limit:pacs:source']));
    });
    test('a failed shared store never silently switches to independent memory quotas', async () => {
        mockClient.connect.mockRejectedValue(new Error('Synthetic Redis outage'));
        const store = stores.createRateLimitStore('auth'); store.init({ windowMs: 60000 });
        await expect(store.increment('source')).rejects.toThrow('Synthetic Redis outage');
        await expect(stores.initializeRateLimitStore()).rejects.toThrow('Synthetic Redis outage');
    });
    test('production selects Redis when configured; local development can use memory', () => {
        delete process.env.RATE_LIMIT_STORE; process.env.NODE_ENV = 'production';
        expect(stores.createRateLimitStore('production')).toBeDefined();
        process.env.NODE_ENV = 'development'; expect(stores.createRateLimitStore('local')).toBeUndefined();
    });
    test('shutdown closes the connection', async () => {
        await stores.initializeRateLimitStore(); await stores.closeRateLimitStore();
        expect(mockClient.quit).toHaveBeenCalledTimes(1);
    });
});
