-- Migration 178: Ensure Nurse role has full clinical queue and patient viewing permissions
--
-- Ensures Nurse role in role_permissions consistently contains VIEW_EXAMS,
-- VIEW_PATIENTS, VIEW_APPOINTMENTS, VIEW_REPORTS, DELIVER_RESULTS, and VIEW_PACS_IMAGES
-- so clinical queue endpoints (such as GET /api/queue) and patient records never 403.

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Nurse'::user_role, permission_id FROM permissions
WHERE name IN (
    'VIEW_EXAMS',
    'VIEW_PATIENTS',
    'VIEW_APPOINTMENTS',
    'VIEW_REPORTS',
    'DELIVER_RESULTS',
    'VIEW_PACS_IMAGES',
    'MANAGE_QUEUE',
    'MANAGE_SAFETY',
    'VIEW_INVENTORY',
    'CONSUME_INVENTORY',
    'EDIT_PATIENTS',
    'VIEW_ROOMS'
) ON CONFLICT DO NOTHING;
