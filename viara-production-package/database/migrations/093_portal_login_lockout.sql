-- H-06: Account-level failed login tracking for public portals.

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS portal_failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS portal_locked_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE referring_doctors
    ADD COLUMN IF NOT EXISTS portal_failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS portal_locked_until TIMESTAMP WITH TIME ZONE;
