const fs = require('fs');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');
const yauzl = require('yauzl');
const { getOrthancConnection } = require('./orthancConnectionService');

const visitZip = (filename, visitor) => new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
        if (error) return reject(error);
        const fail = error => { zip.close(); reject(error); };
        zip.on('error', fail);
        zip.on('end', resolve);
        zip.on('entry', entry => {
            if (entry.fileName.endsWith('/')) return zip.readEntry();
            zip.openReadStream(entry, (error, stream) => {
                if (error) return fail(error);
                Promise.resolve(visitor(entry, stream)).then(() => zip.readEntry(), fail);
            });
        });
        zip.readEntry();
    });
});

const verifyPacsZip = async (filename) => {
    const hashes = new Map();
    let manifest;
    await visitZip(filename, async (entry, stream) => {
        if (entry.fileName === 'manifest.json') {
            if (manifest) throw new Error('Duplicate PACS backup manifest');
            if (entry.uncompressedSize > 32 * 1024 * 1024) throw new Error('PACS backup manifest is too large');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            manifest = JSON.parse(Buffer.concat(chunks));
        } else if (/^[a-f0-9-]+\.dcm$/.test(entry.fileName)) {
            if (hashes.has(entry.fileName)) throw new Error('Duplicate DICOM backup entry');
            const hash = crypto.createHash('sha256');
            for await (const chunk of stream) hash.update(chunk);
            hashes.set(entry.fileName, hash.digest('hex'));
        } else throw new Error('Unexpected PACS backup entry');
    });
    if (manifest?.format !== 'viara-pacs-v1' || !Array.isArray(manifest.instances) || manifest.instances.length !== hashes.size) throw new Error('Incomplete PACS backup');
    const expected = new Set();
    for (const entry of manifest.instances) {
        if (!entry || expected.has(entry.file)) throw new Error('Duplicate PACS manifest instance');
        expected.add(entry.file);
        if (hashes.get(entry.file) !== entry.sha256) throw new Error('PACS backup checksum mismatch');
    }
    return manifest;
};

const snapshotPacs = async (destination, { connection } = {}) => {
    const { url, username, password } = connection || await getOrthancConnection();
    const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') };
    const list = async () => {
        const response = await fetch(`${url}/instances`, { headers, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`PACS backup lookup failed (${response.status})`);
        return (await response.json()).sort();
    };
    const sourceInstances = await list();
    const manifest = { format: 'viara-pacs-v1', createdAt: new Date().toISOString(), instances: [] };
    const zip = new yazl.ZipFile();
    zip.on('error', error => zip.outputStream.destroy(error));
    for (const id of sourceInstances) {
        if (!/^[a-f0-9-]+$/.test(id)) throw new Error('Invalid PACS archive identifier');
        zip.addReadStreamLazy(`${id}.dcm`, { compress: false, mode: 0o100600 }, callback => {
            fetch(`${url}/instances/${id}/file`, { headers, signal: AbortSignal.timeout(120000) })
                .then(response => {
                    if (!response.ok || !response.body) throw new Error(`PACS instance backup failed (${response.status})`);
                    const hash = crypto.createHash('sha256');
                    const meter = new Transform({ transform(chunk, encoding, done) { hash.update(chunk); done(null, chunk); } });
                    meter.on('end', () => manifest.instances.push({ file: `${id}.dcm`, sha256: hash.digest('hex') }));
                    const source = Readable.fromWeb(response.body);
                    source.on('error', error => meter.destroy(error));
                    callback(null, source.pipe(meter));
                }).catch(callback);
        });
    }
    zip.addReadStreamLazy('manifest.json', callback => callback(null, Readable.from([JSON.stringify(manifest)])));
    zip.end({ forceZip64Format: true });
    await pipeline(zip.outputStream, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    await verifyPacsZip(destination);
    const verifyUnchanged = async () => {
        if (JSON.stringify(await list()) !== JSON.stringify(sourceInstances)) throw new Error('PACS changed during backup; retry in a maintenance window');
    };
    await verifyUnchanged();
    return { manifest, verifyUnchanged };
};

const restorePacs = async (zipPath, { connection, allowNonEmpty = false } = {}) => {
    const manifest = await verifyPacsZip(zipPath);
    const { url, username, password } = connection || await getOrthancConnection();
    const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') };
    const check = await fetch(url.replace(/\/$/, '') + '/instances', { headers, signal: AbortSignal.timeout(30000) });
    if (!check.ok) throw new Error(`PACS connection failed (${check.status})`);
    const initialInstances = await check.json();
    if (!allowNonEmpty && initialInstances.length !== 0) {
        throw new Error('Recovery target must be a reachable, empty Orthanc archive');
    }
    let restored = 0;
    await visitZip(zipPath, async (entry, stream) => {
        if (entry.fileName === 'manifest.json' || !/^[a-f0-9-]+\.dcm$/.test(entry.fileName)) return;
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const response = await fetch(url.replace(/\/$/, '') + '/instances', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/dicom' },
            body: Buffer.concat(chunks),
            signal: AbortSignal.timeout(120000)
        });
        if (!response.ok) throw new Error(`PACS restore failed (${response.status}) for ${entry.fileName}`);
        await response.json();
        restored += 1;
    });
    return { restored, instance_count: manifest.instances.length, verified: true };
};

module.exports = { snapshotPacs, verifyPacsZip, visitZip, restorePacs };
