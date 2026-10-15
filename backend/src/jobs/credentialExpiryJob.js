// Daily sweep that warns HR/Admin about staff licenses and certifications
// approaching expiry. Radiology practices must not discover an expired
// license during an audit — the warning windows are 30 days (warning) and
// 7 days (action), throttled by last_expiry_notified_at so each window
// notifies at most once.
const logger = require('../config/logger');
const { triggerEventForRole } = require('../services/notificationJobService');

const INTERVAL_MS = Number(process.env.CREDENTIAL_CHECK_INTERVAL_MS || 24 * 60 * 60 * 1000);
const WARNING_WINDOW_DAYS = Math.max(Number(process.env.CREDENTIAL_WARNING_DAYS || 30), 1);
const URGENT_WINDOW_DAYS = Math.max(Number(process.env.CREDENTIAL_URGENT_DAYS || 7), 1);
const THROTTLE_MS = 10 * 24 * 60 * 60 * 1000;

const notifyExpiringCredentials = async (db) => {
    const due = await db.query(`
        SELECT c.credential_id, c.credential_type, c.credential_number, c.expires_at,
               c.last_expiry_notified_at, u.full_name AS employee_name
        FROM staff_credentials c
        JOIN users u ON u.user_id = c.user_id
        WHERE c.expires_at <= (CURRENT_DATE + ($1::int * INTERVAL '1 day'))
          AND (c.last_expiry_notified_at IS NULL OR c.last_expiry_notified_at < NOW() - ($2::bigint * INTERVAL '1 millisecond'))
        ORDER BY c.expires_at ASC
        LIMIT 200
    `, [WARNING_WINDOW_DAYS, THROTTLE_MS]);

    let notified = 0;
    for (const row of due.rows) {
        const daysLeft = Math.ceil((new Date(row.expires_at) - Date.now()) / (24 * 60 * 60 * 1000));
        const urgent = daysLeft <= URGENT_WINDOW_DAYS;
        try {
            for (const role of ['Admin', 'HR']) {
                await triggerEventForRole(db, 'CredentialExpiring', role, {
                    entityType: 'StaffCredential',
                    entityId: row.credential_id,
                    priority: urgent ? 'Action' : 'Warning',
                    variables: {
                        employee_name: row.employee_name,
                        credential_type: row.credential_type,
                        credential_number: row.credential_number || '',
                        expires_at: row.expires_at,
                        days_left: daysLeft
                    }
                });
            }
            await db.query(
                'UPDATE staff_credentials SET last_expiry_notified_at = NOW() WHERE credential_id = $1',
                [row.credential_id]
            );
            notified += 1;
        } catch (error) {
            logger.error('Failed to send credential expiry notification', {
                credentialId: row.credential_id,
                error: error.message,
            });
        }
    }
    return { scanned: due.rows.length, notified };
};

let inFlight = false;

const runOnce = async (pool) => {
    if (inFlight) return { skipped: true, reason: 'already_running' };
    inFlight = true;
    try {
        const result = await notifyExpiringCredentials(pool);
        if (result.notified > 0) {
            logger.warn('Credential expiry sweep notified stakeholders', result);
        } else {
            logger.debug('Credential expiry sweep completed', result);
        }
        return result;
    } catch (error) {
        logger.error('Credential expiry sweep failed', { error: error.message, stack: error.stack });
        return { error: error.message };
    } finally {
        inFlight = false;
    }
};

const startCredentialExpiryJob = (pool) => {
    if (String(process.env.CREDENTIAL_CHECK_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('Credential expiry job disabled (CREDENTIAL_CHECK_ENABLED=false)');
        return () => {};
    }

    logger.info(`Credential expiry job started. Sweeping every ${Math.round(INTERVAL_MS / 3600000)} hours.`);
    const timeout = setTimeout(() => runOnce(pool), 5 * 60 * 1000);
    const interval = setInterval(() => runOnce(pool), INTERVAL_MS);
    return () => {
        clearTimeout(timeout);
        clearInterval(interval);
    };
};

module.exports = {
    startCredentialExpiryJob,
    runOnce,
    notifyExpiringCredentials,
    WARNING_WINDOW_DAYS,
    URGENT_WINDOW_DAYS,
};
