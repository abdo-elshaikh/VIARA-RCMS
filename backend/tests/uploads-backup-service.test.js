const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
    snapshotUploads,
    verifyUploadsZip,
    restoreUploads,
    collectUploadFiles
} = require('../src/services/uploadsBackupService');

const {
    createUploadsCompanion,
    encryptBackup,
    decryptBackup
} = require('../src/services/postgresBackupService');

describe('UploadsBackupService', () => {
    let testDir;
    let uploadsDir;
    const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    beforeEach(async () => {
        testDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'viara-uploads-test-'));
        uploadsDir = path.join(testDir, 'uploads');
        await fsp.mkdir(path.join(uploadsDir, 'documents'), { recursive: true });
        await fsp.mkdir(path.join(uploadsDir, 'chat'), { recursive: true });

        process.env.BACKUP_ENCRYPTION_KEY = testKeyHex;
        process.env.UPLOADS_DIR = uploadsDir;
    });

    afterEach(async () => {
        delete process.env.BACKUP_ENCRYPTION_KEY;
        delete process.env.UPLOADS_DIR;
        delete process.env.UPLOADS_BACKUP_ENABLED;
        try {
            await fsp.rm(testDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    it('collects files from documents and chat directories, ignoring temporary files', async () => {
        await fsp.writeFile(path.join(uploadsDir, 'documents', 'doc1.pdf'), 'PDF CONTENT 1');
        await fsp.writeFile(path.join(uploadsDir, 'documents', 'temp.tmp'), 'TEMP IGNORED');
        await fsp.writeFile(path.join(uploadsDir, 'chat', 'photo.jpg'), 'JPEG CONTENT 1');

        const collected = await collectUploadFiles(uploadsDir);
        expect(collected).toHaveLength(2);
        expect(collected.map(c => c.relPath)).toEqual(['chat/photo.jpg', 'documents/doc1.pdf']);
    });

    it('creates a zip snapshot with SHA-256 manifest and verifies it', async () => {
        const docContent = 'Patient medical referral scan 2026';
        const chatContent = 'Doctor-radiologist communication';

        await fsp.writeFile(path.join(uploadsDir, 'documents', 'referral.txt'), docContent);
        await fsp.writeFile(path.join(uploadsDir, 'chat', 'chat1.txt'), chatContent);

        const zipPath = path.join(testDir, 'test-uploads.zip');
        const snapshot = await snapshotUploads(zipPath, { uploadsDir });

        expect(snapshot.fileCount).toBe(2);
        expect(fs.existsSync(zipPath)).toBe(true);

        const manifest = await verifyUploadsZip(zipPath);
        expect(manifest.format).toBe('viara-uploads-v1');
        expect(manifest.files).toHaveLength(2);

        const docEntry = manifest.files.find(f => f.file === 'documents/referral.txt');
        expect(docEntry.sha256).toBe(crypto.createHash('sha256').update(docContent).digest('hex'));
    });

    it('restores files from backup zip with exact contents', async () => {
        const docContent = 'Radiology lab results v1';
        await fsp.writeFile(path.join(uploadsDir, 'documents', 'lab.txt'), docContent);

        const zipPath = path.join(testDir, 'restore-test.zip');
        await snapshotUploads(zipPath, { uploadsDir });

        const restoreTargetDir = path.join(testDir, 'restored-uploads');
        const restoreResult = await restoreUploads(zipPath, restoreTargetDir);

        expect(restoreResult.verified).toBe(true);
        expect(restoreResult.restored).toBe(1);

        const restoredContent = await fsp.readFile(path.join(restoreTargetDir, 'documents', 'lab.txt'), 'utf8');
        expect(restoredContent).toBe(docContent);
    });

    it('createUploadsCompanion creates encrypted archive and manifest when enabled', async () => {
        process.env.UPLOADS_BACKUP_ENABLED = 'true';
        await fsp.writeFile(path.join(uploadsDir, 'documents', 'scan.txt'), 'SCAN DATA');

        const backup = {
            filename: 'VIARA_pg_20261010.dump.enc',
            filepath: path.join(testDir, 'VIARA_pg_20261010.dump.enc')
        };

        const result = await createUploadsCompanion(backup);
        expect(result).not.toBeNull();
        expect(result.backup.filename).toBe('VIARA_pg_20261010.uploads.zip.enc');
        expect(result.backup.type).toBe('Uploads (encrypted)');
        expect(result.backup.file_count).toBe(1);
        expect(fs.existsSync(result.backup.filepath)).toBe(true);

        // Verify decrypting the companion produces a valid zip
        const decryptedZip = path.join(testDir, 'decrypted-companion.zip');
        await decryptBackup(result.backup.filepath, decryptedZip);
        const manifest = await verifyUploadsZip(decryptedZip);
        expect(manifest.files).toHaveLength(1);
    });

    it('createUploadsCompanion returns null when disabled', async () => {
        process.env.UPLOADS_BACKUP_ENABLED = 'false';
        const backup = {
            filename: 'VIARA_pg_20261010.dump.enc',
            filepath: path.join(testDir, 'VIARA_pg_20261010.dump.enc')
        };

        const result = await createUploadsCompanion(backup);
        expect(result).toBeNull();
    });
});
