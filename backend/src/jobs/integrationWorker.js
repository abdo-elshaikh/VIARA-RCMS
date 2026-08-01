const IntegrationService = require('../services/integrationService');

/**
 * Background worker to process pending integration logs and retry failed ones.
 */
const startIntegrationWorker = (pool) => {
    const service = new IntegrationService(pool);
    const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    console.log('[Worker] Integration Queue Worker started. Polling every 5 minutes.');

    const interval = setInterval(async () => {
        try {
            await pool.query(`
                UPDATE integration_logs
                SET status = 'Failed', error_message = COALESCE(error_message, 'Recovered abandoned processing task')
                WHERE status = 'Processing' AND updated_at < NOW() - INTERVAL '15 minutes'
            `);

            // Claim work in one statement so multiple application replicas do
            // not deliver the same external side effect.
            const result = await pool.query(`
                UPDATE integration_logs
                SET status = 'Processing', updated_at = NOW()
                WHERE log_id IN (
                    SELECT log_id
                    FROM integration_logs
                    WHERE status = 'Pending'
                       OR (status = 'Failed' AND retry_count < 3)
                    ORDER BY created_at ASC
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING log_id
            `);

            const tasks = result.rows;

            if (tasks.length > 0) {
                console.log(`[Worker] Found ${tasks.length} integration tasks to process.`);
            }

            for (const task of tasks) {
                try {
                    await service.retryEvent(task.log_id);
                    console.log(`[Worker] Successfully processed log ${task.log_id}`);
                } catch (err) {
                    console.error(`[Worker] Failed to process log ${task.log_id}: ${err.message}`);
                }
            }

        } catch (error) {
            console.error('[Worker] Error querying integration queue:', error.message);
        }
    }, INTERVAL_MS);
    return () => clearInterval(interval);
};

module.exports = { startIntegrationWorker };
