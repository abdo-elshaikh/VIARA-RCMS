const logger = require('../config/logger');
const { processQueuedPacsAiJobs } = require('../services/pacsAiAnalysisService');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../services/auditTaxonomy');

const INTERVAL_MS = Number(process.env.PACS_AI_QUEUE_INTERVAL_MS || 30 * 1000);
const BATCH_SIZE = Number(process.env.PACS_AI_QUEUE_BATCH_SIZE || 2);

let inFlight = false;

const runOnce = async (pool) => {
    if (inFlight) return;
    inFlight = true;
    try {
        const result = await processQueuedPacsAiJobs(pool, BATCH_SIZE);
        if (result.processed > 0 || result.staleFailed > 0) {
            logger.info('PACS AI analysis queue processed', result);
            await logSystemAuditEvent(pool, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
                jobName: 'pacs-ai-analysis',
                sourceSystem: 'pacs-ai-analysis-job',
                target: { type: 'pacs_ai_analysis_jobs' },
                details: result,
                riskScore: result.staleFailed > 0 ? 45 : 0,
                riskReason: result.staleFailed > 0 ? 'PACS AI queue marked stale jobs as failed.' : null,
            });
        }
    } catch (error) {
        logger.error('PACS AI analysis queue pass failed', { error: error.message, stack: error.stack });
        await logSystemAuditEvent(pool, {
            eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_FAILED,
            jobName: 'pacs-ai-analysis',
            sourceSystem: 'pacs-ai-analysis-job',
            outcome: AUDIT_OUTCOME.FAILURE,
            details: { error: error.message },
            riskScore: 75,
            riskReason: 'PACS AI analysis queue failed.',
        });
    } finally {
        inFlight = false;
    }
};

const startPacsAiAnalysisJob = (pool) => {
    if (String(process.env.PACS_AI_QUEUE_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('PACS AI analysis queue disabled (PACS_AI_QUEUE_ENABLED=false)');
        return () => {};
    }

    logger.info(`PACS AI analysis queue started. Polling every ${Math.round(INTERVAL_MS / 1000)}s.`);
    const timeout = setTimeout(() => runOnce(pool), 45 * 1000);
    const interval = setInterval(() => runOnce(pool), INTERVAL_MS);
    return () => {
        clearTimeout(timeout);
        clearInterval(interval);
    };
};

const triggerPacsAiAnalysis = (pool) => runOnce(pool);

module.exports = { startPacsAiAnalysisJob, triggerPacsAiAnalysis };
