-- Settle legacy abandoned attendance sessions before they can distort hourly payroll.
-- Future stale sessions are also capped by the attendance controller.

UPDATE attendance_logs a
SET clock_out = GREATEST(
        a.clock_in,
        LEAST(
            CURRENT_TIMESTAMP,
            COALESCE(
                (SELECT s.end_time FROM staff_shifts s WHERE s.shift_id = a.shift_id),
                a.clock_in + interval '16 hours'
            )
        )
    ),
    notes = CONCAT_WS(E'\n', NULLIF(a.notes, ''), '[migration] Stale attendance session automatically capped'),
    corrected_at = CURRENT_TIMESTAMP
WHERE a.clock_out IS NULL
  AND a.clock_in < CURRENT_TIMESTAMP - interval '24 hours';
