-- Remove the duplicate legacy queue-stage check left by the original schema.
-- The canonical constraint is maintained by the completion workflow migrations.

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS examinations_queue_stage_check;
