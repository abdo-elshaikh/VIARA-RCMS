-- Equipment reads must not depend on a prior exam-catalog request running DDL.
-- Nullable metadata preserves all existing machines and procedures.
ALTER TABLE modalities
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE examination_types
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_modalities_not_deleted
    ON modalities (status, type, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_examination_types_not_deleted
    ON examination_types (modality_id, is_active, name) WHERE deleted_at IS NULL;
