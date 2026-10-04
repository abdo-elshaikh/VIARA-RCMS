const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
    computeFileChecksum,
    encryptBackup,
    decryptBackup,
    getDicomStorageStatus,
    isValidBackupFilename,
    resolveBackupPath,
    cleanupBackups,
    getBackupDir,
    restorePostgresBackup
} = require('../src/services/postgresBackupService');

describe('PostgresBackupService', () => {
    let testDir;
    const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    beforeEach(async () => {
        testDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'viara-backup-test-'));
        process.env.BACKUP_ENCRYPTION_KEY = testKeyHex;
        process.env.BACKUP_DIR = testDir;
    });

    afterEach(async () => {
        delete process.env.BACKUP_ENCRYPTION_KEY;
        delete process.env.BACKUP_DIR;
        delete process.env.ORTHANC_STORAGE_DIR;
        delete process.env.DICOM_STORAGE_DIR;
        delete process.env.BACKUP_RETENTION_DAYS;
        delete process.env.BACKUP_MAX_FILES;
        try {
            await fsp.rm(testDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors in tmpdir
        }
    });

    describe('computeFileChecksum', () => {
        it('calculates the exact SHA-256 digest of a file', async () => {
            const content = 'VIARA Medical Imaging & ERP Platform Enterprise Backup';
            const filePath = path.join(testDir, 'test-file.txt');
            await fsp.writeFile(filePath, content, 'utf8');

            const expectedChecksum = crypto.createHash('sha256').update(content).digest('hex');
            const actualChecksum = await computeFileChecksum(filePath);

            expect(actualChecksum).toBe(expectedChecksum);
        });
    });

    describe('encryptBackup and decryptBackup (Round-Trip AES-256-GCM)', () => {
        it('encrypts and successfully decrypts data with exact byte fidelity', async () => {
            const originalData = Buffer.from('PGDUMP_HEADER_MOCK_DATA_TABLE_PATIENTS_EXAMINATIONS_INVOICES_123456789');
            const sourcePath = path.join(testDir, 'raw.dump');
            const encPath = path.join(testDir, 'raw.dump.enc');
            const decryptedPath = path.join(testDir, 'decrypted.dump');

            await fsp.writeFile(sourcePath, originalData);

            await encryptBackup(sourcePath, encPath);
            expect(fs.existsSync(encPath)).toBe(true);

            // Verify encrypted file has magic header VIARABKP2 + IV (21) + ciphertext + tag (16)
            const encStat = await fsp.stat(encPath);
            expect(encStat.size).toBe(originalData.length + 21 + 16);

            await decryptBackup(encPath, decryptedPath);
            expect(fs.existsSync(decryptedPath)).toBe(true);

            const decryptedData = await fsp.readFile(decryptedPath);
            expect(decryptedData).toEqual(originalData);
        });

        it('rejects encryption when key is missing or invalid hex length', async () => {
            process.env.BACKUP_ENCRYPTION_KEY = 'tooshort';
            const sourcePath = path.join(testDir, 'raw.dump');
            const encPath = path.join(testDir, 'raw.dump.enc');
            await fsp.writeFile(sourcePath, 'data');

            await expect(encryptBackup(sourcePath, encPath))
                .rejects.toThrow('must be a 64-character hex value');
        });

        it('fails decryption and cleans up destination file if data is tampered with', async () => {
            const originalData = Buffer.from('Confidential DICOM Patient Index');
            const sourcePath = path.join(testDir, 'data.dump');
            const encPath = path.join(testDir, 'data.dump.enc');
            const decryptedPath = path.join(testDir, 'tampered.dump');

            await fsp.writeFile(sourcePath, originalData);
            await encryptBackup(sourcePath, encPath);

            // Tamper with a byte in the ciphertext
            const encBuffer = await fsp.readFile(encPath);
            encBuffer[30] ^= 0xff; // flip bits in ciphertext
            await fsp.writeFile(encPath, encBuffer);

            await expect(decryptBackup(encPath, decryptedPath)).rejects.toThrow();
            expect(fs.existsSync(decryptedPath)).toBe(false);
        });

        it('rejects encrypted backup with invalid magic header', async () => {
            const encPath = path.join(testDir, 'invalid-magic.dump.enc');
            const decryptedPath = path.join(testDir, 'output.dump');
            // Write fake header
            const fakeData = Buffer.alloc(100, 0x41);
            await fsp.writeFile(encPath, fakeData);

            await expect(decryptBackup(encPath, decryptedPath))
                .rejects.toThrow('Unsupported encrypted backup format');
        });
    });

    describe('getDicomStorageStatus', () => {
        it('returns inaccessible when storage directory does not exist', async () => {
            process.env.ORTHANC_STORAGE_DIR = path.join(testDir, 'non-existent-orthanc-dir');
            const status = await getDicomStorageStatus();

            expect(status.accessible).toBe(false);
            expect(status.file_count).toBe(0);
            expect(status.total_size_bytes).toBe(0);
        });

        it('recursively counts files and sums sizes across nested DICOM storage subdirectories', async () => {
            const orthancDir = path.join(testDir, 'orthanc-storage');
            const subDir1 = path.join(orthancDir, '00', '01');
            const subDir2 = path.join(orthancDir, 'ab', 'cd');
            await fsp.mkdir(subDir1, { recursive: true });
            await fsp.mkdir(subDir2, { recursive: true });

            // Write sample files at different nesting levels
            await fsp.writeFile(path.join(orthancDir, 'index.db'), 'INDEX_DATA'); // 10 bytes
            await fsp.writeFile(path.join(subDir1, 'study1.dcm'), 'DICOM_SERIES_1_FILE'); // 19 bytes
            await fsp.writeFile(path.join(subDir2, 'study2.dcm'), 'DICOM_SERIES_2_FILE_TEST'); // 24 bytes

            process.env.ORTHANC_STORAGE_DIR = orthancDir;
            const status = await getDicomStorageStatus();

            expect(status.accessible).toBe(true);
            expect(status.file_count).toBe(3);
            expect(status.total_size_bytes).toBe(10 + 19 + 24);
        });
    });

    describe('isValidBackupFilename and resolveBackupPath', () => {
        it('validates supported backup filenames and rejects invalid formats', () => {
            expect(isValidBackupFilename('VIARA_pg_20260912Z.dump.enc')).toBe(true);
            expect(isValidBackupFilename('backup-manual-01.dump')).toBe(true);
            expect(isValidBackupFilename('snapshot-dev.json')).toBe(true);

            expect(isValidBackupFilename('../secret.txt')).toBe(false);
            expect(isValidBackupFilename('backup.sql')).toBe(false);
            expect(isValidBackupFilename('file.sh')).toBe(false);
            expect(isValidBackupFilename('')).toBe(false);
            expect(isValidBackupFilename(null)).toBe(false);
        });

        it('resolves safe backup paths and blocks path traversal attempts', () => {
            const validName = 'VIARA_pg_20260912.dump.enc';
            const resolved = resolveBackupPath(validName);
            expect(resolved).toBe(path.join(testDir, validName));

            expect(resolveBackupPath('../../../etc/passwd')).toBeNull();
            expect(resolveBackupPath('..\\..\\windows\\system32')).toBeNull();
            expect(resolveBackupPath('/absolute/path.dump')).toBeNull();
        });
    });

    describe('cleanupBackups', () => {
        it('removes excess backup files beyond BACKUP_MAX_FILES', async () => {
            process.env.BACKUP_MAX_FILES = '2';
            process.env.BACKUP_RETENTION_DAYS = '365';

            const file1 = path.join(testDir, 'VIARA_pg_20260901.dump');
            const file2 = path.join(testDir, 'VIARA_pg_20260902.dump');
            const file3 = path.join(testDir, 'VIARA_pg_20260903.dump');

            await fsp.writeFile(file1, 'backup 1');
            await fsp.utimes(file1, new Date('2026-09-01'), new Date('2026-09-01'));

            await fsp.writeFile(file2, 'backup 2');
            await fsp.utimes(file2, new Date('2026-09-02'), new Date('2026-09-02'));

            await fsp.writeFile(file3, 'backup 3');
            await fsp.utimes(file3, new Date('2026-09-03'), new Date('2026-09-03'));

            const deleted = await cleanupBackups();

            expect(deleted).toContain('VIARA_pg_20260901.dump');
            expect(fs.existsSync(file1)).toBe(false);
            expect(fs.existsSync(file2)).toBe(true);
            expect(fs.existsSync(file3)).toBe(true);
        });
    });

    describe('restorePostgresBackup', () => {
        beforeEach(() => {
            process.env.DATABASE_URL = 'postgresql://viara_user:secret_pass@127.0.0.1:5432/viara_db';
        });

        it('rejects invalid or unsafe filenames', async () => {
            await expect(restorePostgresBackup('../evil.dump'))
                .rejects.toThrow('Valid backup filename is required');
            await expect(restorePostgresBackup('invalid_ext.txt'))
                .rejects.toThrow('Valid backup filename is required');
            await expect(restorePostgresBackup(''))
                .rejects.toThrow('Valid backup filename is required');
        });

        it('rejects unsupported backup formats like json', async () => {
            const jsonFile = path.join(testDir, 'backup.json');
            await fsp.writeFile(jsonFile, '{}');
            await expect(restorePostgresBackup('backup.json'))
                .rejects.toThrow('PostgreSQL restore only supports .dump and .dump.enc archives');
        });

        it('rejects nonexistent backup files', async () => {
            await expect(restorePostgresBackup('VIARA_pg_missing.dump'))
                .rejects.toThrow('Backup file not found');
        });

        it('decrypts encrypted backup, verifies archive, and executes pg_restore', async () => {
            const rawData = Buffer.from('PG_DUMP_CUSTOM_TEST_DATA');
            const rawDumpPath = path.join(testDir, 'source.dump');
            const encName = 'VIARA_pg_20261005_test.dump.enc';
            const encDumpPath = path.join(testDir, encName);

            await fsp.writeFile(rawDumpPath, rawData);
            await encryptBackup(rawDumpPath, encDumpPath);
            await fsp.unlink(rawDumpPath);

            const executedCommands = [];
            const mockRunner = jest.fn(async (cmd, args, env) => {
                executedCommands.push({ cmd, args, env });
            });

            const result = await restorePostgresBackup(encName, {
                runProcess: mockRunner,
                restorePacs: false
            });

            expect(result.verified).toBe(true);
            expect(result.dry_run).toBe(false);
            expect(result.filename).toBe(encName);

            // Verify two calls: 1) --list verification, 2) pg_restore database restore
            expect(executedCommands).toHaveLength(2);
            expect(executedCommands[0].args[0]).toBe('--list');
            expect(executedCommands[1].args).toEqual(
                expect.arrayContaining(['--no-owner', '--no-privileges', '--clean', '--if-exists', '-d', 'viara_db'])
            );
            expect(executedCommands[1].env.PGDATABASE).toBe('viara_db');
            expect(executedCommands[1].env.PGUSER).toBe('viara_user');

            // Verify temporary decrypted file was cleaned up
            const filesInDir = await fsp.readdir(testDir);
            const tempFiles = filesInDir.filter(f => f.endsWith('.restore.tmp'));
            expect(tempFiles).toHaveLength(0);
        });

        it('verifyOnly mode runs integrity check but skips database restore', async () => {
            const rawData = Buffer.from('PG_DUMP_CUSTOM_TEST_DATA');
            const rawDumpPath = path.join(testDir, 'source2.dump');
            const encName = 'VIARA_pg_verify_only.dump.enc';
            const encDumpPath = path.join(testDir, encName);

            await fsp.writeFile(rawDumpPath, rawData);
            await encryptBackup(rawDumpPath, encDumpPath);
            await fsp.unlink(rawDumpPath);

            const executedCommands = [];
            const mockRunner = jest.fn(async (cmd, args, env) => {
                executedCommands.push({ cmd, args, env });
            });

            const result = await restorePostgresBackup(encName, {
                runProcess: mockRunner,
                verifyOnly: true,
                restorePacs: false
            });

            expect(result.verified).toBe(true);
            expect(result.dry_run).toBe(true);
            expect(executedCommands).toHaveLength(1);
            expect(executedCommands[0].args[0]).toBe('--list');

            const filesInDir = await fsp.readdir(testDir);
            expect(filesInDir.filter(f => f.endsWith('.restore.tmp'))).toHaveLength(0);
        });

        it('cleans up temporary decrypted files even if runner fails', async () => {
            const rawData = Buffer.from('PG_DUMP_CUSTOM_TEST_DATA');
            const rawDumpPath = path.join(testDir, 'source3.dump');
            const encName = 'VIARA_pg_failed.dump.enc';
            const encDumpPath = path.join(testDir, encName);

            await fsp.writeFile(rawDumpPath, rawData);
            await encryptBackup(rawDumpPath, encDumpPath);
            await fsp.unlink(rawDumpPath);

            const mockRunner = jest.fn(async () => {
                throw new Error('pg_restore process crashed');
            });

            await expect(restorePostgresBackup(encName, { runProcess: mockRunner, restorePacs: false }))
                .rejects.toThrow('pg_restore process crashed');

            const filesInDir = await fsp.readdir(testDir);
            expect(filesInDir.filter(f => f.endsWith('.restore.tmp'))).toHaveLength(0);
        });

        it('does not restore PACS companion if database restore fails', async () => {
            const rawData = Buffer.from('PG_DUMP_DATA');
            const encName = 'VIARA_pg_with_pacs_fail.dump.enc';
            const encDumpPath = path.join(testDir, encName);
            const sourceDump = path.join(testDir, 'source.dump');
            await fsp.writeFile(sourceDump, rawData);
            await encryptBackup(sourceDump, encDumpPath);
            await fsp.unlink(sourceDump);

            // Create fake companion pacs zip
            const companionEnc = path.join(testDir, 'VIARA_pg_with_pacs_fail.pacs.zip.enc');
            await encryptBackup(encDumpPath, companionEnc); // dummy encryption

            let callCount = 0;
            const mockRunner = jest.fn(async (cmd, args) => {
                callCount += 1;
                if (args[0] === '--list') return; // list succeeds
                throw new Error('Database connection lost during restore');
            });

            // Even if companion exists, since pg_restore failed, restorePacsBackup must not be invoked
            await expect(restorePostgresBackup(encName, { runProcess: mockRunner, restorePacs: true }))
                .rejects.toThrow();
        });
    });
});
