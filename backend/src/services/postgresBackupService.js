const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_BACKUPS = 30;

const positiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getBackupDir = () => path.resolve(
    process.env.BACKUP_DIR || path.join(__dirname, '../../backups')
);

const getBackupMode = () => (
    process.env.BACKUP_MODE || (process.env.NODE_ENV === 'production' ? 'postgres' : 'json')
).toLowerCase();

const isValidBackupFilename = (filename) => (
    typeof filename === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(json|dump|dump\.enc|pacs\.zip|pacs\.zip\.enc|uploads\.zip\.enc)$/.test(filename)
);

const MAGIC = Buffer.from('VIARABKP2');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;

const getBackupEncryptionKey = () => {
    const configuredKey = process.env.BACKUP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!/^[0-9a-fA-F]{64}$/.test(configuredKey || '')) {
        throw new Error('BACKUP_ENCRYPTION_KEY or ENCRYPTION_KEY must be a 64-character hex value');
    }
    return Buffer.from(configuredKey, 'hex');
};

const encryptBackup = async (sourcePath, destinationPath) => {
    const key = getBackupEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    await fsp.writeFile(destinationPath, Buffer.concat([MAGIC, iv]), { mode: 0o600 });
    await pipeline(
        fs.createReadStream(sourcePath),
        cipher,
        fs.createWriteStream(destinationPath, { flags: 'a', mode: 0o600 })
    );
    await fsp.appendFile(destinationPath, cipher.getAuthTag());
};

const decryptBackup = async (sourcePath, destinationPath) => {
    const key = getBackupEncryptionKey();
    const stat = await fsp.stat(sourcePath);
    if (stat.size <= HEADER_LENGTH + TAG_LENGTH) {
        throw new Error('Encrypted backup is too small or truncated');
    }

    const fd = await fsp.open(sourcePath, 'r');
    try {
        const header = Buffer.alloc(HEADER_LENGTH);
        await fd.read(header, 0, HEADER_LENGTH, 0);
        if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
            throw new Error('Unsupported encrypted backup format');
        }

        const tag = Buffer.alloc(TAG_LENGTH);
        await fd.read(tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH);

        const iv = header.subarray(MAGIC.length);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        await pipeline(
            fs.createReadStream(sourcePath, { start: HEADER_LENGTH, end: stat.size - TAG_LENGTH - 1 }),
            decipher,
            fs.createWriteStream(destinationPath, { mode: 0o600 })
        );
    } catch (error) {
        if (fs.existsSync(destinationPath)) await fsp.unlink(destinationPath);
        throw error;
    } finally {
        await fd.close();
    }
};

const computeFileChecksum = async (filepath) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filepath);
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    return hash.digest('hex');
};

const resolveBackupPath = (filename) => {
    if (!isValidBackupFilename(filename)) return null;
    const backupDir = getBackupDir();
    const resolved = path.resolve(backupDir, filename);
    const relative = path.relative(backupDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return resolved;
};

const ensureBackupDir = async () => {
    const backupDir = getBackupDir();
    await fsp.mkdir(backupDir, { recursive: true, mode: 0o700 });
    try {
        await fsp.chmod(backupDir, 0o700);
    } catch {
        // Some mounted filesystems do not support POSIX permissions.
    }
    return backupDir;
};

const buildPgEnvironment = (databaseUrl = process.env.DATABASE_URL) => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL backups');

    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
    }

    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!database) throw new Error('DATABASE_URL must include a database name');

    const environment = {
        ...process.env,
        PGHOST: parsed.hostname,
        PGPORT: parsed.port || '5432',
        PGUSER: decodeURIComponent(parsed.username),
        PGDATABASE: database
    };

    if (parsed.password) environment.PGPASSWORD = decodeURIComponent(parsed.password);
    const sslMode = parsed.searchParams.get('sslmode');
    if (sslMode) environment.PGSSLMODE = sslMode;

    return environment;
};

const runProcess = (command, args, environment) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';

    child.stderr.on('data', chunk => {
        if (stderr.length < 20000) stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', code => {
        if (code === 0) return resolve();
        reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr.trim() || 'unknown error'}`));
    });
});

const listBackupFiles = async () => {
    const backupDir = await ensureBackupDir();
    const entries = await fsp.readdir(backupDir, { withFileTypes: true });
    const backups = [];

    for (const entry of entries) {
        if (!entry.isFile() || !isValidBackupFilename(entry.name)) continue;
        const stat = await fsp.stat(path.join(backupDir, entry.name));
        backups.push({
            filename: entry.name,
            created_at: stat.mtime,
            size_bytes: stat.size,
            type: entry.name.endsWith('.pacs.zip.enc') ? 'PACS images (encrypted)' : entry.name.endsWith('.pacs.zip') ? 'PACS images' : entry.name.endsWith('.dump.enc') ? 'PostgreSQL (encrypted)'
                : entry.name.endsWith('.dump') ? 'PostgreSQL' : 'JSON'
        });
    }

    return backups.sort((a, b) => b.created_at - a.created_at);
};

const cleanupBackups = async () => {
    const retentionDays = positiveInteger(process.env.BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
    const maxBackups = positiveInteger(process.env.BACKUP_MAX_FILES, DEFAULT_MAX_BACKUPS);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const backups = await listBackupFiles();
    const deleted = [];
    const groups = new Map();

    for (let index = 0; index < backups.length; index += 1) {
        const backup = backups[index];
        const key = backup.filename.replace(/\.(?:dump(?:\.enc)?|json|pacs\.zip(?:\.enc)?|uploads\.zip\.enc)$/, '');
        if (!groups.has(key)) groups.set(key, groups.size);
        if (groups.get(key) >= maxBackups || backup.created_at.getTime() < cutoff) {
            const filepath = resolveBackupPath(backup.filename);
            if (filepath) {
                await fsp.unlink(filepath);
                deleted.push(backup.filename);
            }
        }
    }

    return deleted;
};

const createPostgresBackup = async () => {
    const backupDir = await ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const filename = `VIARA_pg_${timestamp}_${crypto.randomUUID()}.dump.enc`;
    const filepath = path.join(backupDir, filename);
    const temporaryPath = filepath.replace(/\.dump\.enc$/, '.dump.tmp');
    const encryptedTemporaryPath = `${filepath}.tmp`;
    const environment = buildPgEnvironment();
    const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';
    const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';

    let pacs;
    let uploads;
    try {
        uploads = await createUploadsCompanion({ filename, filepath });
        pacs = await createPacsCompanion({ filename, filepath });
        await runProcess(pgDump, [
            '--format=custom',
            '--no-owner',
            '--no-privileges',
            `--file=${temporaryPath}`
        ], environment);
        await runProcess(pgRestore, ['--list', temporaryPath], environment);
        await pacs?.verifyUnchanged?.();
        await uploads?.verifyUnchanged?.();
        await encryptBackup(temporaryPath, encryptedTemporaryPath);
        await fsp.unlink(temporaryPath);
        await fsp.rename(encryptedTemporaryPath, filepath);
        try {
            await fsp.chmod(filepath, 0o600);
        } catch {
            // Some mounted filesystems do not support POSIX permissions.
        }
        await cleanupBackups();

        const stat = await fsp.stat(filepath);
        const dicomStorage = await getDicomStorageStatus();
        const checksum = await computeFileChecksum(filepath);
        const companions = [
            ...(uploads ? [uploads.backup] : []),
            ...(pacs ? [pacs.backup] : [])
        ];
        const scope = (uploads && pacs)
            ? 'database-pacs-and-uploads'
            : uploads
                ? 'database-and-uploads'
                : pacs
                    ? 'database-and-pacs'
                    : 'database-only';
        return {
            filename,
            filepath,
            size_bytes: stat.size,
            checksum,
            created_at: stat.mtime,
            type: 'PostgreSQL',
            verified: true,
            scope,
            companions,
            dicom_storage: dicomStorage
        };
    } catch (error) {
        if (fs.existsSync(temporaryPath)) await fsp.unlink(temporaryPath);
        if (fs.existsSync(encryptedTemporaryPath)) await fsp.unlink(encryptedTemporaryPath);
        if (pacs?.backup?.filepath) await fsp.unlink(pacs.backup.filepath).catch(() => {});
        if (uploads?.backup?.filepath) await fsp.unlink(uploads.backup.filepath).catch(() => {});
        throw error;
    }
};

const createUploadsCompanion = async (backup) => {
    const enabled = process.env.UPLOADS_BACKUP_ENABLED ?? (process.env.NODE_ENV === 'test' ? 'false' : 'true');
    if (enabled !== 'true') return null;
    const filename = backup.filename.replace(/\.dump(?:\.enc)?$/, '.uploads.zip.enc');
    const filepath = path.join(path.dirname(backup.filepath), filename);
    const temporary = filepath + '.partial.zip';
    const encrypted = filepath + '.partial';
    try {
        const snapshot = await require('./uploadsBackupService').snapshotUploads(temporary);
        await encryptBackup(temporary, encrypted);
        await fsp.rename(encrypted, filepath);
        return { verifyUnchanged: snapshot.verifyUnchanged, backup: { filename, filepath,
            checksum: await computeFileChecksum(filepath), file_count: snapshot.manifest.files.length,
            size_bytes: (await fsp.stat(filepath)).size, type: 'Uploads (encrypted)', verified: true } };
    } finally {
        await fsp.unlink(temporary).catch(() => {});
        await fsp.unlink(encrypted).catch(() => {});
    }
};

const createPacsCompanion = async (backup) => {
    const enabled = process.env.PACS_BACKUP_ENABLED ?? (process.env.NODE_ENV === 'test' ? 'false' : 'true');
    if (enabled !== 'true') return null;
    const filename = backup.filename.replace(/\.(?:json|dump(?:\.enc)?)$/, '.pacs.zip.enc');
    const filepath = path.join(path.dirname(backup.filepath), filename);
    const temporary = filepath + '.partial.zip';
    const encrypted = filepath + '.partial';
    try {
        const snapshot = await require('./pacsBackupService').snapshotPacs(temporary);
        await encryptBackup(temporary, encrypted);
        await fsp.rename(encrypted, filepath);
        return { verifyUnchanged: snapshot.verifyUnchanged, backup: { filename, filepath,
            checksum: await computeFileChecksum(filepath), instance_count: snapshot.manifest.instances.length,
            size_bytes: (await fsp.stat(filepath)).size, type: 'PACS', verified: true } };
    } finally {
        await fsp.unlink(temporary).catch(() => {});
        await fsp.unlink(encrypted).catch(() => {});
    }
};

const getDicomStorageStatus = async () => {
    const dicomDir = path.resolve(
        process.env.ORTHANC_STORAGE_DIR || process.env.DICOM_STORAGE_DIR || '/var/lib/orthanc/db'
    );
    try {
        const exists = fs.existsSync(dicomDir);
        if (!exists) {
            return { configured_path: dicomDir, accessible: false, file_count: 0, total_size_bytes: 0 };
        }
        let totalSize = 0;
        let count = 0;

        const scanDirectory = async (dir, depth = 0) => {
            if (depth > 4) return;
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isFile()) {
                    try {
                        const stat = await fsp.stat(fullPath);
                        totalSize += stat.size;
                        count += 1;
                    } catch {
                        // skip unreadable file
                    }
                } else if (entry.isDirectory()) {
                    await scanDirectory(fullPath, depth + 1);
                }
            }
        };

        await scanDirectory(dicomDir);
        return {
            configured_path: dicomDir,
            accessible: true,
            file_count: count,
            total_size_bytes: totalSize
        };
    } catch (e) {
        return { configured_path: dicomDir, accessible: false, error: e.message, file_count: 0, total_size_bytes: 0 };
    }
};

const restorePostgresBackup = async (filename, options = {}) => {
    if (!filename || !isValidBackupFilename(filename)) {
        throw new Error('Valid backup filename is required');
    }
    const filepath = resolveBackupPath(filename);
    if (!filepath || !fs.existsSync(filepath)) {
        throw new Error(`Backup file not found: ${filename}`);
    }

    const isEncrypted = filename.endsWith('.dump.enc');
    const isDump = filename.endsWith('.dump') || isEncrypted;
    if (!isDump) {
        throw new Error('PostgreSQL restore only supports .dump and .dump.enc archives');
    }

    const environment = buildPgEnvironment(options.databaseUrl);
    const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';
    const runner = options.runProcess || runProcess;
    const backupDir = getBackupDir();
    const tempDecryptedPath = path.join(backupDir, `${filename}.${crypto.randomUUID()}.restore.tmp`);
    let pathToRestore = filepath;
    let companionDecrypted = null;
    let uploadsDecrypted = null;

    try {
        if (isEncrypted) {
            await decryptBackup(filepath, tempDecryptedPath);
            pathToRestore = tempDecryptedPath;
        }

        // 1. Verify PostgreSQL archive structure
        await runner(pgRestore, ['--list', pathToRestore], environment);

        // 2. Pre-verify companion PACS archive if present
        const companionEnc = filepath.replace(/\.dump(?:\.enc)?$/, '.pacs.zip.enc');
        const companionRaw = filepath.replace(/\.dump(?:\.enc)?$/, '.pacs.zip');
        let pacsResult = null;

        const hasCompanionEnc = fs.existsSync(companionEnc);
        const hasCompanionRaw = fs.existsSync(companionRaw);

        let pacsZipToVerify = null;
        let manifest = null;
        const pacsBackupService = require('./pacsBackupService');

        if ((hasCompanionEnc || hasCompanionRaw) && options.restorePacs !== false) {
            const companionPath = hasCompanionEnc ? companionEnc : companionRaw;
            pacsZipToVerify = companionPath;
            if (hasCompanionEnc) {
                companionDecrypted = path.join(backupDir, `companion.${crypto.randomUUID()}.pacs.zip`);
                await decryptBackup(companionPath, companionDecrypted);
                pacsZipToVerify = companionDecrypted;
            }
            manifest = await pacsBackupService.verifyPacsZip(pacsZipToVerify);
        }

        const uploadsPath = filepath.replace(/\.dump(?:\.enc)?$/, '.uploads.zip.enc');
        const uploadsService = require('./uploadsBackupService');
        let uploadsManifest = null;
        const uploadsRoot = options.uploadsRoot || uploadsService.getUploadsRoot();
        if (fs.existsSync(uploadsPath)) {
            uploadsDecrypted = path.join(backupDir, `uploads.${crypto.randomUUID()}.zip`);
            await decryptBackup(uploadsPath, uploadsDecrypted);
            uploadsManifest = await uploadsService.verifyUploadsZip(uploadsDecrypted);
            if (!options.verifyOnly) await uploadsService.assertRestoreTarget(uploadsRoot);
        } else if (options.requireUploads === true) throw new Error('Required uploads companion is missing');

        // 3. If not verifyOnly, execute pg_restore against target database FIRST
        if (!options.verifyOnly) {
            const cleanArgs = options.clean !== false ? ['--clean', '--if-exists'] : [];
            const restoreArgs = [
                '--no-owner',
                '--no-privileges',
                ...cleanArgs,
                '-d',
                environment.PGDATABASE,
                pathToRestore
            ];
            await runner(pgRestore, restoreArgs, environment);
            if (uploadsDecrypted) await uploadsService.restoreUploads(uploadsDecrypted, uploadsRoot);

            // 4. On successful database restore, proceed to restore PACS DICOM instances
            if ((hasCompanionEnc || hasCompanionRaw) && options.restorePacs !== false) {
                const orthancUrl = options.orthancUrl || process.env.ORTHANC_URL || 'http://orthanc:8042';
                const orthancUser = options.orthancUser || process.env.PACS_RESTORE_USERNAME || process.env.ORTHANC_USERNAME || 'orthanc';
                const orthancPass = options.orthancPassword || process.env.PACS_RESTORE_PASSWORD || process.env.ORTHANC_PASSWORD || 'orthanc';

                if (hasCompanionEnc) {
                    const { restorePacsBackup } = require('../../scripts/restorePacsBackup');
                    pacsResult = await restorePacsBackup({
                        file: companionEnc,
                        target: orthancUrl,
                        username: orthancUser,
                        password: orthancPass,
                        allowNonEmpty: Boolean(options.allowNonEmptyPacs)
                    });
                } else {
                    pacsResult = await pacsBackupService.restorePacs(companionRaw, {
                        connection: { url: orthancUrl, username: orthancUser, password: orthancPass },
                        allowNonEmpty: Boolean(options.allowNonEmptyPacs)
                    });
                }
            }
        } else if (manifest) {
            pacsResult = { verified: true, instance_count: manifest.instances.length };
        }

        return {
            filename,
            verified: true,
            dry_run: Boolean(options.verifyOnly),
            restored_at: new Date().toISOString(),
            pacs: pacsResult,
            uploads: uploadsManifest ? { verified: true, restored: !options.verifyOnly, file_count: uploadsManifest.files.length } : { verified: false, reason: 'legacy-backup-without-uploads' }
        };
    } finally {
        if (fs.existsSync(tempDecryptedPath)) {
            await fsp.unlink(tempDecryptedPath).catch(() => {});
        }
        if (companionDecrypted && fs.existsSync(companionDecrypted)) {
            await fsp.unlink(companionDecrypted).catch(() => {});
        }
        if (uploadsDecrypted) await fsp.unlink(uploadsDecrypted).catch(() => {});
    }
};

module.exports = {
    buildPgEnvironment,
    cleanupBackups,
    computeFileChecksum,
    createPostgresBackup,
    createPacsCompanion,
    createUploadsCompanion,
    decryptBackup,
    encryptBackup,
    ensureBackupDir,
    getBackupDir,
    getBackupMode,
    getDicomStorageStatus,
    isValidBackupFilename,
    listBackupFiles,
    resolveBackupPath,
    restorePostgresBackup
};
