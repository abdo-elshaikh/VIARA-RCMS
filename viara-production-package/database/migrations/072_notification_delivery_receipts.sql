-- Add provider_message_id to track Twilio SIDs for delivery-receipt callbacks.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_notifications_provider_message_id
    ON notifications(provider_message_id) WHERE provider_message_id IS NOT NULL;
