-- Migration 140: Reception Work Items, Task Ownership, Concurrency Control, and Desk Assignments
CREATE TABLE IF NOT EXISTS reception_work_items (
    work_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE CASCADE,
    task_type VARCHAR(40) NOT NULL DEFAULT 'CheckIn' CHECK (task_type IN ('CheckIn', 'DocumentReview', 'InvoiceCreation', 'ResultDelivery', 'FollowUpCall')),
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE SET NULL,
    room_number VARCHAR(50),
    claimed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    desk_identifier VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Claimed', 'In_Progress', 'Completed', 'Released')),
    claimed_at TIMESTAMP WITH TIME ZONE,
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reception_work_items_appt ON reception_work_items (appointment_id, status);
CREATE INDEX IF NOT EXISTS idx_reception_work_items_claimed_by ON reception_work_items (claimed_by, status) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reception_work_items_modality ON reception_work_items (modality_id, status);
CREATE INDEX IF NOT EXISTS idx_reception_work_items_status ON reception_work_items (status);

-- Reception assignment columns directly on appointments for atomic fast operations
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS receptionist_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS receptionist_assigned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS receptionist_desk VARCHAR(50),
    ADD COLUMN IF NOT EXISTS receptionist_assignment_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_appointments_receptionist_active
    ON appointments (receptionist_id, receptionist_assigned_at)
    WHERE receptionist_id IS NOT NULL;

-- Permissions for reception tasks
INSERT INTO permissions (name, module, description)
VALUES 
    ('MANAGE_RECEPTION_TASKS', 'Reception', 'Claim, release, and transfer reception desk tasks'),
    ('VIEW_ALL_RECEPTION_DESKS', 'Reception', 'View and supervise all reception desk activities across rooms')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role_name::user_role, p.permission_id
FROM (VALUES ('Receptionist'), ('Admin'), ('Developer')) AS r(role_name)
CROSS JOIN permissions p
WHERE p.name IN ('MANAGE_RECEPTION_TASKS', 'VIEW_ALL_RECEPTION_DESKS')
ON CONFLICT DO NOTHING;
