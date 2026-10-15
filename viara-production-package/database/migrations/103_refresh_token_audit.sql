-- Add audit and family tracking fields to refresh_tokens
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(100);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS parent_token_id UUID REFERENCES refresh_tokens(token_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_parent ON refresh_tokens(parent_token_id);
