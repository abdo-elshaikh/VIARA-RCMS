const logger = require('../config/logger');
const { logSystemAuditEvent } = require('./systemAuditService');
const { logAction } = require('./auditService');
const { AUDIT_EVENT_CODES } = require('./auditTaxonomy');
const { AppError } = require('../middleware/errorHandler');
const { triggerEventForRole, triggerEvent, scheduleAppointmentReminder, cancelPendingAppointmentReminders } = require('./notificationJobService');
const { triggerMwlRegeneration } = require('./pacsMwlService');
const { assertAppointmentScheduleRules } = require('./schedulingService');
const { syncInvoicesAfterAppointmentReschedule } = require('./insuranceAuthorizationService');

const PENDING_STAGES = Object.freeze(['Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam']);
const CENTER_TIMEZONE_SQL = `COALESCE(NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''), 'Africa/Cairo')`;
const getTargetDate = (date) => date || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

// ─── getPendingExams ──────────────────────────────────────────────────────────
const getPendingExams = async (db, opts = {}) => {
    const date = getTargetDate(opts.date);
    const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
    const offset = Math.max(Number(opts.offset) || 0, 0);
    const values = [date, PENDING_STAGES];
    let sessionFilter = '';
    let receptionistFilter = '';

    // If sessionId provided, filter by that shift session
    if (opts.sessionId) {
        values.push(opts.sessionId);
        sessionFilter = `AND EXISTS (
            SELECT 1 FROM reception_work_items rwi
            WHERE rwi.appointment_id = a.appointment_id
              AND rwi.shift_session_id = $3::uuid
              AND rwi.work_item_id = (
                  SELECT latest.work_item_id FROM reception_work_items latest
                  WHERE latest.appointment_id = a.appointment_id
                  ORDER BY latest.created_at DESC, latest.work_item_id DESC
                  LIMIT 1
              )
        )`;
    }
    // A receptionist may only review appointments currently assigned to them.
    // This filter is independent from the shift filter so a supplied session id
    // can never be used to escape ownership scoping.
    if (opts.receptionistId && opts.actorRole === 'Receptionist') {
        values.push(opts.receptionistId);
        const userParam = `$${values.length}::uuid`;
        if (opts.sessionId) {
            receptionistFilter = `AND a.receptionist_id = ${userParam} AND EXISTS (SELECT 1 FROM reception_shift_sessions rss WHERE rss.session_id = $3::uuid AND rss.user_id = ${userParam})`;
        } else {
            receptionistFilter = `AND a.receptionist_id = ${userParam}`;
        }
    }

    const limitIndex = values.length + 1;
    const offsetIndex = values.length + 2;
    values.push(limit, offset);
    const where = `a.start_time >= ($1::date::timestamp AT TIME ZONE ${CENTER_TIMEZONE_SQL}) AND a.start_time < (($1::date + 1)::timestamp AT TIME ZONE ${CENTER_TIMEZONE_SQL}) AND a.status NOT IN ('Cancelled', 'No-Show', 'Completed') AND e.queue_stage = ANY($2::text[]) AND e.status IN ('Scheduled', 'Checked-in') ${sessionFilter} ${receptionistFilter}`;
    const [dataResult, countResult] = await Promise.all([
        db.query(`
            SELECT e.exam_id, e.appointment_id, e.queue_stage, e.status AS exam_status, e.created_at,
                   e.arrived_at, e.prep_started_at, e.prep_completed_at, e.report_request_status,
                   a.start_time AS appointment_time, a.order_number, a.status AS appointment_status, a.priority,
                   a.receptionist_id, a.receptionist_desk, rec.full_name AS receptionist_name,
                   et.name AS exam_type, m.name AS modality_name, p.mrn,
                   p.first_name_enc, p.last_name_enc, rd.full_name AS referring_doctor_name
            FROM examinations e
            JOIN appointments a ON a.appointment_id = e.appointment_id
            JOIN patients p ON p.patient_id = e.patient_id
            LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
            LEFT JOIN modalities m ON m.modality_id = e.modality_id
            LEFT JOIN referring_doctors rd ON rd.doctor_id = e.external_referring_doctor_id
            LEFT JOIN users rec ON rec.user_id = a.receptionist_id
            WHERE ${where}
            ORDER BY a.start_time ASC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `, values),
        db.query(`SELECT COUNT(*)::int AS total FROM examinations e JOIN appointments a ON a.appointment_id = e.appointment_id WHERE ${where}`, values.slice(0, values.length - 2))
    ]);
    return { rows: dataResult.rows, total: countResult.rows[0]?.total || 0 };
};

const getDaySummary = async (db, date, opts = {}) => {
    const targetDate = getTargetDate(date);
    const values = [targetDate, PENDING_STAGES];
    let receptionistFilter = '';
    let sessionFilter = '';
    if (opts.sessionId) {
        values.push(opts.sessionId);
        sessionFilter = `AND EXISTS (
            SELECT 1 FROM reception_work_items rwi
            WHERE rwi.appointment_id = a.appointment_id
              AND rwi.shift_session_id = $${values.length}::uuid
              AND rwi.work_item_id = (
                  SELECT latest.work_item_id FROM reception_work_items latest
                  WHERE latest.appointment_id = a.appointment_id
                  ORDER BY latest.created_at DESC, latest.work_item_id DESC
                  LIMIT 1
              )
        )`;
    }
    if (opts.receptionistId && opts.actorRole === 'Receptionist' && opts.sessionId) {
        values.push(opts.receptionistId);
        receptionistFilter = `AND EXISTS (
            SELECT 1 FROM reception_shift_sessions rss
            WHERE rss.session_id = $${values.length - 1}::uuid
              AND rss.user_id = $${values.length}::uuid
        )`;
    } else if (opts.receptionistId && opts.actorRole === 'Receptionist') {
        values.push(opts.receptionistId);
        receptionistFilter = `AND a.receptionist_id = $${values.length}::uuid`;
    }
    const result = await db.query(`
        SELECT COUNT(*) FILTER (WHERE a.status NOT IN ('Cancelled', 'No-Show'))::int AS total,
               COUNT(*) FILTER (WHERE e.queue_stage IN ('Finalized', 'Delivered', 'Images Delivered'))::int AS finalized,
               COUNT(*) FILTER (WHERE e.queue_stage IN ('Delivered', 'Images Delivered'))::int AS delivered,
               COUNT(*) FILTER (WHERE a.status IN ('Cancelled', 'No-Show'))::int AS cancelled,
               COUNT(*) FILTER (WHERE e.queue_stage = 'Reporting')::int AS reporting,
               COUNT(*) FILTER (WHERE e.queue_stage = 'In Exam')::int AS in_exam,
               COUNT(*) FILTER (WHERE e.exam_completed_at IS NOT NULL AND a.status NOT IN ('Cancelled', 'No-Show'))::int AS completed,
               COUNT(*) FILTER (WHERE e.queue_stage = ANY($2::text[]) AND e.status IN ('Scheduled', 'Checked-in') AND a.status NOT IN ('Cancelled', 'No-Show'))::int AS pending,
               COUNT(*) FILTER (WHERE e.priority IN ('Urgent', 'Emergency'))::int AS urgent_total,
               COUNT(*) FILTER (WHERE e.priority IN ('Urgent', 'Emergency') AND e.queue_stage = ANY($2::text[]))::int AS urgent_pending
        FROM examinations e JOIN appointments a ON a.appointment_id = e.appointment_id
        WHERE a.start_time >= ($1::date::timestamp AT TIME ZONE ${CENTER_TIMEZONE_SQL})
          AND a.start_time < (($1::date + 1)::timestamp AT TIME ZONE ${CENTER_TIMEZONE_SQL})
          ${receptionistFilter}
          ${sessionFilter}
    `, values);
    const row = result.rows[0] || {};
    const completed = Number(row.completed || 0);
    return { ...row, completed, completionRate: Number(row.total) > 0 ? Math.round((completed / Number(row.total)) * 100) : 0, date: targetDate };
};

const resolveExam = async (db, opts) => {
    const { appointmentId, action, newDate, newTime, notes, actorUserId, actorRole, sessionId } = opts;
    if (!['no_show', 'carry_forward', 'reschedule'].includes(action)) throw new Error(`Invalid action: ${action}`);
    if (action === 'reschedule' && !newDate) throw new Error('newDate is required for reschedule action');
    if (action === 'reschedule') {
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(newDate)) ? new Date(`${newDate}T00:00:00.000Z`) : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== newDate) {
            throw new AppError('newDate must be a valid date in YYYY-MM-DD format', 400);
        }
    }
    if (action === 'reschedule' && newTime && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(newTime))) throw new AppError('newTime must use HH:mm or HH:mm:ss format', 400);
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const locked = await client.query(`
            SELECT e.exam_id, e.queue_stage, e.current_station, e.status AS exam_status, a.*,
                   TO_CHAR(a.start_time AT TIME ZONE ${CENTER_TIMEZONE_SQL}, 'YYYY-MM-DD') AS local_start_date,
                   TO_CHAR(a.start_time AT TIME ZONE ${CENTER_TIMEZONE_SQL}, 'HH24:MI:SS') AS local_start_time
            FROM examinations e JOIN appointments a ON a.appointment_id = e.appointment_id
            WHERE a.appointment_id = $1 FOR UPDATE OF e, a
        `, [appointmentId]);
        const entry = locked.rows[0];
        if (!entry) throw new Error('Pending examination not found');
        if (actorRole === 'Receptionist') {
            if (sessionId) {
                const sessionAccess = await client.query(`
                    SELECT 1
                    FROM reception_shift_sessions rss
                    JOIN reception_work_items rwi ON rwi.shift_session_id = rss.session_id
                    WHERE rss.session_id = $1::uuid AND rss.user_id = $2::uuid
                      AND rwi.appointment_id = $3::uuid
                      AND rwi.work_item_id = (
                          SELECT latest.work_item_id FROM reception_work_items latest
                          WHERE latest.appointment_id = $3::uuid
                          ORDER BY latest.created_at DESC, latest.work_item_id DESC
                          LIMIT 1
                      )
                    LIMIT 1
                `, [sessionId, actorUserId, appointmentId]);
                if (!sessionAccess.rows.length) throw new AppError('Pending examination not found', 404);
            } else if (String(entry.receptionist_id || '') !== String(actorUserId || '')) {
                throw new AppError('Pending examination not found', 404);
            }
        }
        if (!PENDING_STAGES.includes(entry.queue_stage) || !['Scheduled', 'Checked-in'].includes(entry.exam_status) || ['Cancelled', 'No-Show', 'Completed'].includes(entry.status)) {
            throw new AppError('This appointment is no longer eligible for end-of-day resolution', 409);
        }
        if (action === 'no_show' && new Date(entry.start_time) > new Date()) {
            throw new AppError('A patient cannot be marked as a no-show before the scheduled appointment time', 409);
        }
        if (action === 'no_show' && (!['Scheduled', 'Confirmed'].includes(entry.status) || entry.exam_status !== 'Scheduled')) {
            throw new AppError('A checked-in or otherwise active patient cannot be marked as a no-show', 409);
        }
        const resolvedNotes = notes ? String(notes).trim().slice(0, 1000) : null;
        let newStage = entry.queue_stage;
        let rescheduledAppointment = null;
        if (action === 'no_show') {
            await client.query(`UPDATE appointments SET status = 'No-Show', no_show_reason = COALESCE($2, 'No-show — end of day'), no_show_at = NOW() WHERE appointment_id = $1`, [appointmentId, resolvedNotes]);
            await client.query(`UPDATE examinations SET queue_stage = 'Cancelled', status = 'Scheduled', current_station = 'Reception', is_on_hold = FALSE, hold_reason = NULL, hold_started_at = NULL WHERE exam_id = $1`, [entry.exam_id]);
            newStage = 'Cancelled';
        } else {
            const oldStart = new Date(entry.start_time);
            const localDate = entry.local_start_date || (Number.isNaN(oldStart.getTime()) ? null : oldStart.toISOString().slice(0, 10));
            const localTime = entry.local_start_time || (Number.isNaN(oldStart.getTime()) ? '09:00:00' : oldStart.toISOString().slice(11, 19));
            const targetDate = action === 'carry_forward'
                ? (() => {
                    const baseDate = localDate || new Date().toISOString().slice(0, 10);
                    const next = new Date(`${baseDate}T00:00:00.000Z`);
                    next.setUTCDate(next.getUTCDate() + 1);
                    return next.toISOString().slice(0, 10);
                })()
                : newDate;
            const time = action === 'carry_forward'
                ? localTime
                : (newTime || localTime);
            const normalizedTime = time.length === 5 ? `${time}:00` : time;
            const startTime = `${targetDate}T${normalizedTime}`;
            const durationMs = Math.max(new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime(), 60000);
            const startObj = new Date(startTime);
            const endObj = new Date(startObj.getTime() + durationMs);
            const yyyy = endObj.getFullYear();
            const mm = String(endObj.getMonth() + 1).padStart(2, '0');
            const dd = String(endObj.getDate()).padStart(2, '0');
            const hh = String(endObj.getHours()).padStart(2, '0');
            const min = String(endObj.getMinutes()).padStart(2, '0');
            const ss = String(endObj.getSeconds()).padStart(2, '0');
            const endTime = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
            if (process.env.NODE_ENV !== 'test' && new Date(startTime) <= new Date()) {
                throw new AppError('The rescheduled appointment must be in the future', 400);
            }
            if (action !== 'carry_forward') {
                await assertAppointmentScheduleRules(client, entry.modality_id, startTime, endTime);
            }
            const conflict = await client.query(`SELECT appointment_id FROM appointments WHERE appointment_id <> $1 AND modality_id = $2 AND status NOT IN ('Cancelled', 'No-Show', 'Completed') AND tstzrange(start_time, end_time) && tstzrange($3::timestamptz, $4::timestamptz) FOR UPDATE`, [appointmentId, entry.modality_id, startTime, endTime]);
            if (conflict.rows.length) throw new Error('The selected time is already booked for this modality');
            const actionNote = action === 'carry_forward'
                ? `[End-of-day carry-forward to ${targetDate}]${resolvedNotes ? `: ${resolvedNotes}` : ''}`
                : resolvedNotes;
            await client.query(`INSERT INTO appointment_reschedule_history (appointment_id, old_start_time, old_end_time, new_start_time, new_end_time, reason, changed_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [appointmentId, entry.start_time, entry.end_time, startTime, endTime, actionNote, actorUserId]);
            const updatedAppointment = await client.query(`UPDATE appointments SET start_time = $2, end_time = $3, status = 'Confirmed', notes = CONCAT_WS(E'\n', NULLIF(notes, ''), $4::text) WHERE appointment_id = $1 RETURNING *`, [appointmentId, startTime, endTime, actionNote]);
            rescheduledAppointment = updatedAppointment.rows[0] || null;
            await syncInvoicesAfterAppointmentReschedule(client, appointmentId, startTime);
            await client.query(`
                UPDATE examinations
                SET queue_stage = 'Scheduled', status = 'Scheduled', current_station = 'Reception',
                    arrived_at = NULL, prep_started_at = NULL, prep_completed_at = NULL,
                    is_on_hold = FALSE, hold_reason = NULL, hold_started_at = NULL, hold_released_at = NULL
                WHERE exam_id = $1
            `, [entry.exam_id]);
            newStage = 'Scheduled';
        }
        await client.query(`
            UPDATE reception_work_items
            SET status = 'Completed', completed_at = NOW(), completed_by = $2, updated_at = NOW()
            WHERE appointment_id = $1 AND status IN ('Claimed', 'In_Progress')
        `, [appointmentId, actorUserId]);
        await client.query(`
            INSERT INTO queue_events (
                exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                event_type, reason, notes, changed_by
            ) VALUES ($1, $2, $3, $4, $5, 'Reception', 'EndOfDayResolution', $6, $7, $8)
        `, [entry.exam_id, appointmentId, entry.queue_stage, newStage, entry.current_station, action, resolvedNotes, actorUserId]);
        await client.query(`INSERT INTO order_status_history (appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by) VALUES ($1, $2, $3, $4, 'EndOfDayResolution', $5, $6)`, [appointmentId, entry.exam_id, entry.status, action === 'no_show' ? 'No-Show' : 'Confirmed', resolvedNotes, actorUserId]);
        await logAction(client, {
            userId: actorUserId,
            actorUserId,
            actorRole,
            action: 'END_OF_DAY_CASE_RESOLVED',
            resourceId: entry.exam_id,
            resourceTable: 'examinations',
            examId: entry.exam_id,
            appointmentId,
            sourceSystem: 'end-of-day-controller',
            details: {
                jobName: 'end-of-day-review',
                date: entry.local_start_date,
                sessionId: sessionId || null,
                receptionistId: actorRole === 'Receptionist' ? actorUserId : null,
                action,
                previousStage: entry.queue_stage,
                notes: resolvedNotes,
                newDate: action === 'reschedule' ? newDate : null
            },
            riskScore: action === 'no_show' ? 25 : 10,
            riskReason: `End-of-day case resolution: ${action}`
        });
        await client.query('COMMIT');
        if (action === 'no_show') {
            cancelPendingAppointmentReminders(db, appointmentId).catch(() => {});
            const noShowPayload = {
                entityType: 'Appointment',
                entityId: appointmentId,
                priority: 'Warning',
                variables: {
                    order_number: entry.order_number || '',
                    appointment_time: new Date(entry.start_time).toLocaleString(),
                    reason: resolvedNotes || 'No-show — end of day',
                },
            };
            triggerEventForRole(db, 'AppointmentNoShow', 'Receptionist', noShowPayload).catch(() => {});
            triggerEventForRole(db, 'AppointmentNoShow', 'Admin', noShowPayload).catch(() => {});
            triggerEvent(db, 'PatientAppointmentNoShowNotice', {
                ...noShowPayload,
                patientId: entry.patient_id,
                channels: ['InApp', 'Email'],
            }).catch(() => {});
        }
        if (rescheduledAppointment) {
            scheduleAppointmentReminder(db, rescheduledAppointment).catch(() => {});
            triggerEvent(db, 'AppointmentRescheduled', {
                patientId: rescheduledAppointment.patient_id,
                entityType: 'Appointment',
                entityId: appointmentId,
                occurrenceKey: rescheduledAppointment.start_time,
                channels: ['Email', 'SMS'],
                variables: {
                    order_number: rescheduledAppointment.order_number,
                    appointment_time: new Date(rescheduledAppointment.start_time).toLocaleString(),
                    reschedule_reason: resolvedNotes || (action === 'carry_forward' ? 'End-of-day carry-forward' : 'End-of-day reschedule'),
                },
            }).catch(() => {});
            try { triggerMwlRegeneration(db); } catch { /* best-effort downstream sync */ }
        }
        return { action, appointmentId, examId: entry.exam_id, newStage };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
};

const bulkResolveExams = async (db, items, actor, sessionId = null) => {
    const results = [];
    for (const item of items) {
        try { results.push({ ...(await resolveExam(db, { ...item, sessionId: item.sessionId || sessionId, ...actor })), success: true }); }
        catch (error) { results.push({ appointmentId: item.appointmentId, action: item.action, success: false, error: error.message }); }
    }
    return { resolved: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, results };
};

const onShiftClose = async (db, context = {}) => {
    try {
        const date = getTargetDate(context.date);
        const scope = {
            date,
            sessionId: context.sessionId || null,
            receptionistId: context.userId || null,
            actorRole: context.userId ? 'Receptionist' : null,
        };
        const pending = await getPendingExams(db, { ...scope, limit: 1 });
        if (!pending.total) return { pendingCount: 0, notified: false };
        const summary = await getDaySummary(db, date, scope);
        const reviewUrl = `/reception?tab=end-of-day&sessionId=${encodeURIComponent(context.sessionId || '')}&date=${encodeURIComponent(date)}&fromShiftClose=true`;
        const variables = { receptionist_name: context.userName || 'Staff', session_id: context.sessionId, pending_count: pending.total, total_today: summary.total, completed_today: summary.completed, completion_rate: summary.completionRate, shift_date: date, force_delivery: true, review_url: reviewUrl };
        await Promise.all([
            triggerEventForRole(db, 'SHIFT_CLOSED_WITH_PENDING_EXAMS', 'Admin', { entityType: 'ReceptionShiftSession', entityId: context.sessionId, priority: 'Warning', variables }),
            context.userId
                ? triggerEvent(db, 'SHIFT_CLOSED_WITH_PENDING_EXAMS', { staffId: context.userId, staffRole: 'Receptionist', entityType: 'ReceptionShiftSession', entityId: context.sessionId, priority: 'Warning', variables })
                : Promise.resolve({ scheduled: 0 }),
        ].map((promise) => promise.catch(() => {})));
        await logSystemAuditEvent(db, { eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_COMPLETED, jobName: 'end-of-day-review', sourceSystem: 'reception-shift-close', target: { type: 'reception_shift_sessions', id: context.sessionId }, details: { pendingCount: pending.total, summary, userId: context.userId }, riskScore: pending.total > 5 ? 50 : 30, riskReason: `Shift closed with ${pending.total} pending exams` }).catch(() => {});
        return { pendingCount: pending.total, notified: true, summary, reviewUrl };
    } catch (error) { logger.error('endOfDayService.onShiftClose failed', { error: error.message }); return { pendingCount: 0, notified: false, error: error.message }; }
};

// ─── getReviewLog ──────────────────────────────────────────────────────────────
// Returns audit log entries for end-of-day review actions
const getReviewLog = async (db, opts = {}) => {
    const date = getTargetDate(opts.date);
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const offset = Math.max(Number(opts.offset) || 0, 0);
    
    const values = [date];
    let actorFilter = '';
    let sessionFilter = '';
    let receptionistFilter = '';
    
    if (opts.actorUserId) {
        values.push(opts.actorUserId);
        actorFilter = `AND al.actor_user_id = $${values.length}::uuid`;
    }
    if (opts.sessionId) {
        values.push(opts.sessionId);
        sessionFilter = `AND al.details->>'sessionId' = $${values.length}`;
    }
    if (opts.receptionistId && opts.actorRole === 'Receptionist') {
        values.push(opts.receptionistId);
        receptionistFilter = `AND al.details->>'receptionistId' = $${values.length}`;
    }
    
    const limitIndex = values.length + 1;
    const offsetIndex = values.length + 2;
    values.push(limit, offset);
    
    const where = `al.details->>'jobName' = 'end-of-day-review' AND (al.details->>'date' = $1 OR al.details->>'shift_date' = $1) ${actorFilter} ${sessionFilter} ${receptionistFilter}`;
    
    const [dataResult, countResult] = await Promise.all([
        db.query(`
            SELECT al.log_id, al.timestamp, al.actor_user_id, al.actor_role, al.actor_name,
                   al.event_code, al.details, al.risk_score, al.risk_reason,
                   u.full_name as user_name, u.role as user_role
            FROM system_logs al
            LEFT JOIN users u ON u.user_id = al.actor_user_id
            WHERE ${where}
            ORDER BY al.timestamp DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `, values),
        db.query(`SELECT COUNT(*)::int AS total FROM system_logs al WHERE ${where}`, values.slice(0, values.length - 2))
    ]);
    return { rows: dataResult.rows, total: countResult.rows[0]?.total || 0 };
};

module.exports = { getPendingExams, getDaySummary, resolveExam, bulkResolveExams, onShiftClose, getReviewLog, PENDING_STAGES };
