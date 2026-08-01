const { regenerateWorklists } = require('../services/pacsMwlService');
const logger = require('../config/logger');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../services/auditTaxonomy');

// Regenerate the modality worklist directory on a short interval so consoles see
// newly scheduled (and no longer see cancelled) exams promptly. Follows the
// project convention of setInterval-based jobs to avoid a node-cron dependency.
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let inFlight = false;

const runOnce = async (pool) => {
    if (inFlight) return; // never overlap regenerations
    inFlight = true;
    try {
        const result = await regenerateWorklists(pool);
        if (Number(result?.written || 0) > 0 || Number(result?.pruned || 0) > 0) {
            await logSystemAuditEvent(pool, {
                eventCode: AUDIT_EVENT_CODES.PACS_MWL_REGENERATED,
                jobName: 'pacs-mwl',
                sourceSystem: 'pacs-mwl-job',
                target: { type: 'pacs_worklists', label: 'Modality Worklist' },
                details: result,
                riskScore: 0
            });
        }
    } catch (error) {
        logger.error('MWL regeneration failed', { error: error.message, stack: error.stack });
        await logSystemAuditEvent(pool, {
            eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_FAILED,
            jobName: 'pacs-mwl',
            sourceSystem: 'pacs-mwl-job',
            target: { type: 'pacs_worklists', label: 'Modality Worklist' },
            outcome: AUDIT_OUTCOME.FAILURE,
            details: { error: error.message },
            riskScore: 70,
            riskReason: 'PACS Modality Worklist regeneration failed.'
        });
    } finally {
        inFlight = false;
    }
};

const startPacsMwlJob = (pool) => {
    if (String(process.env.PACS_MWL_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('PACS MWL job disabled (PACS_MWL_ENABLED=false)');
        return () => {};
    }

    logger.info('PACS MWL worklist generator started. Regenerating every 2 minutes.');

    // Prime shortly after boot, then on the interval.
    const timeout = setTimeout(() => runOnce(pool), 15 * 1000);
    const interval = setInterval(() => runOnce(pool), INTERVAL_MS);
    return () => {
        clearTimeout(timeout);
        clearInterval(interval);
    };
};

// Allow controllers (e.g. after scheduling an exam) to force an immediate refresh.
const triggerPacsMwlRefresh = (pool) => runOnce(pool);

module.exports = { startPacsMwlJob, triggerPacsMwlRefresh };
