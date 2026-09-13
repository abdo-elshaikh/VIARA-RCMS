const logger = require('../config/logger');
const { createPostgresBackup, getBackupMode } = require('./postgresBackupService');
const { logSystemAuditEvent } = require('./systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('./auditTaxonomy');
const { replicateBackup } = require('./backupOffsiteReplicator');

const LOCK_ID = 731942;
let scheduleTimer = null;

const getNextRunDelay = () => {
    const configuredHour = Number.parseInt(process.env.BACKUP_SCHEDULE_HOUR_UTC, 10);
    const hour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23
        ? configuredHour
        : 2;
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
};

const runScheduledBackup = async (db) => {
    const client = await db.connect();
    let lockAcquired = false;
    try {
        const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
        lockAcquired = lock.rows[0]?.acquired === true;
        if (!lockAcquired) return { skipped: true, reason: 'Another instance owns the backup lock' };

        const backup = await createPostgresBackup();
        logger.info(`Scheduled PostgreSQL backup created: ${backup.filename}`);
        const replicationResult = await replicateBackup(backup);
        await logSystemAuditEvent(db, {
            eventCode: AUDIT_EVENT_CODES.SYSTEM_BACKUP_COMPLETED,
            jobName: 'postgres-backup',
            sourceSystem: 'backup-scheduler',
            target: { type: 'backups', label: backup.filename },
            details: {
                filename: backup.filename,
                size: backup.size_bytes ?? backup.size ?? backup.sizeBytes ?? null,
                checksum: backup.checksum || replicationResult.checksum || null,
                offsiteReplicated: Boolean(replicationResult.replicated),
                ...(replicationResult.error ? { offsiteError: replicationResult.error } : {}),
            },
        });
        return { skipped: false, backup };
    } finally {
        if (lockAcquired) {
            try {
                await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
            } catch (unlockErr) {
                logger.error(`Failed to release backup advisory lock: ${unlockErr.message}`);
            }
        }
        client.release();
    }
};

const scheduleNext = (db) => {
    scheduleTimer = setTimeout(async () => {
        try {
            await runScheduledBackup(db);
        } catch (error) {
            logger.error(`Scheduled PostgreSQL backup failed: ${error.message}`);
            await logSystemAuditEvent(db, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_BACKUP_FAILED,
                jobName: 'postgres-backup',
                sourceSystem: 'backup-scheduler',
                outcome: AUDIT_OUTCOME.FAILURE,
                details: { error: error.message },
                riskScore: 90,
                riskReason: 'Scheduled database backup failed.',
            });
        } finally {
            scheduleNext(db);
        }
    }, getNextRunDelay());
    scheduleTimer.unref?.();
};

const startBackupScheduler = (db) => {
    if (process.env.BACKUP_SCHEDULE_ENABLED !== 'true' || getBackupMode() !== 'postgres' || scheduleTimer) {
        return false;
    }
    scheduleNext(db);
    logger.info('Daily PostgreSQL backup scheduler enabled');
    return true;
};

const stopBackupScheduler = () => {
    if (scheduleTimer) clearTimeout(scheduleTimer);
    scheduleTimer = null;
};

module.exports = {
    getNextRunDelay,
    runScheduledBackup,
    startBackupScheduler,
    stopBackupScheduler
};
