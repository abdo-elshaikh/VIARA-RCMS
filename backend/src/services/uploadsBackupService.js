const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');
const yauzl = require('yauzl');

const getUploadsDir = () => path.resolve(
    process.env.UPLOADS_BACKUP_ROOT || process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads')
);

const getUploadsRoot = () => getUploadsDir();

const assertRestoreTarget = async (uploadsRoot = getUploadsRoot()) => {
    if (fs.existsSync(uploadsRoot)) {
        if ((await fsp.lstat(uploadsRoot)).isSymbolicLink() || (await fsp.readdir(uploadsRoot)).length) {
            throw new Error('Uploads restore target must be empty and must not be a symbolic link');
        }
    }
    let parent = path.resolve(uploadsRoot);
    while (path.dirname(parent) !== parent) {
        if (fs.existsSync(parent) && (await fsp.lstat(parent)).isSymbolicLink()) throw new Error('Uploads restore path contains a symbolic link');
        parent = path.dirname(parent);
    }
    return true;
};

const safeUploadPath = name => typeof name === 'string' && /^(documents|chat)\//.test(name)
    && !/[\\:\x00]/.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..');

const visitZip = (filename, visitor) => new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
        if (error) return reject(error);
        const fail = (err) => { zip.close(); reject(err); };
        zip.on('error', fail);
        zip.on('end', resolve);
        zip.on('entry', (entry) => {
            if (entry.fileName.endsWith('/')) return zip.readEntry();
            zip.openReadStream(entry, (err, stream) => {
                if (err) return fail(err);
                Promise.resolve(visitor(entry, stream)).then(() => zip.readEntry(), fail);
            });
        });
        zip.readEntry();
    });
});

const collectUploadFiles = async (uploadsDir) => {
    const targets = ['documents', 'chat'];
    const collected = [];
    if (fs.existsSync(uploadsDir) && (await fsp.lstat(uploadsDir)).isSymbolicLink()) throw new Error('Uploads root must not be a symbolic link');

    for (const sub of targets) {
        const subDir = path.join(uploadsDir, sub);
        try {
            const stat = await fsp.lstat(subDir);
            if (stat.isSymbolicLink()) throw new Error('Uploads source contains a symbolic link');
            if (!stat.isDirectory()) continue;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            continue;
        }

        const scan = async (dir, relativePrefix) => {
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
                const fullPath = path.join(dir, entry.name);
                const relPath = path.join(relativePrefix, entry.name).replace(/\\/g, '/');
                if (entry.isSymbolicLink() || !safeUploadPath(relPath)) throw new Error('Unsupported uploads backup path');
                if (entry.isDirectory()) {
                    await scan(fullPath, relPath);
                } else if (entry.isFile()) {
                    collected.push({ fullPath, relPath });
                }
            }
        };

        await scan(subDir, sub);
    }

    return collected.sort((a, b) => a.relPath.localeCompare(b.relPath));
};

const verifyUploadsZip = async (filename) => {
    const hashes = new Map();
    let manifest = null;

    await visitZip(filename, async (entry, stream) => {
        if (entry.fileName === 'manifest.json') {
            if (manifest) throw new Error('Duplicate uploads backup manifest');
            if (entry.uncompressedSize > 32 * 1024 * 1024) throw new Error('Uploads backup manifest is too large');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } else {
            if (!safeUploadPath(entry.fileName) || (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)) throw new Error('Unsafe uploads archive entry');
            if (hashes.has(entry.fileName)) throw new Error(`Duplicate uploads entry: ${entry.fileName}`);
            const hash = crypto.createHash('sha256');
            for await (const chunk of stream) hash.update(chunk);
            hashes.set(entry.fileName, hash.digest('hex'));
        }
    });

    if (!manifest || manifest.format !== 'viara-uploads-v1' || !Array.isArray(manifest.files)) {
        throw new Error('Invalid uploads backup manifest');
    }
    if (manifest.files.length !== hashes.size) {
        throw new Error(`Uploads backup file count mismatch (manifest: ${manifest.files.length}, zip: ${hashes.size})`);
    }

    const expected = new Set();
    for (const item of manifest.files) {
        if (!item || !safeUploadPath(item.file) || expected.has(item.file)) throw new Error('Invalid uploads manifest file entry');
        expected.add(item.file);
        if (hashes.get(item.file) !== item.sha256) {
            throw new Error(`Uploads checksum mismatch for ${item.file}`);
        }
    }

    return manifest;
};

const snapshotUploads = async (destination, options = {}) => {
    const uploadsDir = typeof options === 'string' ? options : (options.uploadsDir || getUploadsDir());
    const files = await collectUploadFiles(uploadsDir);
    const manifest = { format: 'viara-uploads-v1', createdAt: new Date().toISOString(), files: [] };
    const zip = new yazl.ZipFile();
    zip.on('error', (err) => zip.outputStream.destroy(err));

    for (const file of files) {
        zip.addReadStreamLazy(file.relPath, { compress: true, mode: 0o100600 }, (callback) => {
            const hash = crypto.createHash('sha256');
            const meter = new Transform({
                transform(chunk, encoding, done) {
                    hash.update(chunk);
                    done(null, chunk);
                }
            });
            meter.on('end', () => {
                manifest.files.push({ file: file.relPath, sha256: hash.digest('hex') });
            });
            const source = fs.createReadStream(file.fullPath);
            source.on('error', (err) => meter.destroy(err));
            callback(null, source.pipe(meter));
        });
    }

    zip.addReadStreamLazy('manifest.json', (callback) => {
        callback(null, Readable.from([JSON.stringify(manifest, null, 2)]));
    });
    zip.end({ forceZip64Format: true });

    await pipeline(zip.outputStream, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    await verifyUploadsZip(destination);

    const verifyUnchanged = async () => {
        const currentFiles = await collectUploadFiles(uploadsDir);
        if (currentFiles.length !== files.length) {
            throw new Error('Uploads changed during backup; retry in a maintenance window');
        }
    };

    return { manifest, fileCount: manifest.files.length, verifyUnchanged };
};

const restoreUploads = async (zipPath, target) => {
    const uploadsDir = typeof target === 'string' ? target : (target?.uploadsDir || getUploadsDir());
    const manifest = await verifyUploadsZip(zipPath);
    const manifestEntries = new Map(manifest.files.map((f) => [f.file, f]));
    let restored = 0;
    await assertRestoreTarget(uploadsDir);

    await visitZip(zipPath, async (entry, stream) => {
        if (entry.fileName === 'manifest.json') { stream.resume(); return; }
        const expected = manifestEntries.get(entry.fileName);
        if (!expected) throw new Error(`Uploads backup manifest is missing ${entry.fileName}`);

        // Prevent path traversal
        const normalized = path.normalize(entry.fileName);
        if (!normalized.startsWith('documents/') && !normalized.startsWith('documents\\') &&
            !normalized.startsWith('chat/') && !normalized.startsWith('chat\\')) {
            throw new Error(`Untrusted relative path in uploads backup: ${entry.fileName}`);
        }

        const targetPath = path.resolve(uploadsDir, normalized);
        if (!targetPath.startsWith(path.resolve(uploadsDir) + path.sep)) {
            throw new Error(`Path traversal blocked for uploads restore: ${entry.fileName}`);
        }

        await fsp.mkdir(path.dirname(targetPath), { recursive: true });
        const hash = crypto.createHash('sha256');
        const meter = new Transform({
            transform(chunk, encoding, done) {
                hash.update(chunk);
                done(null, chunk);
            }
        });

        await pipeline(stream, meter, fs.createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }));

        if (hash.digest('hex') !== expected.sha256) {
            throw new Error(`Uploads restore checksum mismatch for ${entry.fileName}`);
        }
        restored += 1;
    });

    return { restored, fileCount: manifest.files.length, verified: true };
};

module.exports = {
    getUploadsDir,
    getUploadsRoot,
    assertRestoreTarget,
    collectUploadFiles,
    snapshotUploads,
    verifyUploadsZip,
    restoreUploads,
    visitZip
};
