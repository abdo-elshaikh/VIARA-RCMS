ALTER TABLE modalities
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE modalities ALTER COLUMN status DROP DEFAULT;
ALTER TABLE modalities ALTER COLUMN status TYPE VARCHAR(30)
USING (
    CASE status::text
        WHEN 'Maintenance' THEN 'Under Maintenance'
        WHEN 'Down' THEN 'Out of Service'
        ELSE status::text
    END
);
ALTER TABLE modalities ALTER COLUMN status SET DEFAULT 'Active';
ALTER TABLE modalities DROP CONSTRAINT IF EXISTS chk_modalities_status;
ALTER TABLE modalities ADD CONSTRAINT chk_modalities_status
    CHECK (status IN ('Active', 'Under Maintenance', 'Out of Service'));
