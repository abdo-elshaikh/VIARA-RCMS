const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Writable } = require('stream');
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const yazl = require('yazl');
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/services/pacsReconcileService', () => ({ writeAudit: jest.fn(), reconcileInstance: jest.fn(async () => ({ status: 'reconciled' })) }));
const { snapshotPacs, verifyPacsZip, visitZip, restorePacs } = require('../src/services/pacsBackupService');
const { exportRenderedImagesZip } = require('../src/services/pacsExportService');
const { enqueueReconciliation, processQueue } = require('../src/services/pacsReconciliationQueue');

describe('PACS reliability', () => {
    let directory;
    const originalFetch = global.fetch;
    beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'viara-pacs-test-')); });
    afterEach(async () => { global.fetch = originalFetch; jest.clearAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });
    test('backs up every original DICOM and verifies their checksums', async () => {
        global.fetch = jest.fn(async url => String(url).endsWith('/instances')
            ? new Response('["abc","def"]') : new Response('original-dicom-' + url.split('/').at(-2)));
        const target = path.join(directory, 'pacs.zip');
        const snapshot = await snapshotPacs(target, { connection: { url: 'http://archive', username: 'test', password: 'test' } });
        expect((await verifyPacsZip(target)).instances).toHaveLength(2);
        expect(snapshot.manifest.instances[0].sha256).toBe(crypto.createHash('sha256').update('original-dicom-abc').digest('hex'));
        await snapshot.verifyUnchanged();
        global.fetch = jest.fn(async () => new Response('["abc","def","fed"]'));
        await expect(snapshot.verifyUnchanged()).rejects.toThrow('changed during backup');
    });
    test('exports every frame and an explicitly complete manifest', async () => {
        global.fetch = jest.fn(async url => {
            if (url.endsWith('/studies/s')) return new Response('{"Series":["a"]}');
            if (url.endsWith('/series/a')) return new Response('{"Instances":["i"]}');
            if (url.endsWith('/frames')) return new Response('[0,1,2]');
            return new Response(Buffer.from([1,2,3]), { headers: { 'Content-Type': 'image/jpeg' } });
        });
        const chunks = [];
        const res = new Writable({ write(chunk, _, done) { chunks.push(chunk); done(); } });
        res.status = () => res; res.setHeader = jest.fn();
        const result = await exportRenderedImagesZip({ orthancUrl: 'http://archive', auth: 'Basic test', orthancStudyId: 's', study: { study_instance_uid: '1.2.3' }, filename: 'test.zip', res });
        expect(result).toMatchObject({ imageCount: 3, complete: true });
        const target = path.join(directory, 'images.zip'); await fs.writeFile(target, Buffer.concat(chunks));
        const entries = [];
        await visitZip(target, async (entry, stream) => { const data=[]; for await (const chunk of stream) data.push(chunk); entries.push([entry.fileName, Buffer.concat(data)]); });
        expect(entries.filter(([name]) => name.endsWith('.jpg'))).toHaveLength(3);
        expect(JSON.parse(entries.find(([name]) => name === 'manifest.json')[1]).complete).toBe(true);
    });
    test('rejects a forged manifest that repeats one entry and omits another', async () => {
        const zip = new yazl.ZipFile();
        zip.addBuffer(Buffer.from('a'), 'abc.dcm'); zip.addBuffer(Buffer.from('b'), 'def.dcm');
        const repeated = { file: 'abc.dcm', sha256: crypto.createHash('sha256').update('a').digest('hex') };
        zip.addBuffer(Buffer.from(JSON.stringify({ format: 'viara-pacs-v1', instances: [repeated, repeated] })), 'manifest.json');
        zip.end(); const target = path.join(directory, 'forged.zip');
        await pipeline(zip.outputStream, createWriteStream(target));
        await expect(verifyPacsZip(target)).rejects.toThrow('Duplicate PACS manifest instance');
    });
    test('rejects altered DICOM bytes before any recovery operation', async () => {
        const zip = new yazl.ZipFile(); zip.addBuffer(Buffer.from('altered pixels'), 'abc.dcm');
        zip.addBuffer(Buffer.from(JSON.stringify({ format: 'viara-pacs-v1', instances: [{ file: 'abc.dcm', sha256: crypto.createHash('sha256').update('original pixels').digest('hex') }] })), 'manifest.json');
        zip.end(); const target = path.join(directory, 'altered.zip');
        await pipeline(zip.outputStream, createWriteStream(target));
        await expect(verifyPacsZip(target)).rejects.toThrow('checksum mismatch');
    });
    test('deduplicates reconciliation events and recovers expired processing leases', async () => {
        const client = { query: jest.fn(async () => ({ rows: [] })), release: jest.fn() };
        const db = { query: jest.fn(async () => ({ rows: [{ id: 'job' }] })), connect: async () => client };
        await enqueueReconciliation(db, { OrthancInstanceId: 'abc', StudyInstanceUID: '1.2.3' });
        expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (event_key) DO NOTHING');
        await processQueue(db);
        expect(client.query.mock.calls.some(([sql]) => sql.includes('Reconciliation lease expired'))).toBe(true);
        expect(client.query.mock.calls.some(([sql]) => sql.includes('attempts < 5'))).toBe(true);
        expect(client.release).toHaveBeenCalled();
    });
    test('restores DICOM instances from verified zip to Orthanc', async () => {
        const zip = new yazl.ZipFile();
        const dicomContent = Buffer.from('DICOM_DATA_FOR_RESTORE');
        zip.addBuffer(dicomContent, 'a001.dcm');
        const manifest = {
            format: 'viara-pacs-v1',
            instances: [{
                file: 'a001.dcm',
                sha256: crypto.createHash('sha256').update(dicomContent).digest('hex')
            }]
        };
        zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
        zip.end();
        const target = path.join(directory, 'valid-pacs.zip');
        await pipeline(zip.outputStream, createWriteStream(target));

        const postedInstances = [];
        global.fetch = jest.fn(async (url, opts) => {
            if (String(url).endsWith('/instances') && (!opts || opts.method !== 'POST')) {
                return new Response('[]'); // empty archive initially
            }
            if (String(url).endsWith('/instances') && opts?.method === 'POST') {
                const chunks = [];
                for await (const chunk of opts.body) chunks.push(chunk);
                postedInstances.push(Buffer.concat(chunks));
                return new Response('{"Status":"Success","ID":"orthanc-id-1"}');
            }
            if (String(url).endsWith('/instances/orthanc-id-1/file')) return new Response(dicomContent);
            return new Response('{}');
        });

        const result = await restorePacs(target, {
            connection: { url: 'http://test-orthanc:8042', username: 'u', password: 'p' }
        });

        expect(result.restored).toBe(1);
        expect(result.verified).toBe(true);
        expect(postedInstances).toHaveLength(1);
        expect(postedInstances[0].toString()).toBe('DICOM_DATA_FOR_RESTORE');
    });
    test('refuses to restore to non-empty Orthanc target when allowNonEmpty is false', async () => {
        const zip = new yazl.ZipFile();
        const dicomContent = Buffer.from('DICOM_DATA');
        zip.addBuffer(dicomContent, 'a001.dcm');
        const manifest = {
            format: 'viara-pacs-v1',
            instances: [{
                file: 'a001.dcm',
                sha256: crypto.createHash('sha256').update(dicomContent).digest('hex')
            }]
        };
        zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
        zip.end();
        const target = path.join(directory, 'valid-pacs-2.zip');
        await pipeline(zip.outputStream, createWriteStream(target));

        global.fetch = jest.fn(async (url, opts) => {
            if (String(url).endsWith('/instances') && (!opts || opts.method !== 'POST')) {
                return new Response('["existing-instance-123"]'); // non-empty archive
            }
            return new Response('{}');
        });

        await expect(restorePacs(target, {
            connection: { url: 'http://test-orthanc:8042', username: 'u', password: 'p' },
            allowNonEmpty: false
        })).rejects.toThrow('Recovery target must be a reachable, empty Orthanc archive');
    });
    test('permits restore to non-empty Orthanc target when allowNonEmpty is true', async () => {
        const zip = new yazl.ZipFile();
        const dicomContent = Buffer.from('DICOM_DATA');
        zip.addBuffer(dicomContent, 'a001.dcm');
        const manifest = {
            format: 'viara-pacs-v1',
            instances: [{
                file: 'a001.dcm',
                sha256: crypto.createHash('sha256').update(dicomContent).digest('hex')
            }]
        };
        zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
        zip.end();
        const target = path.join(directory, 'valid-pacs-3.zip');
        await pipeline(zip.outputStream, createWriteStream(target));

        global.fetch = jest.fn(async (url, opts) => {
            if (String(url).endsWith('/instances') && (!opts || opts.method !== 'POST')) {
                return new Response('["existing-instance-123"]');
            }
            if (String(url).endsWith('/instances') && opts?.method === 'POST') {
                for await (const _chunk of opts.body) { /* consume upload stream */ }
                return new Response('{"Status":"AlreadyStored","ID":"orthanc-id-1"}');
            }
            if (String(url).endsWith('/instances/orthanc-id-1/file')) return new Response(dicomContent);
            return new Response('{}');
        });

        const result = await restorePacs(target, {
            connection: { url: 'http://test-orthanc:8042', username: 'u', password: 'p' },
            allowNonEmpty: true
        });

        expect(result.restored).toBe(1);
        expect(result.verified).toBe(true);
    });
});
