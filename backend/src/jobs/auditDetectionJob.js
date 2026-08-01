const logger = require('../config/logger');
const { runAuditPatternDetections } = require('../services/auditDetectionService');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../services/auditTaxonomy');

const INTERVAL_MS = Number(process.env.AUDIT_DETECTION_INTERVAL_MS || 15 * 60 * 1000);

let inFlight = false;

const runOnce = async (pool) => {
    if (inFlight) return { skipped: true, reason: 'already_running' };
    inFlight = true;
    try {
        const result = await runAuditPatternDetections(pool);
        if (result.totalCreated > 0) {
            logger.warn('Audit detection created alerts', result);
        } else {
            logger.debug('Audit detection completed without new alerts', result);
        }
        await logSystemAuditEvent(pool, {
            eventCode: AUDIT_EVENT_CODES.AUDIT_DETECTION_RUN,
            jobName: 'audit-detection',
            sourceSystem: 'audit-detection-job',
            target: { type: 'audit_alerts' },
            details: {
                totalCreated: result.totalCreated || 0,
                rules: result.rules || [],
            },
            riskScore: result.totalCreated > 0 ? 50 : 0,
            riskReason: result.totalCreated > 0 ? 'Scheduled audit detection created alerts.' : null,
        });
        return result;
    } catch (error) {
        logger.error('Audit detection pass failed', { error: error.message, stack: error.stack });
        await logSystemAuditEvent(pool, {
            eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_FAILED,
            jobName: 'audit-detection',
            sourceSystem: 'audit-detection-job',
            outcome: AUDIT_OUTCOME.FAILURE,
            details: { error: error.message },
            riskScore: 85,
            riskReason: 'Scheduled audit detection failed.',
        });
        return { error: error.message };
    } finally {
        inFlight = false;
    }
};

const startAuditDetectionJob = (pool) => {
    if (String(process.env.AUDIT_DETECTION_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('Audit detection job disabled (AUDIT_DETECTION_ENABLED=false)');
        return;
    }

    logger.info(`Audit detection job started. Sweeping every ${Math.round(INTERVAL_MS / 60000)} min.`);
    setTimeout(() => runOnce(pool), 2 * 60 * 1000);
    setInterval(() => runOnce(pool), INTERVAL_MS);
};

const triggerAuditDetection = (pool) => runOnce(pool);

module.exports = {
    startAuditDetectionJob,
    triggerAuditDetection,
};
