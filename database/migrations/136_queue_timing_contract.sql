-- Canonical queue terminal state and active-time accounting.
ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_queue_stage;
ALTER TABLE examinations
    ADD CONSTRAINT chk_examinations_queue_stage
    CHECK (queue_stage IN (
        'Registered', 'Scheduled', 'Arrived', 'Payment Pending',
        'Prep Pending', 'Ready for Exam', 'In Exam', 'Reporting',
        'Finalized', 'Delivered', 'Cancelled'
    ));

CREATE TABLE IF NOT EXISTS clinical_task_hold_intervals (
    hold_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    task_role VARCHAR(30),
    queue_stage VARCHAR(30) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (released_at IS NULL OR released_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_clinical_task_hold_exam_time
    ON clinical_task_hold_intervals (exam_id, started_at, released_at);

-- Reconstruct historical pairs where possible. New writes use the interval table.
INSERT INTO clinical_task_hold_intervals (
    exam_id, queue_stage, started_at, released_at, reason
)
SELECT exam_id, from_stage, created_at, released_at, reason
FROM (
    SELECT exam_id, from_stage, event_type, created_at, reason,
           LEAD(created_at) OVER (PARTITION BY exam_id ORDER BY created_at) AS released_at,
           LEAD(event_type) OVER (PARTITION BY exam_id ORDER BY created_at) AS next_event_type
    FROM queue_events
    WHERE event_type IN ('Hold', 'Release')
) pairs
WHERE event_type = 'Hold'
  AND next_event_type = 'Release'
  AND NOT EXISTS (
      SELECT 1
      FROM clinical_task_hold_intervals existing
      WHERE existing.exam_id = pairs.exam_id
        AND existing.started_at = pairs.created_at
  );

CREATE INDEX IF NOT EXISTS idx_examinations_scheduled_start_queue
    ON examinations(queue_stage, appointment_id);
