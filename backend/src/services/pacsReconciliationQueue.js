/**
 * PACS Reconciliation Queue Service
 * Provides asynchronous processing of PACS webhook events via a PostgreSQL-backed queue.
 * The webhook handler enqueues events and returns immediately; a background worker
 * processes them with reconcileInstance.
 */
const logger = require('../config/logger');
const { reconcileInstance } = require('./pacsReconcileService');

const QUEUE_TABLE = 'pacs_reconciliation_queue';
const DEFAULT_INTERVAL_MS = Number(process.env.PACS_AI_QUEUE_INTERVAL_MS || 30000);
const DEFAULT_BATCH_SIZE = Number(process.env.PACS_AI_QUEUE_BATCH_SIZE || 1);

/**
 * Enqueue a PACS webhook payload for asynchronous reconciliation.
 * @param {object} db - Database pool
 * @param {object} payload - The webhook payload from Orthanc
 * @param {object} options - { remoteIp }
 */
async function enqueueReconciliation(db, payload, options = {}) {
    const { remoteIp = null } = options;
    const { orthancInstanceId, studyInstanceUid, accessionNumber } = payload;

    await db.query(`
        INSERT INTO ${QUEUE_TABLE} (
            orthanc_instance_id, study_instance_uid, accession_number,
            payload, status, created_at, attempts
        ) VALUES ($1, $2, $3, $4, 'pending', NOW(), 0)
    `, [
        orthancInstanceId || null,
        studyInstanceUid || null,
        accessionNumber || null,
        JSON.stringify(payload)
    ]);

    logger.info('[PACSQueue] Webhook enqueued for async reconciliation', {
        orthancInstanceId,
        studyInstanceUid,
        accessionNumber,
        remoteIp
    });
}

/**
 * Process pending queue items.
 * @param {object} db - Database pool
 * @param {object} options - { intervalMs, batchSize }
 */
async function processQueue(db, options = {}) {
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;

    const client = await db.connect();
    let jobs = [];

    try {
        await client.query('BEGIN');

        const selectResult = await client.query(`
            SELECT id, payload FROM ${QUEUE_TABLE}
            WHERE status = 'pending' OR (status = 'failed' AND attempts < 5)
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        `, [batchSize]);

        if (selectResult.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        for (const row of selectResult.rows) {
            jobs.push({ id: row.id, payload: row.payload });
            await client.query(
                `UPDATE ${QUEUE_TABLE} SET status = 'processing', attempts = attempts + 1, processing_started_at = NOW() WHERE id = $1`,
                [row.id]
            );
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }

    for (const job of jobs) {
        try {
            const result = await reconcileInstance(db, job.payload, { remoteIp: null });

            await db.query(
                `UPDATE ${QUEUE_TABLE} SET status = 'completed', result = $1, processed_at = NOW() WHERE id = $2`,
                [JSON.stringify(result), job.id]
            );

            logger.info('[PACSQueue] Reconciliation completed', { jobId: job.id });
        } catch (err) {
            logger.error('[PACSQueue] Reconciliation failed', { jobId: job.id, error: err.message });
            await db.query(
                `UPDATE ${QUEUE_TABLE} SET status = 'failed', error = $1, processed_at = NOW() WHERE id = $2`,
                [err.message, job.id]
            );
        }
    }
}

/**
 * Start the background worker that polls the queue.
 * @param {object} db - Database pool
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {object} { stop } — call stop() to halt the worker
 */
function startWorker(db, intervalMs = DEFAULT_INTERVAL_MS) {
    const timer = setInterval(() => {
        processQueue(db).catch(err => {
            logger.error('[PACSQueue] Worker error', { error: err.message });
        });
    }, intervalMs);

    // Run immediately on startup
    processQueue(db).catch(err => {
        logger.error('[PACSQueue] Initial worker error', { error: err.message });
    });

    logger.info('[PACSQueue] Worker started', { intervalMs });

    return {
        stop: () => {
            clearInterval(timer);
            logger.info('[PACSQueue] Worker stopped');
        }
    };
}

module.exports = {
    enqueueReconciliation,
    processQueue,
    startWorker,
    QUEUE_TABLE
};
