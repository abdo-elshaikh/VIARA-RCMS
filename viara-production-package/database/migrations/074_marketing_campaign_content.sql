-- First-class campaign content for marketing outreach.

ALTER TABLE marketing_campaigns
ADD COLUMN IF NOT EXISTS message_subject VARCHAR(200),
ADD COLUMN IF NOT EXISTS message_body TEXT;

UPDATE marketing_campaigns
SET message_body = COALESCE(NULLIF(message_body, ''), name)
WHERE message_body IS NULL OR message_body = '';
