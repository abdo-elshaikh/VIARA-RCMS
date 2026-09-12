// Shift guard: periodic sweep that settles operational records employees
// abandoned (attendance sessions never clocked out, reception shifts whose
// owner stopped sending heartbeats). Without this sweep those records rely on
// lazy handling at the employee's next action and can block desks or distort
// hourly payroll indefinitely.
const logger = require('../config/logger');
const { logSystemAuditEvent } = require('../services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../services/auditTaxonomy');
const { triggerEvent } = require('../services/notificationJobService');
const { cleanupExpiredReceptionTasks } = require('../services/receptionTaskService');
const { buildShiftMetrics } = require('../controllers/receptionShiftController');

const INTERVAL_MS = Number(process.env.SHIFT_GUARD_INTERVAL_MS || 15 * 60 * 1000);
const ATTENDANCE_STALE_HOURS = Math.max(Number(process.env.ATTENDANCE_STALE_HOURS || 24), 1);
const RECEPTION_ABANDONED_MINUTES = Math.max(Number(process.env.RECEPTION_SHIFT_ABANDONED_MINUTES || 45), 10);
const CASHIER_ABANDONED_HOURS = Math.max(Number(process.env.CASHIER_SHIFT_ABANDONED_HOURS || 16), 4);

// Mirrors the controller's lazy cap so the job and the API cannot disagree on
// how an abandoned session is settled.
const settleStaleAttendanceSessions = async (db) => {
    const stale = await db.query(`
        SELECT a.log_id, a.user_id, u.role, u.full_name
        FROM attendance_logs a
        JOIN users u ON u.user_id = a.user_id
        WHERE a.clock_out IS NULL
          AND a.clock_in < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour')
        ORDER BY a.clock_in ASC
        LIMIT 100
    `, [ATTENDANCE_STALE_HOURS]);

    let settled = 0;
    for (const row of stale.rows) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [row.user_id]);
            const result = await client.query(`
                UPDATE attendance_logs a
                SET clock_out = GREATEST(
                        a.clock_in,
                        LEAST(
                            CURRENT_TIMESTAMP,
                            COALESCE((SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id), a.clock_in + interval '16 hours')
                        )
                    ),
                    notes = CONCAT_WS(E'\n', NULLIF(a.notes, ''), '[shift-guard] Stale attendance session automatically capped'),
                    corrected_at = CURRENT_TIMESTAMP
                WHERE a.log_id = $1
                  AND a.clock_out IS NULL
                RETURNING a.*
            `, [row.log_id]);
            if (result.rows.length) {
                await logSystemAuditEvent(client, {
                    eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
                    jobName: 'shift-guard',
                    sourceSystem: 'shift-guard-job',
                    target: { type: 'attendance_logs', id: row.log_id },
                    details: {
                        action: 'ATTENDANCE_STALE_SESSION_CLOSED',
                        userId: row.user_id,
                        clockIn: result.rows[0].clock_in,
                        clockOut: result.rows[0].clock_out,
                        staleHours: ATTENDANCE_STALE_HOURS,
                    },
                    riskScore: 20,
                    riskReason: 'Abandoned attendance session was automatically capped.',
                });
            }
            await client.query('COMMIT');
            if (result.rows.length) {
                settled += 1;
                triggerEvent(db, 'ATTENDANCE_SESSION_AUTO_CAPPED', {
                    staffId: row.user_id,
                    staffRole: row.role,
                    entityType: 'AttendanceLog',
                    entityId: row.log_id,
                    variables: {
                        employee_name: row.full_name,
                        clock_in: result.rows[0].clock_in,
                        clock_out: result.rows[0].clock_out,
                    }
                }).catch(() => {});
            }
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logger.error('Shift guard failed to settle a stale attendance session', {
                logId: row.log_id,
                error: error.message,
            });
        } finally {
            client.release();
        }
    }
    return { scanned: stale.rows.length, settled };
};

const settleUnattendedShifts = async (db) => {
    // Look for shifts concluded in the last 7 days that ended at least 30 minutes ago,
    // where no attendance log was registered and the employee has no approved leave.
    const unattended = await db.query(`
        SELECT s.shift_id, s.user_id, s.start_time, s.end_time, u.full_name, u.role
        FROM staff_shifts s
        JOIN users u ON u.user_id = s.user_id
        WHERE s.end_time < CURRENT_TIMESTAMP - interval '30 minutes'
          AND s.start_time >= CURRENT_TIMESTAMP - interval '7 days'
          AND NOT EXISTS (
              SELECT 1 FROM attendance_logs a WHERE a.shift_id = s.shift_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM leave_requests l
              WHERE l.user_id = s.user_id
                AND l.status = 'Approved'
                AND l.start_date <= s.start_time::date
                AND l.end_date >= s.start_time::date
          )
        ORDER BY s.end_time ASC
        LIMIT 50
    `);

    let marked = 0;
    for (const shift of unattended.rows) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 11705))', [shift.user_id]);

            const check = await client.query('SELECT log_id FROM attendance_logs WHERE shift_id = $1 LIMIT 1', [shift.shift_id]);
            if (check.rows.length > 0) {
                await client.query('ROLLBACK');
                continue;
            }

            const inserted = await client.query(`
                INSERT INTO attendance_logs (
                    user_id, clock_in, clock_out, shift_id, status, notes,
                    late_minutes, early_leave_minutes, shift_link_type,
                    scheduled_start_snapshot, scheduled_end_snapshot
                ) VALUES (
                    $1, $2, $3, $4, 'Absent',
                    '[shift-guard] Shift ended without attendance - automatically marked Absent',
                    0, 0, 'Auto', $2, $3
                ) RETURNING *
            `, [shift.user_id, shift.start_time, shift.end_time, shift.shift_id]);

            const logId = inserted.rows[0].log_id;

            await client.query(`
                INSERT INTO attendance_audit_ledger (
                    log_id, user_id, actor_user_id, action_type,
                    previous_state, new_state, reason, is_violation, violation_details
                ) VALUES (
                    $1, $2, $2, 'AUTO_ABSENT',
                    NULL, $3, 'Shift concluded without attendance', TRUE,
                    '{"unattended": true}'::jsonb
                )
            `, [logId, shift.user_id, JSON.stringify(inserted.rows[0])]);

            await logSystemAuditEvent(client, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
                jobName: 'shift-guard',
                sourceSystem: 'shift-guard-job',
                target: { type: 'attendance_logs', id: logId },
                details: {
                    action: 'ATTENDANCE_AUTO_ABSENT',
                    userId: shift.user_id,
                    shiftId: shift.shift_id,
                    startTime: shift.start_time,
                    endTime: shift.end_time
                },
                riskScore: 30,
                riskReason: 'Unattended shift was automatically marked Absent.'
            });

            await client.query('COMMIT');
            marked += 1;

            triggerEvent(db, 'AttendanceAutoAbsent', {
                staffId: shift.user_id,
                staffRole: shift.role,
                entityType: 'AttendanceLog',
                entityId: logId,
                variables: {
                    employee_name: shift.full_name,
                    shift_date: new Date(shift.start_time).toISOString().slice(0, 10)
                }
            }).catch(() => {});

        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            logger.error('Shift guard failed to mark unattended shift as absent', {
                shiftId: shift.shift_id,
                error: err.message
            });
        } finally {
            client.release();
        }
    }

    return { scanned: unattended.rows.length, marked };
};

// Release expired leases, then close the shift the same way the API does so
// the desk/scope unique indexes free up for the next receptionist.
const closeAbandonedReceptionShifts = async (db) => {
    const candidates = await db.query(`
        SELECT session_id
        FROM reception_shift_sessions
        WHERE status = 'Open'
          AND last_heartbeat_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 minute')
        ORDER BY started_at ASC
        LIMIT 50
    `, [RECEPTION_ABANDONED_MINUTES]);

    const abandonedBefore = new Date(Date.now() - RECEPTION_ABANDONED_MINUTES * 60 * 1000);
    let closed = 0;
    const skipped = [];
    for (const candidate of candidates.rows) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const current = await client.query(`
                SELECT * FROM reception_shift_sessions
                WHERE session_id = $1
                FOR UPDATE
            `, [candidate.session_id]);
            const shift = current.rows[0];
            if (!shift || shift.status !== 'Open' || new Date(shift.last_heartbeat_at) >= abandonedBefore) {
                await client.query('ROLLBACK');
                continue;
            }

            // Leases (15 minutes) expired long before the heartbeat threshold,
            // so this only releases stragglers and unassigns appointments.
            await cleanupExpiredReceptionTasks(client);
            const active = await client.query(`
                SELECT COUNT(*)::int AS active
                FROM reception_work_items
                WHERE shift_session_id = $1
                  AND status IN ('Claimed', 'In_Progress')
            `, [shift.session_id]);
            if (Number(active.rows[0]?.active || 0) > 0) {
                skipped.push({ sessionId: shift.session_id, activeTasks: Number(active.rows[0].active) });
                await client.query('ROLLBACK');
                continue;
            }

            const metrics = await buildShiftMetrics(client, shift);
            const result = await client.query(`
                UPDATE reception_shift_sessions
                SET status = 'Closed',
                    ended_at = CURRENT_TIMESTAMP,
                    closing_notes = CONCAT_WS(E'\n', NULLIF(closing_notes, ''),
                        $2),
                    metrics = $3::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE session_id = $1
                RETURNING *
            `, [shift.session_id, `[shift-guard] Automatically closed after ${RECEPTION_ABANDONED_MINUTES} minutes without a heartbeat`, JSON.stringify(metrics)]);

            await logSystemAuditEvent(client, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
                jobName: 'shift-guard',
                sourceSystem: 'shift-guard-job',
                target: { type: 'reception_shift_sessions', id: shift.session_id },
                details: {
                    action: 'RECEPTION_SHIFT_AUTO_CLOSED',
                    userId: shift.user_id,
                    desk: shift.desk_identifier,
                    scope: shift.scope,
                    abandonedMinutes: RECEPTION_ABANDONED_MINUTES,
                    metrics,
                },
                riskScore: 20,
                riskReason: 'Abandoned reception shift was automatically closed after heartbeat timeout.',
            });
            await client.query('COMMIT');
            closed += 1;

            triggerEvent(db, 'RECEPTION_SHIFT_AUTO_CLOSED', {
                staffId: shift.user_id,
                staffRole: 'Receptionist',
                entityType: 'ReceptionShiftSession',
                entityId: shift.session_id,
                variables: {
                    desk_identifier: shift.desk_identifier,
                    abandoned_minutes: RECEPTION_ABANDONED_MINUTES,
                }
            }).catch(() => {});
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logger.error('Shift guard failed to close an abandoned reception shift', {
                sessionId: candidate.session_id,
                error: error.message,
            });
        } finally {
            client.release();
        }
    }
    return { scanned: candidates.rows.length, closed, skipped };
};

const flagAbandonedCashierShifts = async (db) => {
    const staleShifts = await db.query(`
        SELECT s.shift_id, s.cashier_id, s.business_date, s.opened_at, u.full_name AS cashier_name
        FROM cashier_shifts s
        JOIN users u ON u.user_id = s.cashier_id
        WHERE s.status = 'Open'
          AND (
              s.opened_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 hour')
              OR s.business_date < CURRENT_DATE
          )
        ORDER BY s.opened_at ASC
        LIMIT 50
    `, [CASHIER_ABANDONED_HOURS]);

    let flagged = 0;
    for (const shift of staleShifts.rows) {
        flagged += 1;
        await logSystemAuditEvent(db, {
            eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
            jobName: 'shift-guard',
            sourceSystem: 'shift-guard-job',
            target: { type: 'cashier_shifts', id: shift.shift_id },
            details: {
                action: 'CASHIER_SHIFT_ABANDONED_FLAGGED',
                cashierId: shift.cashier_id,
                cashierName: shift.cashier_name,
                businessDate: shift.business_date,
                openedAt: shift.opened_at,
                abandonedHours: CASHIER_ABANDONED_HOURS,
            },
            riskScore: 40,
            riskReason: 'Cashier shift has been open across business date boundary or exceeded abandonment threshold.',
        }).catch(() => {});
    }
    return { scanned: staleShifts.rows.length, flagged };
};

let inFlight = false;

const runOnce = async (pool) => {
    if (inFlight) return { skipped: true, reason: 'already_running' };
    inFlight = true;
    try {
        const attendance = await settleStaleAttendanceSessions(pool);
        const unattended = await settleUnattendedShifts(pool);
        const reception = await closeAbandonedReceptionShifts(pool);
        const cashier = await flagAbandonedCashierShifts(pool);
        const result = { attendance, unattended, reception, cashier };

        if (attendance.settled > 0 || unattended.marked > 0 || reception.closed > 0 || reception.skipped.length > 0 || cashier.flagged > 0) {
            logger.warn('Shift guard settled abandoned operational records', result);
            await logSystemAuditEvent(pool, {
                eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED,
                jobName: 'shift-guard',
                sourceSystem: 'shift-guard-job',
                details: result,
            });
        } else {
            logger.debug('Shift guard completed without action', result);
        }
        return result;
    } catch (error) {
        logger.error('Shift guard sweep failed', { error: error.message, stack: error.stack });
        await logSystemAuditEvent(pool, {
            eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_FAILED,
            jobName: 'shift-guard',
            sourceSystem: 'shift-guard-job',
            outcome: AUDIT_OUTCOME.FAILURE,
            details: { error: error.message },
            riskScore: 85,
            riskReason: 'Scheduled shift guard sweep failed.',
        });
        return { error: error.message };
    } finally {
        inFlight = false;
    }
};

const startShiftGuardJob = (pool) => {
    if (String(process.env.SHIFT_GUARD_ENABLED || 'true').toLowerCase() === 'false') {
        logger.info('Shift guard job disabled (SHIFT_GUARD_ENABLED=false)');
        return () => {};
    }

    logger.info(`Shift guard job started. Sweeping every ${Math.round(INTERVAL_MS / 60000)} min.`);
    const timeout = setTimeout(() => runOnce(pool), 90 * 1000);
    const interval = setInterval(() => runOnce(pool), INTERVAL_MS);
    return () => {
        clearTimeout(timeout);
        clearInterval(interval);
    };
};

module.exports = {
    startShiftGuardJob,
    runOnce,
    settleStaleAttendanceSessions,
    settleUnattendedShifts,
    closeAbandonedReceptionShifts,
    flagAbandonedCashierShifts,
    ATTENDANCE_STALE_HOURS,
    RECEPTION_ABANDONED_MINUTES,
    CASHIER_ABANDONED_HOURS,
};
