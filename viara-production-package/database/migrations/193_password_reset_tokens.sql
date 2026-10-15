-- Migration 193: Add password reset token columns to users table
-- Supports the self-service "Forgot Password" flow without requiring admin involvement.
-- Tokens are short-lived (1 hour), single-use, and stored as SHA-256 hashes.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_reset_token  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
    ON users (password_reset_token)
    WHERE password_reset_token IS NOT NULL;
