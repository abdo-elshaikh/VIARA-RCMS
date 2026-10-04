-- 187_audit_schema_alignment.sql
-- Aligns the legacy system_logs table with the structured audit schema used by the backend.
-- This migration is intentionally idempotent and safe to run against existing databases.

ALTER TABLE system_logs
    ADD COLUMN IF NOT EXISTS category VARCHAR(32),
    ADD COLUMN IF NOT EXISTS severity SMALLINT NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS outcome VARCHAR(16) NOT NULL DEFAULT 'success',
    ADD COLUMN IF NOT EXISTS http_method VARCHAR(8),
    ADD COLUMN IF NOT EXISTS request_path TEXT,
    ADD COLUMN IF NOT EXISTS previous_value JSONB,
    ADD COLUMN IF NOT EXISTS new_value JSONB,
    ADD COLUMN IF NOT EXISTS audit_hash_version SMALLINT NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS actor_type VARCHAR(30),
    ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS actor_name TEXT,
    ADD COLUMN IF NOT EXISTS session_id UUID,
    ADD COLUMN IF NOT EXISTS request_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS event_code VARCHAR(120),
    ADD COLUMN IF NOT EXISTS event_family VARCHAR(60),
    ADD COLUMN IF NOT EXISTS event_action VARCHAR(60),
    ADD COLUMN IF NOT EXISTS target_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS target_id UUID,
    ADD COLUMN IF NOT EXISTS target_label TEXT,
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(invoice_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS report_id UUID,
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_system VARCHAR(80),
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(128),
    ADD COLUMN IF NOT EXISTS status_code INT,
    ADD COLUMN IF NOT EXISTS risk_score SMALLINT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS risk_reason TEXT,
    ADD COLUMN IF NOT EXISTS changed_fields JSONB,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE system_logs
SET actor_type = COALESCE(actor_type, CASE WHEN user_id IS NULL THEN 'SYSTEM' ELSE 'USER' END),
    actor_user_id = COALESCE(actor_user_id, user_id),
    event_code = COALESCE(event_code, action),
    event_family = COALESCE(event_family, category),
    event_action = COALESCE(event_action, http_method),
    target_type = COALESCE(target_type, resource_table),
    target_id = COALESCE(target_id, resource_id),
    status_code = COALESCE(status_code, NULLIF(details->>'statusCode', '')::int),
    outcome = COALESCE(outcome, CASE
        WHEN details ? 'statusCode' AND (details->>'statusCode') ~ '^[0-9]+$' AND (details->>'statusCode')::int = 403 THEN 'denied'
        WHEN details ? 'statusCode' AND (details->>'statusCode') ~ '^[0-9]+$' AND (details->>'statusCode')::int >= 400 THEN 'failure'
        ELSE 'success'
    END)
WHERE audit_hash_version IS NULL OR audit_hash_version = 1;

CREATE INDEX IF NOT EXISTS idx_audit_category_time
    ON system_logs (category, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_outcome
    ON system_logs (outcome, timestamp DESC)
    WHERE outcome <> 'success';

CREATE INDEX IF NOT EXISTS idx_audit_severity
    ON system_logs (severity, timestamp DESC)
    WHERE severity >= 40;

CREATE INDEX IF NOT EXISTS idx_audit_event_code_time
    ON system_logs (event_code, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_time
    ON system_logs (actor_user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_type_time
    ON system_logs (actor_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_target_time
    ON system_logs (target_type, target_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_patient_time
    ON system_logs (patient_id, timestamp DESC)
    WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_exam_time
    ON system_logs (exam_id, timestamp DESC)
    WHERE exam_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_invoice_time
    ON system_logs (invoice_id, timestamp DESC)
    WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_request_id
    ON system_logs (request_id)
    WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_risk_time
    ON system_logs (risk_score DESC, timestamp DESC)
    WHERE risk_score >= 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_logs_entry_hash
    ON system_logs(entry_hash)
    WHERE entry_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id BIGINT REFERENCES system_logs(log_id) ON DELETE SET NULL,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    target_type VARCHAR(80),
    target_id UUID,
    reason TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_alerts_status_time
    ON audit_alerts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_alerts_actor_time
    ON audit_alerts (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_alerts_patient_time
    ON audit_alerts (patient_id, created_at DESC)
    WHERE patient_id IS NOT NULL;
