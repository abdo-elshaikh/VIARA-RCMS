ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS merged_into_patient_id UUID REFERENCES patients(patient_id),
    ADD COLUMN IF NOT EXISTS merged_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS merged_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS merge_reason VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_patients_merged_into
    ON patients(merged_into_patient_id)
    WHERE merged_into_patient_id IS NOT NULL;
