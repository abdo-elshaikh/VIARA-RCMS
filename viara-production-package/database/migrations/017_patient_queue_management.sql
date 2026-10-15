-- Phase 5: Patient Queue Management

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS queue_stage VARCHAR(30) DEFAULT 'Scheduled',
    ADD COLUMN IF NOT EXISTS current_station VARCHAR(30) DEFAULT 'Reception',
    ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS prep_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS prep_completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS exam_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS exam_completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reporting_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_on_hold BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hold_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hold_released_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hold_reason TEXT;

UPDATE examinations
SET queue_stage = CASE
        WHEN status = 'Checked-in' THEN 'Ready for Exam'
        WHEN status = 'Scanning' THEN 'In Exam'
        WHEN status = 'Reporting' THEN 'Reporting'
        WHEN status = 'Finalized' THEN 'Finalized'
        ELSE COALESCE(queue_stage, 'Scheduled')
    END,
    current_station = CASE
        WHEN status IN ('Scheduled', 'Checked-in') THEN 'Nurse'
        WHEN status = 'Scanning' THEN 'Modality'
        WHEN status = 'Reporting' THEN 'Radiologist'
        WHEN status = 'Finalized' THEN 'Delivery'
        ELSE COALESCE(current_station, 'Reception')
    END
WHERE queue_stage IS NULL OR current_station IS NULL;

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_queue_stage,
    ADD CONSTRAINT chk_examinations_queue_stage CHECK (queue_stage IN (
        'Registered',
        'Scheduled',
        'Arrived',
        'Payment Pending',
        'Prep Pending',
        'Ready for Exam',
        'In Exam',
        'Reporting',
        'Finalized',
        'Delivered'
    )),
    DROP CONSTRAINT IF EXISTS chk_examinations_current_station,
    ADD CONSTRAINT chk_examinations_current_station CHECK (current_station IN (
        'Reception',
        'Cashier',
        'Nurse',
        'Modality',
        'Radiologist',
        'Delivery'
    ));

CREATE TABLE IF NOT EXISTS queue_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    from_stage VARCHAR(30),
    to_stage VARCHAR(30),
    from_station VARCHAR(30),
    to_station VARCHAR(30),
    event_type VARCHAR(40) NOT NULL,
    reason TEXT,
    notes TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_examinations_queue_stage ON examinations(queue_stage);
CREATE INDEX IF NOT EXISTS idx_examinations_current_station ON examinations(current_station);
CREATE INDEX IF NOT EXISTS idx_examinations_queue_hold ON examinations(is_on_hold);
CREATE INDEX IF NOT EXISTS idx_queue_events_exam ON queue_events(exam_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_created_at ON queue_events(created_at);
