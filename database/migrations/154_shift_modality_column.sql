-- staff_shifts.modality_id was referenced by the shift scheduling feature
-- (form field, roster query, INSERT/UPDATE paths) but never created. Add the
-- column so the roster API stops failing on every request.

ALTER TABLE staff_shifts
    ADD COLUMN IF NOT EXISTS modality_id UUID REFERENCES modalities(modality_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_shifts_modality
    ON staff_shifts(modality_id, start_time);
