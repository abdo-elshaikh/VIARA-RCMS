-- 134_integrations_hardening_and_credentials.sql
-- Add webhook_secret, sender_identity, and extra_config columns, and seed default providers

ALTER TABLE integrations
    ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(500),
    ADD COLUMN IF NOT EXISTS sender_identity VARCHAR(100),
    ADD COLUMN IF NOT EXISTS extra_config JSONB DEFAULT '{}'::jsonb;

-- Seed default integration providers if they do not exist
INSERT INTO integrations (provider_name, type, is_active, max_retries, retry_backoff_ms, webhook_timeout_ms)
VALUES
    ('Twilio', 'SMS', FALSE, 3, 1000, 5000),
    ('WhatsApp', 'Messaging', FALSE, 3, 1000, 5000),
    ('Stripe', 'Payment', FALSE, 3, 1000, 5000),
    ('QuickBooks', 'Accounting', FALSE, 3, 1000, 5000),
    ('PACS_Orthanc', 'PACS', FALSE, 3, 1000, 5000)
ON CONFLICT (provider_name) DO UPDATE SET
    type = EXCLUDED.type,
    max_retries = COALESCE(integrations.max_retries, EXCLUDED.max_retries),
    retry_backoff_ms = COALESCE(integrations.retry_backoff_ms, EXCLUDED.retry_backoff_ms),
    webhook_timeout_ms = COALESCE(integrations.webhook_timeout_ms, EXCLUDED.webhook_timeout_ms);
