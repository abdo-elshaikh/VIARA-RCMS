const fs = require('fs/promises');
const path = require('path');
const logger = require('../config/logger');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../services/auditTaxonomy');

const PRIVACY_EXPORT_DIR = path.resolve(process.env.PRIVACY_EXPORT_DIR || path.join(__dirname, '../../private/privacy_exports'));
const PRIVACY_EXPORT_CLEANUP_LIMIT = Math.max(Number.parseInt(process.env.PRIVACY_EXPORT_CLEANUP_LIMIT, 10) || 100, 1);
const NOTIFICATION_RETENTION_LIMIT = Math.max(Number.parseInt(process.env.NOTIFICATION_RETENTION_LIMIT, 10) || 500, 1);
const NOTIFICATION_JOB_PAYLOAD_DAYS = Math.max(Number.parseInt(process.env.NOTIFICATION_JOB_PAYLOAD_DAYS, 10) || 30, 1);
const NOTIFICATION_JOB_RETENTION_DAYS = Math.max(Number.parseInt(process.env.NOTIFICATION_JOB_RETENTION_DAYS, 10) || 90, NOTIFICATION_JOB_PAYLOAD_DAYS);
const NOTIFICATION_RETENTION_DAYS = Math.max(Number.parseInt(process.env.NOTIFICATION_RETENTION_DAYS, 10) || 365, 1);
const PUBLIC_APPOINTMENT_RETENTION_DAYS = Math.max(Number.parseInt(process.env.PUBLIC_APPOINTMENT_RETENTION_DAYS, 10) || 365, 30);

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

const cleanupNotificationData = async (pool) => {
    const redactedJobs = await pool.query(`
        WITH candidates AS (
            SELECT job_id
            FROM notification_jobs
            WHERE status IN ('Sent', 'Failed', 'Cancelled', 'Skipped')
              AND processed_at < NOW() - ($1::int * INTERVAL '1 day')
              AND variables <> '{"redacted":true}'::jsonb
            ORDER BY processed_at ASC
            LIMIT $2
        )
        UPDATE notification_jobs nj
        SET variables = '{"redacted":true}'::jsonb,
            recipient_contact = NULL,
            recipient_contact_enc = NULL
        FROM candidates c
        WHERE nj.job_id = c.job_id
    `, [NOTIFICATION_JOB_PAYLOAD_DAYS, NOTIFICATION_RETENTION_LIMIT]);

    const deletedJobs = await pool.query(`
        DELETE FROM notification_jobs
        WHERE job_id IN (
            SELECT job_id
            FROM notification_jobs
            WHERE status IN ('Sent', 'Failed', 'Cancelled', 'Skipped')
              AND COALESCE(processed_at, created_at) < NOW() - ($1::int * INTERVAL '1 day')
            ORDER BY COALESCE(processed_at, created_at) ASC
            LIMIT $2
        )
    `, [NOTIFICATION_JOB_RETENTION_DAYS, NOTIFICATION_RETENTION_LIMIT]);

    // Critical notifications are retained for their dedicated clinical/audit
    // policy rather than being removed by the general inbox cleanup.
    const deletedNotifications = await pool.query(`
        DELETE FROM notifications
        WHERE notification_id IN (
            SELECT notification_id
            FROM notifications
            WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
              AND priority <> 'Critical'
            ORDER BY created_at ASC
            LIMIT $2
        )
    `, [NOTIFICATION_RETENTION_DAYS, NOTIFICATION_RETENTION_LIMIT]);

    return {
        jobPayloadsRedacted: redactedJobs.rowCount || 0,
        jobsDeleted: deletedJobs.rowCount || 0,
        notificationsDeleted: deletedNotifications.rowCount || 0
    };
};

const cleanupPublicPortalData = async (pool) => {
    const challenges = await pool.query(`
        DELETE FROM public_case_verification_challenges
        WHERE expires_at < NOW() - INTERVAL '24 hours'
    `);
    const appointmentRequests = await pool.query(`
        DELETE FROM public_appointment_requests
        WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
          AND status IN ('Scheduled', 'Rejected', 'Cancelled')
    `, [PUBLIC_APPOINTMENT_RETENTION_DAYS]);
    return {
        verificationChallengesDeleted: challenges.rowCount || 0,
        appointmentRequestsDeleted: appointmentRequests.rowCount || 0,
    };
};

const cleanupPasswordResetTokens = async (pool) => {
    const result = await pool.query(`
        DELETE FROM password_reset_tokens 
        WHERE revoked = TRUE OR expires_at < NOW() - INTERVAL '90 days'
    `);
    return { deleted: result.rowCount || 0 };
};

const scheduleDataRetentionJobs = (pool) => {
    const runJob = async () => {
        logger.info('Running data retention cleanup jobs...');
        
        try {
            // Delete revoked refresh tokens older than 90 days
            const tokenResult = await pool.query(`
                DELETE FROM refresh_tokens 
                WHERE (revoked = TRUE AND revoked_at < NOW() - INTERVAL '90 days') OR (expires_at < NOW() - INTERVAL '90 days')
            `);
            logger.info(`Cleaned up ${tokenResult.rowCount} expired refresh tokens.`);
            const resetTokensResult = await cleanupPasswordResetTokens(pool);
            logger.info(`Cleaned up ${resetTokensResult.deleted} expired password reset tokens.`);

            const privacyResult = await cleanupExpiredPrivacyExports(pool);
            logger.info('Cleaned up expired privacy export artifacts.', privacyResult);

            const notificationResult = await cleanupNotificationData(pool);
            logger.info('Applied notification retention policy.', notificationResult);

            const publicPortalResult = await cleanupPublicPortalData(pool);
            logger.info('Applied public portal retention policy.', publicPortalResult);

            await logSystemAuditEvent(pool, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_RETENTION_JOB_RAN,
                jobName: 'data-retention-cleanup',
                sourceSystem: 'data-retention-job',
                details: {
                    revokedRefreshTokensDeleted: tokenResult.rowCount || 0,
                    privacyExports: privacyResult,
                    notifications: notificationResult,
                    publicPortal: publicPortalResult,
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

module.exports = { scheduleDataRetentionJobs, cleanupExpiredPrivacyExports, cleanupNotificationData, cleanupPublicPortalData, cleanupPasswordResetTokens };
