-- Shift roster resource assignment: link a staff shift to the machine
-- (modality) it covers. The room is derived from the modality registry, so
-- rooms and devices stay a single source of truth.

ALTER TABLE staff_shifts
    ADD COLUMN IF NOT EXISTS modality_id UUID REFERENCES modalities(modality_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_shifts_modality ON staff_shifts(modality_id);
