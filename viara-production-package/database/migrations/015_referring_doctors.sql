-- Migration 015: Dedicated referring doctor management

CREATE TABLE IF NOT EXISTS referring_doctors (
    doctor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    specialty VARCHAR(100),
    clinic_hospital VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    tax_id VARCHAR(100),
    contract_id UUID REFERENCES contracts(contract_id),
    referral_source_category VARCHAR(50) DEFAULT 'Doctor',
    commission_percentage DECIMAL(5,2) DEFAULT 0,
    preferred_contact_method VARCHAR(20) DEFAULT 'Email',
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE referring_doctors
DROP CONSTRAINT IF EXISTS chk_referring_doctors_contact_method,
ADD CONSTRAINT chk_referring_doctors_contact_method
CHECK (preferred_contact_method IN ('Phone', 'Email', 'SMS', 'WhatsApp'));

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS referring_doctor_id UUID REFERENCES referring_doctors(doctor_id);

ALTER TABLE examinations
ADD COLUMN IF NOT EXISTS external_referring_doctor_id UUID REFERENCES referring_doctors(doctor_id);

CREATE INDEX IF NOT EXISTS idx_referring_doctors_active ON referring_doctors(is_active);
CREATE INDEX IF NOT EXISTS idx_referring_doctors_name ON referring_doctors(full_name);
CREATE INDEX IF NOT EXISTS idx_appointments_referring_doctor ON appointments(referring_doctor_id);
CREATE INDEX IF NOT EXISTS idx_examinations_external_referring_doctor ON examinations(external_referring_doctor_id);
