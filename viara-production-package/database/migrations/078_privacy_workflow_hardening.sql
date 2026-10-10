-- Harden privacy request workflow, consent history, and export handling.

ALTER TABLE patient_consents
    ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'Staff',
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE data_privacy_requests
    ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS export_id UUID,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE data_privacy_requests
    DROP CONSTRAINT IF EXISTS data_privacy_requests_status_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'data_privacy_requests_status_check_v2'
    ) THEN
        ALTER TABLE data_privacy_requests
            ADD CONSTRAINT data_privacy_requests_status_check_v2
            CHECK (status IN ('Pending', 'InReview', 'Approved', 'Rejected', 'Completed', 'Cancelled', 'Resolved'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS privacy_export_artifacts (
    export_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES data_privacy_requests(request_id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    last_downloaded_at TIMESTAMP WITH TIME ZONE,
    last_downloaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_created
    ON data_privacy_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_exports_request
    ON privacy_export_artifacts(request_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'data_privacy_requests_export_id_fkey'
    ) THEN
        ALTER TABLE data_privacy_requests
            ADD CONSTRAINT data_privacy_requests_export_id_fkey
            FOREIGN KEY (export_id) REFERENCES privacy_export_artifacts(export_id) ON DELETE SET NULL;
    END IF;
END $$;

INSERT INTO permissions (name, module, description) VALUES
('VIEW_PRIVACY_REQUESTS', 'Privacy', 'View patient privacy and data-subject requests'),
('CREATE_PRIVACY_REQUESTS', 'Privacy', 'Create privacy requests for patients'),
('RESOLVE_PRIVACY_REQUESTS', 'Privacy', 'Review, reject, and complete privacy requests'),
('EXPORT_PATIENT_DATA', 'Privacy', 'Generate and download patient data export artifacts'),
('ANONYMIZE_PATIENT_DATA', 'Privacy', 'Perform irreversible patient anonymization workflows'),
('MANAGE_CONSENTS', 'Privacy', 'Record and revoke patient consent history')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Developer'::user_role, permission_id
FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id
FROM permissions
WHERE name IN (
    'VIEW_PRIVACY_REQUESTS',
    'CREATE_PRIVACY_REQUESTS',
    'RESOLVE_PRIVACY_REQUESTS',
    'EXPORT_PATIENT_DATA',
    'ANONYMIZE_PATIENT_DATA',
    'MANAGE_CONSENTS'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id
FROM permissions
WHERE name IN ('CREATE_PRIVACY_REQUESTS', 'MANAGE_CONSENTS')
ON CONFLICT DO NOTHING;
