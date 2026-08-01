const fs = require('fs/promises');
const os = require('os');
const path = require('path');

describe('data retention privacy export cleanup', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rcms-retention-'));
        process.env.PRIVACY_EXPORT_DIR = tempDir;
        jest.resetModules();
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
        delete process.env.PRIVACY_EXPORT_DIR;
    });

    test('deletes expired export files and database rows inside the export directory', async () => {
        const exportPath = path.join(tempDir, 'expired.json.enc');
        await fs.writeFile(exportPath, 'encrypted');
        const deleted = [];
        const pool = {
            query: jest.fn(async (sql, params) => {
                if (String(sql).includes('SELECT export_id')) {
                    return { rows: [{ export_id: 'export-1', file_path: exportPath }] };
                }
                if (String(sql).includes('DELETE FROM privacy_export_artifacts')) {
                    deleted.push(params[0]);
                }
                return { rows: [], rowCount: 0 };
            })
        };

        const { cleanupExpiredPrivacyExports } = require('../src/jobs/dataRetentionJob');
        const result = await cleanupExpiredPrivacyExports(pool);

        await expect(fs.access(exportPath)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(deleted).toEqual(['export-1']);
        expect(result).toEqual({ scanned: 1, deleted: 1, skipped: 0 });
    });

    test('skips expired export rows that point outside the export directory', async () => {
        const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rcms-retention-outside-'));
        const outsidePath = path.join(outsideDir, 'expired.json.enc');
        await fs.writeFile(outsidePath, 'encrypted');
        const pool = {
            query: jest.fn(async (sql) => {
                if (String(sql).includes('SELECT export_id')) {
                    return { rows: [{ export_id: 'export-2', file_path: outsidePath }] };
                }
                return { rows: [], rowCount: 0 };
            })
        };

        const { cleanupExpiredPrivacyExports } = require('../src/jobs/dataRetentionJob');
        const result = await cleanupExpiredPrivacyExports(pool);

        await expect(fs.access(outsidePath)).resolves.toBeUndefined();
        expect(pool.query).not.toHaveBeenCalledWith('DELETE FROM privacy_export_artifacts WHERE export_id = $1', ['export-2']);
        expect(result).toEqual({ scanned: 1, deleted: 0, skipped: 1 });

        await fs.rm(outsideDir, { recursive: true, force: true });
    });
});
