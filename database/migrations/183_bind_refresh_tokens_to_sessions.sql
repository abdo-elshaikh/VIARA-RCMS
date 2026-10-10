-- Bind every refresh-token rotation to the login session that created it.
-- Existing tokens cannot be safely backfilled because they have no session
-- identity; revoke them so accounts sign in once after this migration.
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS session_id UUID;

UPDATE refresh_tokens
SET revoked = TRUE,
    revoked_at = COALESCE(revoked_at, NOW()),
    revoked_reason = COALESCE(revoked_reason, 'session_binding_upgrade')
WHERE revoked = FALSE OR revoked IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active_session
    ON refresh_tokens(session_id, expires_at DESC)
    WHERE session_id IS NOT NULL AND revoked = FALSE;
