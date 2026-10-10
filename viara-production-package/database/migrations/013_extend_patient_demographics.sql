-- Migration 013: Extend patient demographics and medical basics

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS national_id_enc VARCHAR(500),
ADD COLUMN IF NOT EXISTS national_id_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS passport_number_enc VARCHAR(500),
ADD COLUMN IF NOT EXISTS passport_number_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS date_of_birth_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS name_dob_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS emergency_contact_name_enc VARCHAR(500),
ADD COLUMN IF NOT EXISTS emergency_contact_phone_enc VARCHAR(500),
ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100),
ADD COLUMN IF NOT EXISTS emergency_contact_address_enc TEXT,
ADD COLUMN IF NOT EXISTS allergies_enc TEXT,
ADD COLUMN IF NOT EXISTS chronic_diseases_enc TEXT,
ADD COLUMN IF NOT EXISTS prior_surgeries_enc TEXT,
ADD COLUMN IF NOT EXISTS pregnancy_status VARCHAR(30),
ADD COLUMN IF NOT EXISTS implants_devices_enc TEXT,
ADD COLUMN IF NOT EXISTS renal_function_notes_enc TEXT,
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50) DEFAULT 'English',
ADD COLUMN IF NOT EXISTS communication_preference VARCHAR(20) DEFAULT 'Phone',
ADD COLUMN IF NOT EXISTS consent_sms BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS consent_email BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS consent_whatsapp BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS consent_marketing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS patient_status VARCHAR(20) DEFAULT 'Active';

ALTER TABLE patients
DROP CONSTRAINT IF EXISTS chk_patients_communication_preference,
ADD CONSTRAINT chk_patients_communication_preference
CHECK (communication_preference IN ('Phone', 'Email', 'SMS', 'WhatsApp'));

ALTER TABLE patients
DROP CONSTRAINT IF EXISTS chk_patients_status,
ADD CONSTRAINT chk_patients_status
CHECK (patient_status IN ('Active', 'Inactive', 'Deceased', 'Merged', 'Restricted'));

CREATE INDEX IF NOT EXISTS idx_patients_national_id_hash ON patients(national_id_hash);
CREATE INDEX IF NOT EXISTS idx_patients_passport_number_hash ON patients(passport_number_hash);
CREATE INDEX IF NOT EXISTS idx_patients_date_of_birth_hash ON patients(date_of_birth_hash);
CREATE INDEX IF NOT EXISTS idx_patients_name_dob_hash ON patients(name_dob_hash);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(patient_status);
