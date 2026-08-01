const { tierColdInstances } = require('../services/pacsTieringService');
const logger = require('../config/logger');

// Nightly-ish tiering sweep. Follows the project's setInterval job convention
// (no node-cron dependency). Default cadence is once per hour; the service's
// age threshold (PACS_TIERING_DAYS) decides what is actually eligible, so a
// frequent tick is cheap when nothing qualifies.
const INTERVAL_MS = Number(process.env.PACS_TIERING_INTERVAL_MS || 60 * 60 * 1000);

let inFlight = false;

const runOnce = async (pool) => {
    if (inFlight) return;
    inFlight = true;
    try {
        await tierColdInstances(pool);
    } catch (error) {
        logger.error('PACS tiering pass failed', { error: error.message, stack: error.stack });
    } finally {
        inFlight = false;
    }
};

const startPacsTieringJob = (pool) => {
    if (String(process.env.PACS_TIERING_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('PACS tiering job disabled (PACS_TIERING_ENABLED=false)');
        return;
    }
    logger.info(`PACS tiering job started. Sweeping every ${Math.round(INTERVAL_MS / 60000)} min.`);
    // Delay first sweep so boot stays light.
    setTimeout(() => runOnce(pool), 60 * 1000);
    setInterval(() => runOnce(pool), INTERVAL_MS);
};

// Exposed so the QA test / an admin action can force a sweep.
const triggerPacsTiering = (pool) => runOnce(pool);

module.exports = { startPacsTieringJob, triggerPacsTiering };
