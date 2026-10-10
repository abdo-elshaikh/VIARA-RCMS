const { createClient } = require('redis');
const { RedisStore } = require('rate-limit-redis');

let client;
let connection;
const sharedEnabled = () => process.env.RATE_LIMIT_STORE === 'redis'
    || (process.env.NODE_ENV === 'production' && Boolean(process.env.REDIS_URL));

const connect = async () => {
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 2000, reconnectStrategy: false } });
        // Redis errors are surfaced by the limiter without logging credentials.
        client.on('error', () => {});
    }
    if (client.isReady) return;
    if (!connection) connection = client.connect().finally(() => { connection = null; });
    await connection;
};

const createRateLimitStore = (policy) => {
    if (!sharedEnabled()) return undefined;
    const store = new RedisStore({
        prefix: `viara:rate-limit:${policy}:`,
        sendCommand: async (...args) => { await connect(); return client.sendCommand(args); }
    });
    // Construction loads scripts asynchronously. Handle their initial failures;
    // startup readiness and subsequent requests still fail closed.
    store.incrementScriptSha.catch(() => {});
    store.getScriptSha.catch(() => {});
    return store;
};

const closeRateLimitStore = async () => {
    if (client?.isOpen) await client.quit();
    client = null;
};

const initializeRateLimitStore = async () => { if (sharedEnabled()) await connect(); };

module.exports = { createRateLimitStore, closeRateLimitStore, initializeRateLimitStore };
