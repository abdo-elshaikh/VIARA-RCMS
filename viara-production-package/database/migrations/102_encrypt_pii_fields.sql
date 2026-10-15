-- Migration to encrypt PII fields
-- Add encrypted and hashed columns for 2FA secrets
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret_enc VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret_hash VARCHAR(64);

-- Add encrypted and hashed columns for patient emails
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_enc VARCHAR(500);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64);

-- Create indexes on the hashes for rapid searching
CREATE INDEX IF NOT EXISTS idx_users_2fa_hash ON users(two_factor_secret_hash);
CREATE INDEX IF NOT EXISTS idx_patients_email_hash ON patients(email_hash);

-- Optional: Once application code is verified and migrated, the following columns should be dropped:
-- ALTER TABLE users DROP COLUMN two_factor_secret;
-- ALTER TABLE patients DROP COLUMN email;
