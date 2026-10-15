jest.mock('../src/services/orthancConnectionService', () => ({ getOrthancConnection: async () => ({ url: 'http://archive', username: 'test', password: 'test' }) }));
jest.mock('../src/services/pacsReconciliationQueue', () => ({ enqueueReconciliation: jest.fn(async () => {}) }));
const { pollOrthancChanges } = require('../src/services/pacsArchiveSyncService');
const { enqueueReconciliation } = require('../src/services/pacsReconciliationQueue');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });
const database = sequence => { const client = { query: jest.fn(async sql => ({ rows: sql.startsWith('SELECT') ? [{ sequence }] : [] })), release: jest.fn() }; return { client, connect: async () => client }; };
test('recovers a cursor above a restored archive sequence', async () => {
    const db = database(100); global.fetch = jest.fn(async url => new Response(JSON.stringify(url.endsWith('?last') ? { Last: 3 } : { Changes: [], Last: 100 })));
    await pollOrthancChanges(db);
    expect(db.client.query.mock.calls.some(([sql]) => sql.includes('sequence = 0'))).toBe(true);
    expect(db.client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
});
test('queues authoritative archive tags and rolls back on archive failures', async () => {
    const db = database(0); global.fetch = jest.fn(async url => new Response(JSON.stringify(url.includes('/changes?') ? { Changes: [{ Seq: 1, ID: 'abc', ChangeType: 'NewInstance' }] } : url.includes('/tags?') ? { PatientID: 'SYNTHETIC', StudyInstanceUID: '1.2.3' } : { ParentStudy: 'study', FileSize: 123 })));
    await pollOrthancChanges(db);
    expect(enqueueReconciliation).toHaveBeenCalledWith(db.client, expect.objectContaining({ PatientID: 'SYNTHETIC', FileSize: 123 }));
    global.fetch = jest.fn(async () => new Response('', { status: 503 }));
    await expect(pollOrthancChanges(db)).rejects.toThrow('503');
    expect(db.client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
});
