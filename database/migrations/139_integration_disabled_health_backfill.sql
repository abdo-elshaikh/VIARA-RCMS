-- Keep inactive integration health state aligned with the UI and operational meaning.

ALTER TABLE integrations
    ALTER COLUMN health_status SET DEFAULT 'Disabled';

UPDATE integrations
SET health_status = 'Disabled',
    last_checked_at = NULL,
    last_error_code = NULL,
    last_error_message = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = FALSE
  AND health_status <> 'Disabled';
