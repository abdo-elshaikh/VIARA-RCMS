const { AppError } = require('../middleware/errorHandler');
const { decryptPatientName } = require('./displayBoardController');

const DISPLAY_STAGES = [
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam'
];

const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Returns a privacy-safe queue projection for wall-mounted / external screens.
 * Patient name visibility follows the admin-controlled `display.patient_display_mode`
 * setting; confidential patients are always excluded entirely.
 */
const getQueueDisplay = (db) => async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return next(new AppError('Invalid queue display date', 400));
        }

        const settingsResult = await db.query(`
            SELECT setting_value FROM system_settings WHERE setting_key = 'display.patient_display_mode'
        `).catch(() => ({ rows: [] }));
        const mode = settingsResult.rows[0]?.setting_value;
        const showNames = mode !== 'order_only';
        const showOrderNumbers = mode !== 'name';

        const result = await db.query(`
            WITH center_tz AS (
                SELECT COALESCE(
                    NULLIF((SELECT setting_value FROM system_settings WHERE setting_key = 'center.timezone'), ''),
                    'Africa/Cairo'
                ) AS tz
            ),
            day_bounds AS (
                SELECT
                    (date_trunc('day', $1::timestamp) AT TIME ZONE tz) AS day_start,
                    (date_trunc('day', $1::timestamp + INTERVAL '1 day') AT TIME ZONE tz) AS day_end
                FROM center_tz
            ),
            numbered_arrivals AS (
                SELECT
                    e.exam_id,
                    e.order_number,
                    e.queue_stage,
                    e.priority,
                    e.arrived_at,
                    e.prep_completed_at,
                    e.exam_started_at,
                    p.first_name_enc,
                    p.last_name_enc,
                    m.modality_id,
                    m.name AS modality_name,
                    m.type AS modality_type,
                    m.room_number,
                    m.status AS machine_status,
                    ROW_NUMBER() OVER (
                        ORDER BY e.arrived_at ASC, e.exam_id ASC
                    )::integer AS queue_number
                FROM examinations e
                JOIN appointments a ON a.appointment_id = e.appointment_id
                JOIN patients p ON e.patient_id = p.patient_id
                JOIN modalities m ON e.modality_id = m.modality_id
                CROSS JOIN day_bounds
                WHERE e.arrived_at IS NOT NULL
                  AND COALESCE(p.is_confidential, FALSE) = FALSE
                  AND (
                      (a.start_time >= day_bounds.day_start AND a.start_time < day_bounds.day_end)
                      OR e.arrived_at >= day_bounds.day_start
                  )
            )
            SELECT
                exam_id,
                CASE WHEN $2::boolean THEN order_number ELSE NULL END AS order_number,
                queue_number,
                queue_stage,
                priority,
                modality_id,
                modality_name,
                modality_type,
                COALESCE(NULLIF(room_number, ''), 'General') AS room_number,
                machine_status,
                COALESCE(exam_started_at, prep_completed_at, arrived_at) AS status_changed_at,
                first_name_enc,
                last_name_enc
            FROM numbered_arrivals
            WHERE queue_stage = ANY($3::text[])
            ORDER BY
                COALESCE(NULLIF(room_number, ''), 'General'),
                CASE priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
                CASE queue_stage WHEN 'In Exam' THEN 1 WHEN 'Ready for Exam' THEN 2 ELSE 3 END,
                queue_number
        `, [date, showOrderNumbers, DISPLAY_STAGES]);

        const items = result.rows.map((row) => {
            const item = {
                exam_id: row.exam_id,
                order_number: row.order_number,
                queue_number: row.queue_number,
                queue_stage: row.queue_stage,
                priority: row.priority,
                modality_id: row.modality_id,
                modality_name: row.modality_name,
                modality_type: row.modality_type,
                room_number: row.room_number,
                machine_status: row.machine_status,
                status_changed_at: toIso(row.status_changed_at)
            };
            if (showNames) item.patient_name = decryptPatientName(row);
            return item;
        });

        res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=20');
        res.json({
            date,
            updatedAt: new Date().toISOString(),
            items
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getQueueDisplay, DISPLAY_STAGES };
