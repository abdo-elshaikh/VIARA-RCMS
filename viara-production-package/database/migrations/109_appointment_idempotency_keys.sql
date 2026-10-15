-- Migration: Appointment idempotency keys table
-- Supports idempotent creation of appointments to prevent duplicates from client retries.

CREATE TABLE IF NOT EXISTS appointment_idempotency_keys (
    idempotency_key UUID NOT NULL,
    actor_id UUID NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    request_fingerprint TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id, operation_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_appointment_idempotency_resource ON appointment_idempotency_keys (resource_id);
