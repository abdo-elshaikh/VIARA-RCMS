INSERT INTO permissions (name, module, description) VALUES
('MANAGE_EXAM_CATALOG', 'Equipment', 'Create and maintain examination catalog definitions')
ON CONFLICT (name) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id
FROM permissions
WHERE name = 'MANAGE_EXAM_CATALOG'
ON CONFLICT DO NOTHING;

ALTER TABLE examination_types
    ADD COLUMN IF NOT EXISTS code VARCHAR(40),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_examination_types_code_unique
    ON examination_types (UPPER(code)) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_examination_types_active_modality
    ON examination_types (is_active, modality_id, name);

ALTER TABLE examination_types DROP CONSTRAINT IF EXISTS chk_examination_types_price;
ALTER TABLE examination_types ADD CONSTRAINT chk_examination_types_price
    CHECK (price >= 0) NOT VALID;
ALTER TABLE examination_types DROP CONSTRAINT IF EXISTS chk_examination_types_duration;
ALTER TABLE examination_types ADD CONSTRAINT chk_examination_types_duration
    CHECK (duration_minutes BETWEEN 1 AND 1440) NOT VALID;
