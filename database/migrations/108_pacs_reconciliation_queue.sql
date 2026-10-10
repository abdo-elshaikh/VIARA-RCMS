-- Migration: PACS reconciliation async queue table
-- Supports asynchronous processing of PACS webhook events.

CREATE TABLE IF NOT EXISTS pacs_reconciliation_queue (
    id BIGSERIAL PRIMARY KEY,
    orthanc_instance_id VARCHAR(128),
    study_instance_uid VARCHAR(255),
    accession_number VARCHAR(64),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    result JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_started_at TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pacs_queue_status ON pacs_reconciliation_queue (status, created_at);
