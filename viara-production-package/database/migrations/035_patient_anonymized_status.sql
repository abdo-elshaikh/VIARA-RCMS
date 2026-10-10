-- Allow completed privacy anonymization requests to move a patient into a
-- non-identifying terminal state without violating the demographics constraint.
ALTER TABLE patients
DROP CONSTRAINT IF EXISTS chk_patients_status,
ADD CONSTRAINT chk_patients_status
CHECK (patient_status IN ('Active', 'Inactive', 'Deceased', 'Merged', 'Restricted', 'Anonymized'));
