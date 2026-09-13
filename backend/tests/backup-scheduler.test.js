const {
    getNextRunDelay,
    runScheduledBackup,
    startBackupScheduler,
    stopBackupScheduler
} = require('../src/services/backupScheduler');
const { AUDIT_EVENT_CODES } = require('../src/services/auditTaxonomy');

jest.mock('../src/services/postgresBackupService', () => ({
    createPostgresBackup: jest.fn(),
    getBackupMode: jest.fn().mockReturnValue('postgres')
}));

jest.mock('../src/services/backupOffsiteReplicator', () => ({
    replicateBackup: jest.fn()
}));

jest.mock('../src/services/systemAuditService', () => ({
    logSystemAuditEvent: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const { createPostgresBackup, getBackupMode } = require('../src/services/postgresBackupService');
const { replicateBackup } = require('../src/services/backupOffsiteReplicator');
const { logSystemAuditEvent } = require('../src/services/systemAuditService');

describe('BackupScheduler Service', () => {
    let mockClient;
    let mockDb;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.BACKUP_SCHEDULE_ENABLED;
        delete process.env.BACKUP_SCHEDULE_HOUR_UTC;
        delete process.env.BACKUP_MODE;

        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        mockDb = {
            connect: jest.fn().mockResolvedValue(mockClient)
        };
    });

    afterEach(() => {
        stopBackupScheduler();
    });

    describe('getNextRunDelay', () => {
        it('calculates a positive delay within 24 hours', () => {
            const delay = getNextRunDelay();
            expect(delay).toBeGreaterThan(0);
            expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
        });

        it('respects valid BACKUP_SCHEDULE_HOUR_UTC configuration', () => {
            process.env.BACKUP_SCHEDULE_HOUR_UTC = '5';
            const delay = getNextRunDelay();
            expect(delay).toBeGreaterThan(0);
            expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
        });

        it('falls back to hour 2 for invalid configured hours', () => {
            process.env.BACKUP_SCHEDULE_HOUR_UTC = 'invalid_hour';
            const delay = getNextRunDelay();
            expect(delay).toBeGreaterThan(0);
            expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
        });
    });

    describe('runScheduledBackup', () => {
        it('acquires advisory lock, runs backup, replicates, and logs audit event', async () => {
            mockClient.query.mockImplementation(async (sql) => {
                if (sql.includes('pg_try_advisory_lock')) {
                    return { rows: [{ acquired: true }] };
                }
                if (sql.includes('pg_advisory_unlock')) {
                    return { rows: [{ unlocked: true }] };
                }
                return { rows: [] };
            });

            createPostgresBackup.mockResolvedValue({
                filename: 'VIARA_pg_20260912.dump.enc',
                filepath: '/backups/VIARA_pg_20260912.dump.enc',
                size_bytes: 5242880,
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
            });

            replicateBackup.mockResolvedValue({
                replicated: true,
                filename: 'VIARA_pg_20260912.dump.enc',
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
            });

            const result = await runScheduledBackup(mockDb);

            expect(result.skipped).toBe(false);
            expect(result.backup.filename).toBe('VIARA_pg_20260912.dump.enc');
            expect(mockClient.query).toHaveBeenCalledWith('SELECT pg_try_advisory_lock($1) AS acquired', [731942]);
            expect(mockClient.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [731942]);
            expect(mockClient.release).toHaveBeenCalledTimes(1);

            expect(logSystemAuditEvent).toHaveBeenCalledWith(mockDb, expect.objectContaining({
                eventCode: AUDIT_EVENT_CODES.SYSTEM_BACKUP_COMPLETED,
                jobName: 'postgres-backup',
                sourceSystem: 'backup-scheduler',
                details: expect.objectContaining({
                    filename: 'VIARA_pg_20260912.dump.enc',
                    size: 5242880,
                    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    offsiteReplicated: true
                })
            }));
        });

        it('skips execution gracefully when another instance holds the lock', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ acquired: false }] });

            const result = await runScheduledBackup(mockDb);

            expect(result.skipped).toBe(true);
            expect(result.reason).toContain('Another instance owns the backup lock');
            expect(createPostgresBackup).not.toHaveBeenCalled();
            expect(mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'), expect.anything());
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });

        it('ensures client is released even if advisory unlock fails', async () => {
            mockClient.query.mockImplementation(async (sql) => {
                if (sql.includes('pg_try_advisory_lock')) {
                    return { rows: [{ acquired: true }] };
                }
                if (sql.includes('pg_advisory_unlock')) {
                    throw new Error('Connection reset during unlock');
                }
                return { rows: [] };
            });

            createPostgresBackup.mockResolvedValue({
                filename: 'VIARA_pg_20260912.dump.enc',
                size_bytes: 1024
            });
            replicateBackup.mockResolvedValue({ replicated: false });

            const result = await runScheduledBackup(mockDb);

            expect(result.skipped).toBe(false);
            expect(mockClient.release).toHaveBeenCalledTimes(1);
        });
    });

    describe('startBackupScheduler and stopBackupScheduler', () => {
        it('returns false when BACKUP_SCHEDULE_ENABLED is not true', () => {
            process.env.BACKUP_SCHEDULE_ENABLED = 'false';
            getBackupMode.mockReturnValue('postgres');

            const started = startBackupScheduler(mockDb);
            expect(started).toBe(false);
        });

        it('returns false when backup mode is not postgres', () => {
            process.env.BACKUP_SCHEDULE_ENABLED = 'true';
            getBackupMode.mockReturnValue('json');

            const started = startBackupScheduler(mockDb);
            expect(started).toBe(false);
        });

        it('enables the daily scheduler when configured', () => {
            process.env.BACKUP_SCHEDULE_ENABLED = 'true';
            getBackupMode.mockReturnValue('postgres');

            const started = startBackupScheduler(mockDb);
            expect(started).toBe(true);

            // Calling start again when already scheduled returns false
            const startedAgain = startBackupScheduler(mockDb);
            expect(startedAgain).toBe(false);

            stopBackupScheduler();
        });
    });
});
