const { installContextualPool } = require('../src/utils/contextualPool');
const { storage, backgroundPool, serviceActorId } = require('../src/utils/databaseContext');
const assertDatabaseRole = require('../src/utils/assertDatabaseRole');

const fixture = () => {
    const clients = [];
    const pool = { query: jest.fn(async()=>({rows:[]})), connect: jest.fn(async()=>{
        const client = { context: null, release: jest.fn(), query: jest.fn(async function(sql, values) {
            if (sql.includes('set_branch_context')) {
                this.context = values;
                await new Promise(r=>setTimeout(r, values[0] === 'A' ? 8 : 1));
            }
            if (sql === 'FAIL') throw new Error('failed query');
            return { rows: [{ context: this.context }] };
        }) };
        clients.push(client); return client;
    }) };
    return { pool: installContextualPool(pool), clients };
};
const scoped = (branchId, callback) => storage.run({context:{branchId,userId:'user',actorKind:'Staff'}},callback);

test('concurrent reads get independent transaction-local signed contexts', async()=>{
    const {pool,clients}=fixture();
    const [a,b]=await Promise.all([scoped('A',()=>pool.query('SELECT scope')),scoped('B',()=>pool.query('SELECT scope'))]);
    expect(a.rows[0].context[0]).toBe('A'); expect(b.rows[0].context[0]).toBe('B');
    clients.forEach(c=>{expect(c.query).toHaveBeenCalledWith('COMMIT');expect(c.release).toHaveBeenCalledTimes(1);});
});
test('query failure rolls back and releases the scoped connection',async()=>{
    const {pool,clients}=fixture();
    await expect(scoped('A',()=>pool.query('FAIL'))).rejects.toThrow('failed query');
    expect(clients[0].query).toHaveBeenCalledWith('ROLLBACK');expect(clients[0].release).toHaveBeenCalledTimes(1);
});
test('checked-out transaction captures its own context and restores the client at release',async()=>{
    const {pool}=fixture();const client=await scoped('A',()=>pool.connect());
    await scoped('B',()=>client.query('BEGIN'));
    expect(client.context[0]).toBe('A');client.release();
    expect(client[Symbol.for('VIARA_DB_CONTEXT')]).toBeUndefined();
});
test('background work has an explicit non-login service actor',async()=>{
    const {pool}=fixture();const result=await backgroundPool(pool).query('SELECT scope');
    expect(result.rows[0].context[1]).toBe(serviceActorId());
    expect(result.rows[0].context[5]).toBe('Service');
});
test.each(['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','owns_protected_tables'])('startup refuses privileged runtime role: %s',async flag=>{
    await expect(assertDatabaseRole({query:async()=>({rows:[{[flag]:true}]})})).rejects.toThrow('unprivileged');
});
test('startup accepts a separate unprivileged runtime role',async()=>{
    await expect(assertDatabaseRole({query:async()=>({rows:[{name:'rcms_app_user'}]})})).resolves.toBeUndefined();
});
