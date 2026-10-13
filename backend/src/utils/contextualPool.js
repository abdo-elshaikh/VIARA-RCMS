'use strict';
const { currentContext } = require('./databaseContext');
const { setBranchContext } = require('./branchTransaction');

function installContextualPool(pool) {
    const rawConnect = pool.connect.bind(pool), rawQuery = pool.query.bind(pool);
    const contextClient = async context => {
        const client = await rawConnect();
        const query = client.query.bind(client);
        if (!context) return client;
        client[Symbol.for('VIARA_DB_CONTEXT')] = context;
        // Each checked-out client captures its context; concurrent requests never
        // borrow each other's request object or authorization state.
        client.query = async (...args) => {
            const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
            const result = await query(...args);
            if (/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(sql || '')) {
                try { await setBranchContext({ query }, context); }
                catch (error) { await query('ROLLBACK'); throw error; }
            }
            return result;
        };
        const release = client.release.bind(client);
        client.release = (...args) => {
            client.query = query;
            client.release = release;
            delete client[Symbol.for('VIARA_DB_CONTEXT')];
            return release(...args);
        };
        return client;
    };
    pool.connect = (...args) => {
        const callback = typeof args[0] === 'function' ? args[0] : null;
        const promise = contextClient(currentContext());
        if (callback) { promise.then(c=>callback(null,c,c.release.bind(c)),callback); return; }
        return promise;
    };
    pool.query = (...args) => {
        const context = currentContext();
        if (!context) return rawQuery(...args);
        const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
        const promise = (async () => {
            const client = await rawConnect();
            try {
                await client.query('BEGIN');
                await setBranchContext(client, context);
                const result = await client.query(...args);
                await client.query('COMMIT');
                return result;
            } catch (error) {
                try { await client.query('ROLLBACK'); } catch {}
                throw error;
            } finally { client.release(); }
        })();
        if (callback) { promise.then(r=>callback(null,r),callback); return; }
        return promise;
    };
    return pool;
}
module.exports = { installContextualPool };
