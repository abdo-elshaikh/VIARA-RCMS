-- Repair deployments that still have the pre-deferred-reporting queue-stage constraint.

ALTER TYPE exam_status ADD VALUE IF NOT EXISTS 'Completed';

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_queue_stage;

ALTER TABLE examinations
    ADD CONSTRAINT chk_examinations_queue_stage CHECK (queue_stage IN (
        'Registered', 'Scheduled', 'Arrived', 'Payment Pending',
        'Prep Pending', 'Ready for Exam', 'In Exam', 'Images Ready',
        'Images Delivered', 'Reporting', 'Finalized', 'Delivered', 'Cancelled'
    ));
