/**
 * displayBoardController.js
 * Public waiting-room display board: live per-room / per-device case flow.
 *
 * Privacy contract:
 * - Confidential patients are always excluded entirely.
 * - Patient name visibility is governed by the admin-controlled
 *   `display.patient_display_mode` setting ('name_and_order' | 'name' |
 *   'order_only'). 'order_only' restores full anonymity (order numbers are
 *   already printed on booking slips).
 * - MRNs, contact details, and clinical notes never leave this endpoint.
 */
const logger = require('../config/logger');
const { decrypt } = require('../utils/crypto');
const { AppError } = require('../utils/errors');

const PRE_EXAM_STAGES = ['Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam'];

// In-memory active broadcast calls for real-time TV synchronized voice call-outs
let activeBroadcastCalls = [];

const STAGE_PHASE = {
    Registered: 'scheduled',
    Scheduled: 'scheduled',
    Arrived: 'arrived',
    'Payment Pending': 'arrived',
    'Prep Pending': 'preparation',
    'Ready for Exam': 'preparation',
    'In Exam': 'imaging',
    Reporting: 'reporting',
    Finalized: 'completed',
    Delivered: 'delivered',
    Cancelled: 'cancelled'
};

const PHASE_ORDER = ['scheduled', 'arrived', 'preparation', 'imaging', 'reporting', 'completed'];

const CENTER_SETTING_KEYS = [
    'center.name',
    'center.name_ar',
    'center.logo_url',
    'center.logo_dark_url',
    'center.logo_light_url',
    'center.phone',
    'center.alternative_phone',
    'center.hotline',
    'center.whatsapp',
    'center.email',
    'center.address',
    'center.address_ar',
    'center.working_hours',
    'display.patient_display_mode',
    'display.show_ticker',
    'display.board_title'
];

const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const minutesSince = (value) => {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 0;
    return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
};

const numberOrNull = (value) => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const decryptPatientName = (row) => {
    if (!row.first_name_enc && !row.last_name_enc) return null;
    return [decrypt(row.first_name_enc), decrypt(row.last_name_enc)]
        .filter(Boolean)
        .join(' ') || null;
};

const parseJsonSafe = (value) => {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
};

const buildPhaseProgress = (queueStage) => {
    const phase = STAGE_PHASE[queueStage] || 'scheduled';
    const rank = PHASE_ORDER.indexOf(phase);
    return PHASE_ORDER.map((code, index) => ({
        code,
        state: index < rank ? 'completed' : index === rank ? 'current' : 'pending'
    }));
};

const getDisplayBoard = (db) => async (req, res, next) => {
    try {
        const [machinesResult, queueResult, summaryResult, settingsResult, announcementsResult, callsResult] = await Promise.all([
            db.query(`
                SELECT m.modality_id, m.name AS machine_name, m.type AS machine_type, m.status AS machine_status,
                       r.room_id,
                       COALESCE(r.name, 'جناح ' || m.room_number, 'غير محدد') AS room_name,
                       COALESCE(r.room_number, m.room_number) AS room_number,
                       COALESCE(r.status, 'Active') AS room_status
                FROM modalities m
                LEFT JOIN rooms r ON m.room_id = r.room_id
                WHERE m.deleted_at IS NULL
                ORDER BY COALESCE(r.room_number, m.room_number) NULLS LAST, m.name
            `),
            db.query(`
                WITH center_tz AS (
                    SELECT COALESCE(
                        NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''),
                        'Africa/Cairo'
                    ) AS tz
                ),
                day_bounds AS (
                    SELECT
                        (date_trunc('day', (NOW() AT TIME ZONE tz)) AT TIME ZONE tz) AS day_start,
                        (date_trunc('day', (NOW() AT TIME ZONE tz) + INTERVAL '1 day') AT TIME ZONE tz) AS day_end
                    FROM center_tz
                )
                SELECT e.modality_id, e.order_number, e.priority, e.queue_stage, e.is_on_hold,
                       e.arrived_at, e.exam_started_at, e.report_finalized_at, e.delivered_at, e.created_at,
                       a.start_time,
                       p.first_name_enc, p.last_name_enc
                FROM examinations e
                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN patients p ON e.patient_id = p.patient_id
                CROSS JOIN day_bounds
                WHERE e.queue_stage NOT IN ('Cancelled', 'Delivered')
                  AND COALESCE(p.is_confidential, FALSE) = FALSE
                  AND (
                      (a.start_time >= day_bounds.day_start AND a.start_time < day_bounds.day_end)
                      OR e.arrived_at >= day_bounds.day_start
                  )
            `),
            db.query(`
                WITH center_tz AS (
                    SELECT COALESCE(
                        NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''),
                        'Africa/Cairo'
                    ) AS tz
                ),
                day_bounds AS (
                    SELECT
                        (date_trunc('day', (NOW() AT TIME ZONE tz)) AT TIME ZONE tz) AS day_start,
                        (date_trunc('day', (NOW() AT TIME ZONE tz) + INTERVAL '1 day') AT TIME ZONE tz) AS day_end
                    FROM center_tz
                )
                SELECT
                    COUNT(*) FILTER (WHERE e.queue_stage IN ('Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam'))::int AS waiting,
                    COUNT(*) FILTER (WHERE e.queue_stage = 'In Exam')::int AS in_exam,
                    COUNT(*) FILTER (WHERE e.report_finalized_at >= day_bounds.day_start)::int AS completed_today,
                    COUNT(*) FILTER (WHERE e.delivered_at >= day_bounds.day_start)::int AS delivered_today,
                    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(e.arrived_at, e.created_at))) / 60)
                        FILTER (WHERE e.queue_stage IN ('Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam'))::numeric, 0), 0)::int AS average_waiting_minutes
                FROM examinations e
                                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN patients p ON e.patient_id = p.patient_id
                CROSS JOIN day_bounds
                WHERE e.queue_stage <> 'Cancelled'
                  AND COALESCE(p.is_confidential, FALSE) = FALSE
                                    AND (
                                            (a.start_time >= day_bounds.day_start AND a.start_time < day_bounds.day_end)
                                            OR e.arrived_at >= day_bounds.day_start
                                    )
            `),
            db.query(`
                SELECT setting_key, setting_value
                FROM system_settings
                WHERE setting_key = ANY($1::text[])
            `, [CENTER_SETTING_KEYS]).catch(() => ({ rows: [] })),
            db.query(`
                SELECT announcement_id, title, message, tone, display_order
                FROM display_announcements
                WHERE is_active = TRUE
                ORDER BY display_order ASC, created_at DESC
                LIMIT 10
            `).catch(() => ({ rows: [] })),
            db.query(`
                SELECT call_id, order_number, room_name, modality_id, call_by_name, called_at,
                       EXTRACT(EPOCH FROM called_at) * 1000 AS timestamp
                FROM display_call_events
                WHERE expires_at > CURRENT_TIMESTAMP
                ORDER BY called_at DESC
                LIMIT 10
            `).catch(() => ({ rows: activeBroadcastCalls.filter((call) => Date.now() - call.timestamp < 45000) }))
        ]);

        const settings = {};
        settingsResult.rows.forEach((row) => { settings[row.setting_key] = row.setting_value; });

        const patientDisplayMode = ['name_and_order', 'name', 'order_only'].includes(settings['display.patient_display_mode'])
            ? settings['display.patient_display_mode']
            : 'order_only';
        const showNames = patientDisplayMode !== 'order_only';
        const showOrderNumbers = patientDisplayMode !== 'name';
        const showTicker = settings['display.show_ticker'] !== 'false';
        const boardTitle = (settings['display.board_title'] || '').trim() || null;

        const queueByModality = new Map();
        queueResult.rows.forEach((row) => {
            const list = queueByModality.get(row.modality_id) || [];
            if (showNames) row.patient_name = decryptPatientName(row);
            list.push(row);
            queueByModality.set(row.modality_id, list);
        });

        const projectCase = (row) => ({
            order_number: showOrderNumbers ? row.order_number : null,
            patient_name: showNames ? (row.patient_name || null) : null,
            priority: row.priority,
            queue_stage: row.queue_stage,
            phase: STAGE_PHASE[row.queue_stage] || 'imaging',
            is_on_hold: Boolean(row.is_on_hold)
        });

        const PRIORITY_RANK = { Emergency: 0, Urgent: 1, Routine: 2 };
        const roomsMap = new Map();

        machinesResult.rows.forEach((machine) => {
            const roomKey = machine.room_id || `number:${machine.room_number || 'unassigned'}`;
            if (!roomsMap.has(roomKey)) {
                roomsMap.set(roomKey, {
                    room_id: machine.room_id,
                    room_name: machine.room_name,
                    room_number: machine.room_number,
                    room_status: machine.room_status,
                    machines: []
                });
            }

            const cases = queueByModality.get(machine.modality_id) || [];
            const inExam = cases
                .filter((item) => item.queue_stage === 'In Exam')
                .sort((a, b) => new Date(a.exam_started_at || a.created_at) - new Date(b.exam_started_at || b.created_at));
            const waiting = cases
                .filter((item) => PRE_EXAM_STAGES.includes(item.queue_stage))
                .sort((a, b) => {
                    const prio = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
                    if (prio !== 0) return prio;
                    return new Date(a.arrived_at || a.created_at) - new Date(b.arrived_at || b.created_at);
                });

            const currentExam = inExam[0] || null;
            const upNextExam = inExam[1] || waiting[0] || null;
            roomsMap.get(roomKey).machines.push({
                machine_id: machine.modality_id,
                machine_name: machine.machine_name,
                machine_type: machine.machine_type,
                machine_status: machine.machine_status,
                current: currentExam ? {
                    ...projectCase(currentExam),
                    started_at: toIso(currentExam.exam_started_at),
                    elapsed_minutes: minutesSince(currentExam.exam_started_at || currentExam.arrived_at || currentExam.created_at),
                    progress: buildPhaseProgress(currentExam.queue_stage)
                } : null,
                up_next: upNextExam ? projectCase(upNextExam) : null,
                queue: {
                    count: waiting.length,
                    next: waiting.slice(0, 6).map(projectCase),
                    priority_waiting: waiting.filter((item) => ['Emergency', 'Urgent'].includes(item.priority)).length
                }
            });
        });

        const summary = summaryResult.rows[0] || {};

        res.set('Cache-Control', 'no-store, max-age=0');
        res.json({
            generatedAt: new Date().toISOString(),
            center: {
                name: settings['center.name'] || null,
                nameAr: settings['center.name_ar'] || null,
                logoUrl: settings['center.logo_url'] || null,
                logoDarkUrl: settings['center.logo_dark_url'] || null,
                logoLightUrl: settings['center.logo_light_url'] || null,
                phone: settings['center.phone'] || null,
                alternativePhone: settings['center.alternative_phone'] || null,
                hotline: settings['center.hotline'] || null,
                whatsapp: settings['center.whatsapp'] || null,
                email: settings['center.email'] || null,
                address: settings['center.address'] || null,
                addressAr: settings['center.address_ar'] || null,
                workingHours: parseJsonSafe(settings['center.working_hours'])
            },
            config: {
                patientDisplayMode,
                showTicker,
                boardTitle
            },
            announcements: announcementsResult.rows.map((row) => ({
                id: row.announcement_id,
                title: row.title,
                message: row.message,
                tone: row.tone
            })),
            summary: {
                waiting: numberOrNull(summary.waiting) || 0,
                inExam: numberOrNull(summary.in_exam) || 0,
                completedToday: numberOrNull(summary.completed_today) || 0,
                deliveredToday: numberOrNull(summary.delivered_today) || 0,
                averageWaitingMinutes: numberOrNull(summary.average_waiting_minutes) || 0
            },
            broadcastCalls: callsResult.rows.map((call) => ({
                id: call.call_id || call.id,
                orderNumber: call.order_number || call.orderNumber,
                patientName: null,
                roomName: call.room_name || call.roomName || null,
                modalityId: call.modality_id || call.modalityId || null,
                callByName: false,
                calledAt: call.called_at || call.calledAt,
                timestamp: Number(call.timestamp) || Date.now(),
            })),
            rooms: Array.from(roomsMap.values())
        });
    } catch (error) {
        logger.error('Display board query failed', { error: error.message });
        next(error);
    }
};

// In-memory active broadcast calls for real-time TV synchronized voice call-outs

const broadcastPatientCall = (db) => async (req, res, next) => {
    const { orderNumber, roomName, modalityId } = req.body || {};
    const normalizedOrder = String(orderNumber || '').trim();
    if (!normalizedOrder || normalizedOrder.length > 80) {
        return next(new AppError('A valid order number is required for the display call', 400));
    }
    const newCall = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        orderNumber: normalizedOrder,
        patientName: null,
        roomName: roomName ? String(roomName).trim().slice(0, 150) : null,
        modalityId: modalityId || null,
        callByName: false,
        calledAt: new Date().toISOString(),
        timestamp: Date.now()
    };
    try {
        const result = await db.query(`
            WITH purged AS (
                DELETE FROM display_call_events
                WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
            ), created AS (
                INSERT INTO display_call_events (
                    order_number, room_name, modality_id, called_by, call_by_name
                ) VALUES ($1, $2, $3, $4, FALSE)
                RETURNING call_id, called_at
            )
            SELECT call_id, called_at FROM created
        `, [newCall.orderNumber, newCall.roomName, newCall.modalityId, req.user.user_id]);
        newCall.id = result.rows[0]?.call_id || newCall.id;
        newCall.calledAt = result.rows[0]?.called_at || newCall.calledAt;
        activeBroadcastCalls = [newCall, ...activeBroadcastCalls.filter(c => Date.now() - c.timestamp < 60000)].slice(0, 10);
        res.status(200).json({ success: true, call: newCall });
    } catch (error) {
        logger.error('Display call could not be persisted', { error: error.message });
        next(error);
    }
};

module.exports = { getDisplayBoard, broadcastPatientCall, CENTER_SETTING_KEYS, decryptPatientName };
