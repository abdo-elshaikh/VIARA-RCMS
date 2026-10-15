-- Migration 052: PACS imaging layer.
--
-- Adds the imaging-specific child tables that link received DICOM objects back
-- to the existing RIS `examinations` row (keyed by study_instance_uid /
-- order_number). We deliberately do NOT create a parallel patients or studies
-- table: the study IS the examination. Also adds quarantine + ATNA audit
-- scaffolding and the PACS RBAC permissions.

-- ------------------------------------------------------------------
-- 1. Imaging metadata received from modalities (via Orthanc reconciler)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pacs_series (
    series_instance_uid VARCHAR(128) PRIMARY KEY,          -- DICOM (0020,000E)
    study_instance_uid  VARCHAR(128) NOT NULL,             -- DICOM (0020,000D); links to examinations.study_instance_uid
    series_number       INTEGER,
    modality            VARCHAR(16),                       -- CT, MR, DX, US, MG ...
    series_description   VARCHAR(256),
    body_part_examined  VARCHAR(64),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pacs_instances (
    sop_instance_uid    VARCHAR(128) PRIMARY KEY,          -- DICOM (0008,0018)
    series_instance_uid VARCHAR(128) NOT NULL REFERENCES pacs_series(series_instance_uid) ON DELETE CASCADE,
    instance_number     INTEGER,
    orthanc_id          VARCHAR(128),                      -- Orthanc internal instance id (for proxy/modify/export)
    file_ref            VARCHAR(512),                      -- cold-storage reference once tiered off Orthanc hot storage
    file_size_bytes     BIGINT,
    transfer_syntax     VARCHAR(128),
    sop_class_uid       VARCHAR(128),
    storage_tier        VARCHAR(16) NOT NULL DEFAULT 'hot' CHECK (storage_tier IN ('hot', 'warm', 'cold')),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- study_instance_uid on examinations is already UNIQUE, so we can FK series -> examinations.
-- Guarded because older databases created the column without the constraint name we rely on.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'examinations'
          AND constraint_type = 'UNIQUE'
          AND constraint_name = 'examinations_study_instance_uid_key'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'pacs_series' AND constraint_name = 'pacs_series_study_fk'
    ) THEN
        ALTER TABLE pacs_series
            ADD CONSTRAINT pacs_series_study_fk
            FOREIGN KEY (study_instance_uid)
            REFERENCES examinations(study_instance_uid)
            ON DELETE CASCADE;
    END IF;
END $$;

-- ------------------------------------------------------------------
-- 2. Imaging-status columns on the existing examinations row
-- ------------------------------------------------------------------

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS images_available BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS image_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS orthanc_study_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS first_image_received_at TIMESTAMP WITH TIME ZONE;

-- ------------------------------------------------------------------
-- 3. Quarantine for studies whose accession/patient did not reconcile
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pacs_quarantine_studies (
    quarantine_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    study_instance_uid  VARCHAR(128) UNIQUE NOT NULL,
    orthanc_study_id    VARCHAR(128),
    raw_patient_id      VARCHAR(64),
    raw_patient_name    VARCHAR(256),
    raw_accession_number VARCHAR(64),
    modality            VARCHAR(16),
    quarantine_reason   VARCHAR(256),                      -- ACCESSION_NUMBER_NOT_FOUND, PATIENT_ID_MISMATCH ...
    status              VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reconciled', 'Discarded')),
    resolved_by         UUID REFERENCES users(user_id),
    resolved_at         TIMESTAMP WITH TIME ZONE,
    resolved_exam_id    UUID REFERENCES examinations(exam_id),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 4. ATNA-style, write-only image access / event audit
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pacs_audit (
    audit_id            BIGSERIAL PRIMARY KEY,
    event_type          VARCHAR(64) NOT NULL,              -- INSTANCE_RECEIVED, STUDY_RECONCILED, STUDY_QUARANTINED, STUDY_IMPORTED, IMAGE_VIEW, STUDY_EXPORTED, RECONCILE_ACTION
    actor_user_id       UUID REFERENCES users(user_id),    -- null for machine/DIMSE-originated events
    accession_number    VARCHAR(64),
    study_instance_uid  VARCHAR(128),
    remote_ip           VARCHAR(64),
    detail              JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Normalize old one-off PACS installs that created pacs_audit(id, ...), because
-- the active API reads audit_id.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_audit' AND column_name = 'id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pacs_audit' AND column_name = 'audit_id'
    ) THEN
        ALTER TABLE pacs_audit RENAME COLUMN id TO audit_id;
    END IF;

    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS audit_id BIGSERIAL;
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS event_type VARCHAR(64);
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(user_id);
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS accession_number VARCHAR(64);
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(128);
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS remote_ip VARCHAR(64);
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE pacs_audit ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'pacs_audit'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE pacs_audit ADD PRIMARY KEY (audit_id);
    END IF;
END $$;

-- ------------------------------------------------------------------
-- 5. Indices
-- ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pacs_series_study ON pacs_series(study_instance_uid);
CREATE INDEX IF NOT EXISTS idx_pacs_instances_series ON pacs_instances(series_instance_uid);
CREATE INDEX IF NOT EXISTS idx_pacs_instances_tier ON pacs_instances(storage_tier, created_at);
CREATE INDEX IF NOT EXISTS idx_pacs_quarantine_status ON pacs_quarantine_studies(status);
CREATE INDEX IF NOT EXISTS idx_pacs_audit_study ON pacs_audit(study_instance_uid);
CREATE INDEX IF NOT EXISTS idx_pacs_audit_created ON pacs_audit(created_at);

-- ------------------------------------------------------------------
-- 6. RBAC permissions
-- ------------------------------------------------------------------

INSERT INTO permissions (name, module, description) VALUES
('VIEW_PACS_IMAGES', 'PACS', 'View DICOM studies in the diagnostic image viewer'),
('MANAGE_PACS', 'PACS', 'Configure PACS/modality settings and operate the imaging archive'),
('RECONCILE_STUDIES', 'PACS', 'Reconcile quarantined DICOM studies to scheduled examinations')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

-- Admin: full access (idempotent).
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_PACS_IMAGES', 'MANAGE_PACS', 'RECONCILE_STUDIES')
ON CONFLICT DO NOTHING;

-- Radiologists read images and reconcile.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Radiologist'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_PACS_IMAGES', 'RECONCILE_STUDIES')
ON CONFLICT DO NOTHING;

-- Technicians view images (QA at the console) and reconcile mismatches they created.
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Technician'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_PACS_IMAGES', 'RECONCILE_STUDIES')
ON CONFLICT DO NOTHING;
