const IntegrationService = require('../services/integrationService');
const { scheduleJob } = require('../services/notificationJobService');

const notifyDeadLetterAdmins = async (pool, task, error) => {
    const [integrationResult, adminsResult] = await Promise.all([
        pool.query('SELECT provider_name FROM integrations WHERE integration_id = $1', [task.integration_id]),
        pool.query("SELECT user_id, role FROM users WHERE role IN ('Admin', 'Developer') AND is_active = TRUE")
    ]);
    const providerName = integrationResult.rows[0]?.provider_name || 'Unknown provider';
    const body = `Integration failure: ${providerName} event ${task.event_type} failed after max retries. Log ID: ${task.log_id}. Error: ${error.message}`;

    for (const admin of adminsResult.rows) {
        await scheduleJob(pool, {
            eventType: 'INTEGRATION_FAILED',
            channel: 'InApp',
            recipientType: 'Staff',
            recipientId: admin.user_id,
            entityType: 'Integration',
            entityId: task.integration_id,
            idempotencyKey: `integration-dead-letter:${task.log_id}:${admin.user_id}`,
            priority: 'Critical',
            variables: {
                role: admin.role,
                notification_subject: 'Integration delivery failed',
                notification_body: body,
                force_delivery: true,
                integration_log_id: task.log_id
            }
        });
    }
};

const processIntegrationQueue = async (pool, service = new IntegrationService(pool)) => {
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
            WHERE (status = 'Pending' OR (status = 'Failed' AND retry_count < max_retries))
              AND event_type IN ('Outbound SMS', 'Outbound WhatsApp')
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
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
            const retryResult = await service.retryEvent(task.log_id);
            console.log(`[Worker] Successfully processed log ${task.log_id}${retryResult.deduped ? ' (deduped)' : ''}`);
        } catch (err) {
            console.error(`[Worker] Failed to process log ${task.log_id}: ${err.message}`);
            const statusResult = await pool.query(
                'SELECT status FROM integration_logs WHERE log_id = $1',
                [task.log_id]
            );
            if (statusResult.rows[0]?.status === 'DeadLetter') {
                try {
                    await notifyDeadLetterAdmins(pool, task, err);
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
    return { processed: tasks.length, deadLetters: deadLetters.length };
};

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
            await processIntegrationQueue(pool, service);
        } catch (error) {
            console.error('[Worker] Error querying integration queue:', error.message);
        }
    }, INTERVAL_MS);
    return () => clearInterval(interval);
};

module.exports = { startIntegrationWorker, processIntegrationQueue, notifyDeadLetterAdmins };
