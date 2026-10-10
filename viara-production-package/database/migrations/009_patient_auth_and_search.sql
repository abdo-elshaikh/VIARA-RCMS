-- Migration 009: Add patient auth and blind indexes

-- Add new columns for auth and blind indexing
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS email VARCHAR(150),
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_name_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS last_name_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'patients_email_key'
          AND conrelid = 'patients'::regclass
    ) THEN
        ALTER TABLE patients ADD CONSTRAINT patients_email_key UNIQUE (email);
    END IF;
END $$;

-- Create indexes on the blind index columns for fast searching
CREATE INDEX IF NOT EXISTS idx_patients_first_name_hash ON patients(first_name_hash);
CREATE INDEX IF NOT EXISTS idx_patients_last_name_hash ON patients(last_name_hash);
CREATE INDEX IF NOT EXISTS idx_patients_phone_hash ON patients(phone_hash);
