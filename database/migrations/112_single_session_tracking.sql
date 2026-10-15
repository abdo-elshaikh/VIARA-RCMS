-- Add current_session_id for single-session enforcement
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_session_id UUID NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS current_session_id UUID NULL;
ALTER TABLE referring_doctors ADD COLUMN IF NOT EXISTS current_session_id UUID NULL;
