-- Normalize legacy PACS quarantine tables created before migration 052.
-- Older databases used id/orthanc_id/patient_name/accession_number columns.
-- Current backend/frontend use quarantine_id/orthanc_study_id/raw_* columns.

ALTER TABLE pacs_quarantine_studies
    ADD COLUMN IF NOT EXISTS quarantine_id UUID DEFAULT uuid_generate_v4(),
    ADD COLUMN IF NOT EXISTS orthanc_study_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS raw_patient_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS raw_patient_name VARCHAR(256),
    ADD COLUMN IF NOT EXISTS raw_accession_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS modality VARCHAR(16),
    ADD COLUMN IF NOT EXISTS resolved_by UUID,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS resolved_exam_id UUID;

-- Legacy columns are retained for compatibility, but must not block current
-- inserts that write the normalized orthanc_study_id/raw_* columns.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_quarantine_studies' AND column_name = 'orthanc_id'
    ) THEN
        ALTER TABLE pacs_quarantine_studies
            ALTER COLUMN orthanc_id DROP NOT NULL;
    END IF;
END $$;

UPDATE pacs_quarantine_studies
SET quarantine_id = COALESCE(quarantine_id, uuid_generate_v4())
WHERE quarantine_id IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_quarantine_studies' AND column_name = 'orthanc_id'
    ) THEN
        UPDATE pacs_quarantine_studies
        SET orthanc_study_id = COALESCE(orthanc_study_id, orthanc_id)
        WHERE orthanc_study_id IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_quarantine_studies' AND column_name = 'patient_id'
    ) THEN
        UPDATE pacs_quarantine_studies
        SET raw_patient_id = COALESCE(raw_patient_id, patient_id)
        WHERE raw_patient_id IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_quarantine_studies' AND column_name = 'patient_name'
    ) THEN
        UPDATE pacs_quarantine_studies
        SET raw_patient_name = COALESCE(raw_patient_name, patient_name)
        WHERE raw_patient_name IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_quarantine_studies' AND column_name = 'accession_number'
    ) THEN
        UPDATE pacs_quarantine_studies
        SET raw_accession_number = COALESCE(raw_accession_number, accession_number)
        WHERE raw_accession_number IS NULL;
    END IF;
END $$;

ALTER TABLE pacs_quarantine_studies
    ALTER COLUMN quarantine_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pacs_quarantine_studies_quarantine_id_key
    ON pacs_quarantine_studies(quarantine_id);

DO $$
DECLARE
    is_partial BOOLEAN;
BEGIN
    SELECT pg_get_expr(i.indpred, i.indrelid) IS NOT NULL
    INTO is_partial
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'pacs_quarantine_studies_study_instance_uid_key';

    IF COALESCE(is_partial, FALSE) THEN
        DROP INDEX pacs_quarantine_studies_study_instance_uid_key;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pacs_quarantine_studies_study_instance_uid_key
    ON pacs_quarantine_studies(study_instance_uid);

CREATE INDEX IF NOT EXISTS idx_pacs_quarantine_status
    ON pacs_quarantine_studies(status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'pacs_quarantine_studies'::regclass
          AND conname = 'pacs_quarantine_studies_resolved_by_fkey'
    ) THEN
        ALTER TABLE pacs_quarantine_studies
            ADD CONSTRAINT pacs_quarantine_studies_resolved_by_fkey
            FOREIGN KEY (resolved_by) REFERENCES users(user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'pacs_quarantine_studies'::regclass
          AND conname = 'pacs_quarantine_studies_resolved_exam_id_fkey'
    ) THEN
        ALTER TABLE pacs_quarantine_studies
            ADD CONSTRAINT pacs_quarantine_studies_resolved_exam_id_fkey
            FOREIGN KEY (resolved_exam_id) REFERENCES examinations(exam_id);
    END IF;
END $$;
