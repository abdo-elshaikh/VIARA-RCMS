-- Phase 25/26 fix: align portal refresh tokens and safety templates with app code.

-- Refresh tokens need a stable primary key for rotation and a dedicated doctor owner.
ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS token_id UUID DEFAULT uuid_generate_v4(),
    ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE CASCADE;

UPDATE refresh_tokens SET token_id = uuid_generate_v4() WHERE token_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'refresh_tokens_pkey'
          AND conrelid = 'refresh_tokens'::regclass
    ) THEN
        ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (token_id);
    END IF;
END $$;

ALTER TABLE refresh_tokens
    ALTER COLUMN token_id SET NOT NULL;

ALTER TABLE refresh_tokens
    DROP CONSTRAINT IF EXISTS chk_token_owner,
    ADD CONSTRAINT chk_token_owner CHECK (num_nonnulls(user_id, patient_id, doctor_id) = 1);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_doctor ON refresh_tokens(doctor_id);

-- Older schema.sql revisions declared safety_templates.modality_id as INT while modalities use UUID.
DO $$
DECLARE
    modality_type text;
BEGIN
    SELECT data_type INTO modality_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'safety_templates'
      AND column_name = 'modality_id';

    IF modality_type IS NOT NULL AND modality_type <> 'uuid' THEN
        DROP TABLE IF EXISTS exam_safety_responses CASCADE;
        DROP TABLE IF EXISTS safety_templates CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS safety_templates (
    template_id SERIAL PRIMARY KEY,
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    schema_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_safety_responses (
    response_id SERIAL PRIMARY KEY,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE CASCADE,
    template_id INT REFERENCES safety_templates(template_id),
    answers_json JSONB NOT NULL,
    signed_by_user_id UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO safety_templates (modality_id, name, schema_json)
SELECT modality_id, 'MRI Implant Safety Questionnaire',
       '[{"id":"q1","question":"Do you have a cardiac pacemaker?","type":"boolean","required":true},{"id":"q2","question":"Do you have any metallic implants or shrapnel?","type":"boolean","required":true},{"id":"q3","question":"Are you claustrophobic?","type":"boolean","required":false}]'::jsonb
FROM modalities
WHERE type = 'MRI'
  AND NOT EXISTS (SELECT 1 FROM safety_templates WHERE name = 'MRI Implant Safety Questionnaire')
LIMIT 1;

INSERT INTO safety_templates (modality_id, name, schema_json)
SELECT modality_id, 'CT Contrast & eGFR Screening',
       '[{"id":"q1","question":"Are you allergic to iodine or contrast media?","type":"boolean","required":true},{"id":"q2","question":"Latest eGFR value (ml/min)","type":"number","required":true},{"id":"q3","question":"Is the patient pregnant?","type":"boolean","required":true}]'::jsonb
FROM modalities
WHERE type = 'CT'
  AND NOT EXISTS (SELECT 1 FROM safety_templates WHERE name = 'CT Contrast & eGFR Screening')
LIMIT 1;
