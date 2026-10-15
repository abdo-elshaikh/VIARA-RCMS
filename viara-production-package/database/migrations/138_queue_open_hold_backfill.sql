-- Preserve active legacy holds that did not yet have a matching Release event.
INSERT INTO clinical_task_hold_intervals (
    exam_id, task_role, queue_stage, started_at, reason
)
SELECT e.exam_id,
       CASE e.current_station
           WHEN 'Nurse' THEN 'Nurse'
           WHEN 'Modality' THEN 'Technician'
           WHEN 'Radiologist' THEN 'Radiologist'
           ELSE NULL
       END,
       e.queue_stage,
       e.hold_started_at,
       e.hold_reason
FROM examinations e
WHERE e.is_on_hold = TRUE
  AND e.hold_started_at IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM clinical_task_hold_intervals h
      WHERE h.exam_id = e.exam_id AND h.released_at IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_task_one_open_hold
    ON clinical_task_hold_intervals(exam_id)
    WHERE released_at IS NULL;
