-- Integration hardening: idempotency, dead-letter queue, secret rotation metadata
-- Idempotent migration with IF NOT EXISTS guards

-- 1. Extend integration_logs for idempotency and dead-letter handling
ALTER TABLE integration_logs
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS delivery_attempt INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS provider_response JSONB;

-- Unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_logs_idempotency
    ON integration_logs(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Composite index for worker claiming
CREATE INDEX IF NOT EXISTS idx_integration_logs_claim
    ON integration_logs(status, next_retry_at, created_at)
    WHERE status IN ('Pending', 'Failed', 'Processing');

-- Index for dead-letter queries
CREATE INDEX IF NOT EXISTS idx_integration_logs_dead_letter
    ON integration_logs(status, created_at DESC)
    WHERE status = 'DeadLetter';

-- 2. Extend integrations table for secret rotation metadata
ALTER TABLE integrations
    ADD COLUMN IF NOT EXISTS secret_version INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS rotation_policy VARCHAR(50) DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS webhook_timeout_ms INT DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3,
    ADD COLUMN IF NOT EXISTS retry_backoff_ms INT DEFAULT 1000;

-- 3. Seed default retry policies for known providers
UPDATE integrations
SET max_retries = 3, retry_backoff_ms = 1000, webhook_timeout_ms = 5000
WHERE provider_name IN ('Twilio', 'Stripe', 'QuickBooks', 'PACS_Orthanc')
  AND max_retries IS NULL;
