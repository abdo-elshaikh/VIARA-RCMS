-- Create a catalog of exam types (services) linked to machines
CREATE TABLE IF NOT EXISTS examination_types (
    type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modality_id UUID REFERENCES modalities(modality_id),
    name VARCHAR(100) NOT NULL, -- e.g., 'Brain MRI with Contrast'
    price DECIMAL(10, 2) NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (modality_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_examination_types_modality_name
ON examination_types(modality_id, name);

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS exam_type_id UUID REFERENCES examination_types(type_id);

ALTER TABLE examinations
ADD COLUMN IF NOT EXISTS exam_type_id UUID REFERENCES examination_types(type_id);

-- Seed some initial data based on existing modalities
-- Note: UUIDs here are placeholders; in a real migration we'd query them or use known seeds.
-- For this script, we'll try to subquery the modalities if possible, or leave it to the application to seed.
-- We will use a DO block to seed relative to existing names.

DO $$
DECLARE
    mri_id UUID;
    ct_id UUID;
    xray_id UUID;
    us_id UUID;
BEGIN
    SELECT modality_id INTO mri_id FROM modalities WHERE type = 'MRI' LIMIT 1;
    SELECT modality_id INTO ct_id FROM modalities WHERE type = 'CT' LIMIT 1;
    SELECT modality_id INTO xray_id FROM modalities WHERE type = 'X-Ray' LIMIT 1;
    SELECT modality_id INTO us_id FROM modalities WHERE type = 'Ultrasound' LIMIT 1;

    IF mri_id IS NOT NULL THEN
        INSERT INTO examination_types (modality_id, name, price, duration_minutes) VALUES
        (mri_id, 'MRI Brain', 1500.00, 30),
        (mri_id, 'MRI Spine', 1800.00, 45),
        (mri_id, 'MRI Knee', 1200.00, 30)
        ON CONFLICT DO NOTHING;
    END IF;

    IF ct_id IS NOT NULL THEN
        INSERT INTO examination_types (modality_id, name, price, duration_minutes) VALUES
        (ct_id, 'CT Chest', 800.00, 15),
        (ct_id, 'CT Abdomen', 1000.00, 20)
        ON CONFLICT DO NOTHING;
    END IF;

    IF xray_id IS NOT NULL THEN
        INSERT INTO examination_types (modality_id, name, price, duration_minutes) VALUES
        (xray_id, 'Chest X-Ray', 200.00, 5),
        (xray_id, 'Leg X-Ray', 200.00, 5)
        ON CONFLICT DO NOTHING;
    END IF;
    
    IF us_id IS NOT NULL THEN
        INSERT INTO examination_types (modality_id, name, price, duration_minutes) VALUES
        (us_id, 'Abdominal Ultrasound', 400.00, 15),
        (us_id, 'Pelvic Ultrasound', 350.00, 15)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
