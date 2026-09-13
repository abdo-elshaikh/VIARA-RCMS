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
    typeof filename === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(json|dump|dump\.enc)$/.test(filename)
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
            type: entry.name.endsWith('.dump.enc') ? 'PostgreSQL (encrypted)'
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

    for (let index = 0; index < backups.length; index += 1) {
        const backup = backups[index];
        if (index >= maxBackups || backup.created_at.getTime() < cutoff) {
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
    const filename = `VIARA_pg_${timestamp}.dump.enc`;
    const filepath = path.join(backupDir, filename);
    const temporaryPath = path.join(backupDir, `VIARA_pg_${timestamp}.dump.tmp`);
    const encryptedTemporaryPath = `${filepath}.tmp`;
    const environment = buildPgEnvironment();
    const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';
    const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';

    try {
        await runProcess(pgDump, [
            '--format=custom',
            '--no-owner',
            '--no-privileges',
            `--file=${temporaryPath}`
        ], environment);
        await runProcess(pgRestore, ['--list', temporaryPath], environment);
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
        return {
            filename,
            filepath,
            size_bytes: stat.size,
            checksum,
            created_at: stat.mtime,
            type: 'PostgreSQL',
            verified: true,
            dicom_storage: dicomStorage
        };
    } catch (error) {
        if (fs.existsSync(temporaryPath)) await fsp.unlink(temporaryPath);
        if (fs.existsSync(encryptedTemporaryPath)) await fsp.unlink(encryptedTemporaryPath);
        throw error;
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

module.exports = {
    buildPgEnvironment,
    cleanupBackups,
    computeFileChecksum,
    createPostgresBackup,
    decryptBackup,
    encryptBackup,
    ensureBackupDir,
    getBackupDir,
    getBackupMode,
    getDicomStorageStatus,
    isValidBackupFilename,
    listBackupFiles,
    resolveBackupPath
};
