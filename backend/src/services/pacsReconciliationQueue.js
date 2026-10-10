/**
 * PACS Reconciliation Queue Service
 * Provides asynchronous processing of PACS webhook events via a PostgreSQL-backed queue.
 * The webhook handler enqueues events and returns immediately; a background worker
 * processes them with reconcileInstance.
 */
const logger = require('../config/logger');
const crypto = require('crypto');
const { reconcileInstance } = require('./pacsReconcileService');

const QUEUE_TABLE = 'pacs_reconciliation_queue';
const DEFAULT_INTERVAL_MS = Number(process.env.PACS_RECON_QUEUE_INTERVAL_MS || 3000);
const DEFAULT_BATCH_SIZE = Number(process.env.PACS_RECON_QUEUE_BATCH_SIZE || 5);

/**
 * Enqueue a PACS webhook payload for asynchronous reconciliation.
 * @param {object} db - Database pool
 * @param {object} payload - The webhook payload from Orthanc
 * @param {object} options - { remoteIp }
 */
async function enqueueReconciliation(db, payload, options = {}) {
    const { remoteIp = null } = options;
    const orthancInstanceId = payload.orthancInstanceId || payload.OrthancInstanceId || null;
    const studyInstanceUid = payload.studyInstanceUid || payload.StudyInstanceUID || null;
    const accessionNumber = payload.accessionNumber || payload.AccessionNumber || null;

    const identity = {
        event: payload.EventType || 'NewInstance', instance: orthancInstanceId,
        study: studyInstanceUid, accession: accessionNumber,
        patient: payload.PatientID || payload.patientId || null,
        series: payload.SeriesInstanceUID || null, sop: payload.SOPInstanceUID || null,
        archiveStudy: payload.OrthancStudyId || null
    };
    const eventKey = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    await db.query(`
        INSERT INTO ${QUEUE_TABLE} (
            orthanc_instance_id, study_instance_uid, accession_number,
            payload, status, created_at, attempts, event_key
        ) VALUES ($1, $2, $3, $4, 'pending', NOW(), 0, $5)
        ON CONFLICT (event_key) DO NOTHING
    `, [
        orthancInstanceId || null,
        studyInstanceUid || null,
        accessionNumber || null,
        JSON.stringify(payload), eventKey
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
        await client.query(`UPDATE ${QUEUE_TABLE}
            SET status = 'failed', error = 'Reconciliation lease expired', processed_at = NOW()
            WHERE status = 'processing' AND processing_started_at < NOW() - INTERVAL '10 minutes'`);

        const selectResult = await client.query(`
            SELECT id, payload, attempts FROM ${QUEUE_TABLE}
            WHERE status = 'pending' OR (status = 'failed' AND attempts < 5
                AND processed_at < NOW() - (LEAST(300, POWER(2, attempts)) * INTERVAL '1 second'))
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        `, [batchSize]);

        if (selectResult.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }

        for (const row of selectResult.rows) {
            jobs.push({ id: row.id, payload: row.payload, attempt: row.attempts + 1 });
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
        const heartbeat = setInterval(() => {
            db.query(`UPDATE ${QUEUE_TABLE} SET processing_started_at = NOW()
                WHERE id = $1 AND status = 'processing' AND attempts = $2`, [job.id, job.attempt])
                .catch(error => logger.warn('[PACSQueue] Heartbeat failed', { jobId: job.id, error: error.message }));
        }, 30000);
        heartbeat.unref?.();
        try {
            let payload = job.payload;
            let result;
            const instanceId = payload.OrthancInstanceId || payload.orthancInstanceId;
            if (instanceId) {
                const { url, username, password } = await require('./orthancConnectionService').getOrthancConnection();
                const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') };
                const info = await fetch(`${url}/instances/${encodeURIComponent(instanceId)}`, { headers, signal: AbortSignal.timeout(15000) });
                if (info.status === 404) result = { status: 'ignored', reason: 'INSTANCE_REMOVED' };
                else {
                    if (!info.ok) throw new Error(`Archive instance lookup failed (${info.status})`);
                    const tags = await fetch(`${url}/instances/${encodeURIComponent(instanceId)}/tags?simplify`, { headers, signal: AbortSignal.timeout(15000) });
                    if (!tags.ok) throw new Error(`Archive instance metadata failed (${tags.status})`);
                    const instanceInfo = await info.json();
                    payload = { ...payload, ...await tags.json(), FileSize: instanceInfo.FileSize, OrthancStudyId: instanceInfo.ParentStudy };
                }
            }
            result ||= await reconcileInstance(db, payload, { remoteIp: null });

            await db.query(
                `UPDATE ${QUEUE_TABLE} SET status = 'completed', result = $1, processed_at = NOW(), error = NULL
                 WHERE id = $2 AND status = 'processing' AND attempts = $3`,
                [JSON.stringify(result), job.id, job.attempt]
            );

            logger.info('[PACSQueue] Reconciliation completed', { jobId: job.id });
        } catch (err) {
            logger.error('[PACSQueue] Reconciliation failed', { jobId: job.id, error: err.message });
            await db.query(
                `UPDATE ${QUEUE_TABLE} SET status = 'failed', error = $1, processed_at = NOW()
                 WHERE id = $2 AND status = 'processing' AND attempts = $3`,
                [err.message, job.id, job.attempt]
            );
        } finally { clearInterval(heartbeat); }
    }
}

/**
 * Start the background worker that polls the queue.
 * @param {object} db - Database pool
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {object} { stop } — call stop() to halt the worker
 */
function startWorker(db, intervalMs = DEFAULT_INTERVAL_MS) {
    let running = false;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            try { await require('./pacsArchiveSyncService').pollOrthancChanges(db); }
            catch (error) { logger.warn('[PACSQueue] Archive catch-up unavailable', { error: error.message }); }
            await processQueue(db);
        } finally { running = false; }
    };
    const timer = setInterval(() => {
        run().catch(err => {
            logger.error('[PACSQueue] Worker error', { error: err.message });
        });
    }, intervalMs);

    // Run immediately on startup
    run().catch(err => {
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
