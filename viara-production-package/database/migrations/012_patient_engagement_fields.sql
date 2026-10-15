-- Migration 012: Add patient engagement fields

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS assigned_manager_id UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS lead_status VARCHAR(30) DEFAULT 'New',
    ADD COLUMN IF NOT EXISTS planned_activity VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_patients_assigned_manager ON patients(assigned_manager_id);
CREATE INDEX IF NOT EXISTS idx_patients_lead_status ON patients(lead_status);
