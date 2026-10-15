const os = require('os');
const path = require('path');
jest.mock('../src/services/orthancConnectionService', () => ({ getOrthancConnection: async () => ({ url: 'http://archive', username: 'test', password: 'test' }) }));
jest.mock('../src/services/postgresBackupService', () => ({ decryptBackup: jest.fn(async () => { throw new Error('Invalid encrypted archive'); }), computeFileChecksum: jest.fn(), encryptBackup: jest.fn() }));
const originalFetch = global.fetch;
let ensureArchivedStudiesAvailable;
beforeEach(() => { jest.resetModules(); process.env.PACS_COLD_STORAGE_DIR = path.join(os.tmpdir(), 'viara-pacs-test-archive'); ({ ensureArchivedStudiesAvailable } = require('../src/services/pacsColdStorageService')); });
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); delete process.env.PACS_COLD_STORAGE_DIR; });
const database = () => ({ query: jest.fn(async () => ({ rows: [{ sop_instance_uid: '1.2.5', orthanc_id: 'abc', storage_tier: 'warm', file_ref: 'local:1.2.3/1.2.5.dcm.enc', archive_sha256: 'checksum' }] })) });
test('coalesces concurrent frame checks and checks a mirrored study in one archive request', async () => {
    const db = database(); global.fetch = jest.fn(async () => new Response('["abc"]'));
    await Promise.all([ensureArchivedStudiesAvailable(db, ['1.2.3']), ensureArchivedStudiesAvailable(db, ['1.2.3'])]);
    await ensureArchivedStudiesAvailable(db, ['1.2.3']);
    expect(db.query).toHaveBeenCalledTimes(1); expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('http://archive/tools/find');
});
test('does not mark a missing original available if its encrypted recovery copy fails verification', async () => {
    const db = database(); global.fetch = jest.fn(async () => new Response('[]'));
    await expect(ensureArchivedStudiesAvailable(db, ['1.2.3'])).rejects.toThrow('Invalid encrypted archive');
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/^SELECT/);
    // A failed check must not poison the cache or suppress a subsequent retry.
    global.fetch = jest.fn(async () => new Response('["abc"]'));
    await ensureArchivedStudiesAvailable(db, ['1.2.3']); expect(db.query).toHaveBeenCalledTimes(2);
});
