const fs = require('fs/promises');
const path = require('path');
const logger = require('../config/logger');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../services/auditTaxonomy');

const PRIVACY_EXPORT_DIR = path.resolve(process.env.PRIVACY_EXPORT_DIR || path.join(__dirname, '../../private/privacy_exports'));
const PRIVACY_EXPORT_CLEANUP_LIMIT = Math.max(Number.parseInt(process.env.PRIVACY_EXPORT_CLEANUP_LIMIT, 10) || 100, 1);

const isPathInside = (candidatePath, parentPath) => {
    const relative = path.relative(parentPath, path.resolve(candidatePath));
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const cleanupExpiredPrivacyExports = async (pool) => {
    const result = await pool.query(`
        SELECT export_id, file_path
        FROM privacy_export_artifacts
        WHERE expires_at < NOW()
        ORDER BY expires_at ASC
        LIMIT $1
    `, [PRIVACY_EXPORT_CLEANUP_LIMIT]);

    let deleted = 0;
    let skipped = 0;

    for (const artifact of result.rows) {
        const artifactPath = path.resolve(artifact.file_path);
        if (!isPathInside(artifactPath, PRIVACY_EXPORT_DIR)) {
            skipped += 1;
            logger.warn('Skipped expired privacy export outside configured export directory', {
                exportId: artifact.export_id,
                filePath: artifact.file_path,
                exportDir: PRIVACY_EXPORT_DIR
            });
            continue;
        }

        try {
            await fs.unlink(artifactPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        await pool.query('DELETE FROM privacy_export_artifacts WHERE export_id = $1', [artifact.export_id]);
        deleted += 1;
    }

    return { scanned: result.rows.length, deleted, skipped };
};

const scheduleDataRetentionJobs = (pool) => {
    const runJob = async () => {
        logger.info('Running data retention cleanup jobs...');
        
        try {
            // Delete revoked refresh tokens older than 90 days
            const tokenResult = await pool.query(`
                DELETE FROM refresh_tokens 
                WHERE revoked = TRUE AND revoked_at < NOW() - INTERVAL '90 days'
            `);
            logger.info(`Cleaned up ${tokenResult.rowCount} expired refresh tokens.`);

            const privacyResult = await cleanupExpiredPrivacyExports(pool);
            logger.info('Cleaned up expired privacy export artifacts.', privacyResult);

            await logSystemAuditEvent(pool, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_RETENTION_JOB_RAN,
                jobName: 'data-retention-cleanup',
                sourceSystem: 'data-retention-job',
                details: {
                    revokedRefreshTokensDeleted: tokenResult.rowCount || 0,
                    privacyExports: privacyResult,
                },
            });
        } catch (error) {
            logger.error('Failed to run data retention cleanup', { error: error.message, stack: error.stack });
            await logSystemAuditEvent(pool, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_FAILED,
                jobName: 'data-retention-cleanup',
                sourceSystem: 'data-retention-job',
                outcome: AUDIT_OUTCOME.FAILURE,
                details: { error: error.message },
                riskScore: 85,
                riskReason: 'Data retention cleanup failed.',
            });
        }
    };

    // Run once on startup (after 1 minute) and then every 24 hours
    // This removes the need for the external 'node-cron' dependency
    const timeout = setTimeout(runJob, 60 * 1000);
    const interval = setInterval(runJob, 24 * 60 * 60 * 1000);
    return () => {
        clearTimeout(timeout);
        clearInterval(interval);
    };
};

module.exports = { scheduleDataRetentionJobs, cleanupExpiredPrivacyExports };
