-- Shift scoping is room-based; the modality_id column on staff_shifts was
-- never used by the product (rooms cover coverage planning) and its partial
-- wiring broke the roster query. Drop it.

DROP INDEX IF EXISTS idx_staff_shifts_modality;
ALTER TABLE staff_shifts DROP COLUMN IF EXISTS modality_id;
