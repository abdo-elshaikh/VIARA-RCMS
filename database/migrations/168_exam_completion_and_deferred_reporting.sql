-- Separate acquisition completion, deferred report requests, and image delivery.

ALTER TYPE exam_status ADD VALUE IF NOT EXISTS 'Completed';

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_queue_stage;

ALTER TABLE examinations
    ADD CONSTRAINT chk_examinations_queue_stage CHECK (queue_stage IN (
        'Registered', 'Scheduled', 'Arrived', 'Payment Pending',
        'Prep Pending', 'Ready for Exam', 'In Exam', 'Images Ready',
        'Images Delivered', 'Reporting', 'Finalized', 'Delivered', 'Cancelled'
    ));

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS report_request_status VARCHAR(30) NOT NULL DEFAULT 'Requested',
    ADD COLUMN IF NOT EXISTS report_requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS report_requested_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS report_request_source VARCHAR(30) NOT NULL DEFAULT 'Booking',
    ADD COLUMN IF NOT EXISTS images_ready_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS images_delivered_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_report_request_status,
    ADD CONSTRAINT chk_examinations_report_request_status
        CHECK (report_request_status IN ('NotRequested', 'Requested', 'Cancelled')),
    DROP CONSTRAINT IF EXISTS chk_examinations_report_request_source,
    ADD CONSTRAINT chk_examinations_report_request_source
        CHECK (report_request_source IN ('Booking', 'Reception', 'Patient', 'Doctor', 'Automatic'));

UPDATE examinations
SET report_requested_at = COALESCE(reporting_started_at, created_at),
    report_request_status = 'Requested'
WHERE report_request_status = 'Requested';

ALTER TABLE result_deliveries
    ADD COLUMN IF NOT EXISTS result_type VARCHAR(30) NOT NULL DEFAULT 'Report';

ALTER TABLE result_deliveries
    DROP CONSTRAINT IF EXISTS chk_result_deliveries_result_type,
    ADD CONSTRAINT chk_result_deliveries_result_type
        CHECK (result_type IN ('Images', 'Report', 'ImagesAndReport'));

CREATE TABLE IF NOT EXISTS report_request_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    source VARCHAR(30),
    reason TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_examinations_report_request_queue
    ON examinations(report_request_status, report_status, report_requested_at)
    WHERE report_request_status = 'Requested';

CREATE INDEX IF NOT EXISTS idx_report_request_events_exam
    ON report_request_events(exam_id, created_at DESC);
