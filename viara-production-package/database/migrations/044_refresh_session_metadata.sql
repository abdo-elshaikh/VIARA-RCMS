-- Persist enough non-secret context to let users review and revoke their own sessions.
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
    ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500),
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

UPDATE refresh_tokens
SET last_used_at = COALESCE(last_used_at, created_at)
WHERE last_used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_user_sessions
    ON refresh_tokens(user_id, revoked, expires_at DESC)
    WHERE user_id IS NOT NULL;
