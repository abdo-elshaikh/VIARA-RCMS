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
    getBackupDir
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
});
