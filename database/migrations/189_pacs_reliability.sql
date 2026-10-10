ALTER TABLE pacs_reconciliation_queue ADD COLUMN IF NOT EXISTS event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pacs_queue_event_key ON pacs_reconciliation_queue(event_key);
CREATE TABLE IF NOT EXISTS pacs_sync_cursors (
    source TEXT PRIMARY KEY,
    sequence BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pacs_queue_lease ON pacs_reconciliation_queue(processing_started_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_pacs_active_patient ON examinations(patient_id, created_at) WHERE status IN ('Scheduled', 'Checked-in', 'Scanning');

ALTER TABLE pacs_instances ADD COLUMN IF NOT EXISTS archive_sha256 TEXT;
