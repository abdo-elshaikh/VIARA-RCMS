const IntegrationService = require('../services/integrationService');

/**
 * Background worker to process pending integration logs and retry failed ones.
 * Handles dead-letter events and emits notifications for persistent failures.
 */
const startIntegrationWorker = (pool) => {
    const service = new IntegrationService(pool);
    const INTERVAL_MS = 5 * 60 * 1000;

    console.log('[Worker] Integration Queue Worker started. Polling every 5 minutes.');

    const interval = setInterval(async () => {
        try {
            await pool.query(`
                UPDATE integration_logs
                SET status = 'Failed', error_message = COALESCE(error_message, 'Recovered abandoned processing task')
                WHERE status = 'Processing' AND updated_at < NOW() - INTERVAL '15 minutes'
            `);

            const result = await pool.query(`
                UPDATE integration_logs
                SET status = 'Processing', updated_at = NOW()
                WHERE log_id IN (
                    SELECT log_id
                    FROM integration_logs
                    WHERE status = 'Pending'
                       OR (status = 'Failed' AND retry_count < max_retries)
                    ORDER BY created_at ASC
                    LIMIT 10
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING log_id, integration_id, event_type, retry_count, max_retries
            `);

            const tasks = result.rows;

            if (tasks.length > 0) {
                console.log(`[Worker] Found ${tasks.length} integration tasks to process.`);
            }

            for (const task of tasks) {
                try {
                    const result = await service.retryEvent(task.log_id);
                    console.log(`[Worker] Successfully processed log ${task.log_id}${result.deduped ? ' (deduped)' : ''}`);
                } catch (err) {
                    console.error(`[Worker] Failed to process log ${task.log_id}: ${err.message}`);

                    const finalRetry = task.retry_count + 1 >= (task.max_retries || 3);
                    if (finalRetry) {
                        try {
                            const integration = await service.getProviderConfig(
                                (await pool.query('SELECT provider_name FROM integrations WHERE integration_id = $1', [task.integration_id])).rows[0]?.provider_name
                            );
                            if (integration) {
                                await pool.query(`
                                    INSERT INTO notifications (recipient, type, channel, content, status, event_type, entity_id, audience_type, priority, error_message)
                                    SELECT u.email_enc, 'InApp', 'InApp', $1, 'Pending', 'INTEGRATION_FAILED', $2, 'Staff', 'Warning', $3
                                    FROM users u
                                    WHERE u.role = 'Admin' AND u.is_active = TRUE
                                `, [
                                    `Integration failure: ${integration.provider_name} event ${task.event_type} failed after max retries. Log ID: ${task.log_id}`,
                                    task.integration_id,
                                    err.message
                                ]);
                            }
                        } catch (notifErr) {
                            console.error(`[Worker] Failed to create failure notification: ${notifErr.message}`);
                        }
                    }
                }
            }

            const deadLetters = await service.getDeadLetterEvents(50, 0);
            if (deadLetters.length > 0) {
                console.warn(`[Worker] ${deadLetters.length} events in dead-letter queue. Admin action required.`);
            }
        } catch (error) {
            console.error('[Worker] Error querying integration queue:', error.message);
        }
    }, INTERVAL_MS);
    return () => clearInterval(interval);
};

module.exports = { startIntegrationWorker };
