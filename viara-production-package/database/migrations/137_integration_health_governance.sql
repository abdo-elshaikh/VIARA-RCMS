-- Production-grade integration health, safe credential sizing, and optimistic updates.

ALTER TABLE integrations
    ALTER COLUMN api_key TYPE TEXT,
    ALTER COLUMN api_secret TYPE TEXT,
    ALTER COLUMN webhook_secret TYPE TEXT,
    ALTER COLUMN webhook_url TYPE TEXT,
    ADD COLUMN IF NOT EXISTS health_status VARCHAR(24) NOT NULL DEFAULT 'NotConfigured',
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(80),
    ADD COLUMN IF NOT EXISTS last_error_message TEXT,
    ADD COLUMN IF NOT EXISTS config_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

UPDATE integrations
SET health_status = CASE
    WHEN is_active THEN 'Unknown'
    ELSE 'NotConfigured'
END
WHERE health_status IS NULL OR health_status NOT IN ('NotConfigured', 'Unknown', 'Healthy', 'Degraded', 'Unhealthy', 'Disabled');

ALTER TABLE integrations
    DROP CONSTRAINT IF EXISTS chk_integrations_health_status,
    ADD CONSTRAINT chk_integrations_health_status
        CHECK (health_status IN ('NotConfigured', 'Unknown', 'Healthy', 'Degraded', 'Unhealthy', 'Disabled')),
    DROP CONSTRAINT IF EXISTS chk_integrations_config_version,
    ADD CONSTRAINT chk_integrations_config_version CHECK (config_version > 0),
    DROP CONSTRAINT IF EXISTS chk_integrations_retry_policy,
    ADD CONSTRAINT chk_integrations_retry_policy CHECK (
        max_retries BETWEEN 0 AND 20
        AND retry_backoff_ms BETWEEN 100 AND 3600000
        AND webhook_timeout_ms BETWEEN 500 AND 120000
    );

CREATE INDEX IF NOT EXISTS idx_integrations_health
    ON integrations(is_active, health_status, last_checked_at DESC);

-- Health checks are observations, not outbound work items. Existing failures must
-- not be picked up by the delivery worker.
UPDATE integration_logs
SET status = 'HealthFailed',
    next_retry_at = NULL,
    completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
WHERE event_type = 'HEALTH_CHECK_TEST' AND status = 'Failed';
