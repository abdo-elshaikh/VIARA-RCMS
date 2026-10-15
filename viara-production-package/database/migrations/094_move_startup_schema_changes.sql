-- H-03: Move the final API-startup schema patches into the migration chain.

ALTER TABLE modalities
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS dicom_role VARCHAR(30) DEFAULT 'mwl_client';

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_modality_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_modality_id_fkey
    FOREIGN KEY (modality_id) REFERENCES modalities(modality_id) ON DELETE SET NULL;

ALTER TABLE waiting_list DROP CONSTRAINT IF EXISTS waiting_list_modality_id_fkey;
ALTER TABLE waiting_list
    ADD CONSTRAINT waiting_list_modality_id_fkey
    FOREIGN KEY (modality_id) REFERENCES modalities(modality_id) ON DELETE SET NULL;

ALTER TABLE center_settings
    ADD COLUMN IF NOT EXISTS print_settings JSONB DEFAULT '{}'::jsonb;

INSERT INTO permissions (name, module, description) VALUES
('DOWNLOAD_PII_LOGS', 'Privacy', 'Download logs containing personally identifiable information access'),
('OVERRIDE_SAFETY_CHECKLIST', 'Clinical', 'Bypass or manually override clinical safety checklists'),
('AMEND_DIAGNOSTIC_REPORTS', 'Clinical', 'Amend finalized diagnostic radiologist reports'),
('ARCHIVE_STUDIES', 'Clinical', 'Archive or deactivate clinical imaging studies'),
('MANAGE_SYSTEM_JOBS', 'System', 'Trigger or configure background scheduler and database jobs'),
('VIEW_SYSTEM_HEALTH', 'System', 'Monitor system resource metrics and API health statuses'),
('PRINT_LABELS', 'Reception', 'Allows printing patient stickers and labels'),
('PRINT_RECEIPTS', 'Reception', 'Allows printing test result receipts'),
('BYPASS_WAITLIST', 'Reception', 'Allows bypassing the waitlist to move patients to exams'),
('OVERRIDE_PRICING', 'Billing', 'Allows overriding pricing and applying custom discounts')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id FROM permissions
WHERE name IN (
    'DOWNLOAD_PII_LOGS', 'OVERRIDE_SAFETY_CHECKLIST', 'AMEND_DIAGNOSTIC_REPORTS',
    'ARCHIVE_STUDIES', 'MANAGE_SYSTEM_JOBS', 'VIEW_SYSTEM_HEALTH', 'PRINT_LABELS',
    'PRINT_RECEIPTS', 'BYPASS_WAITLIST', 'OVERRIDE_PRICING'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Radiologist'::user_role, permission_id FROM permissions
WHERE name IN ('AMEND_DIAGNOSTIC_REPORTS', 'ARCHIVE_STUDIES')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Nurse'::user_role, permission_id FROM permissions
WHERE name = 'OVERRIDE_SAFETY_CHECKLIST'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Receptionist'::user_role, permission_id FROM permissions
WHERE name IN ('PRINT_LABELS', 'PRINT_RECEIPTS', 'BYPASS_WAITLIST', 'OVERRIDE_PRICING')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Developer'::user_role, permission_id FROM permissions
ON CONFLICT DO NOTHING;
