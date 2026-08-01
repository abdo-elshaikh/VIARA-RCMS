-- Phase 13: Real-Time Chat & Communications
-- Schema additions for staff-to-staff messaging and patient-to-staff messaging.

-- 1. Create table for staff messages (direct and channel chat)
CREATE TABLE IF NOT EXISTS staff_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    channel_name VARCHAR(50), -- 'general', 'radiology', 'reception', etc.
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_staff_msg_recipient_or_channel CHECK (
        (recipient_id IS NOT NULL AND channel_name IS NULL) OR
        (recipient_id IS NULL AND channel_name IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_staff_messages_sender ON staff_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_staff_messages_recipient ON staff_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_messages_channel ON staff_messages(channel_name, created_at DESC);

-- 2. Create table for patient portal support messages
CREATE TABLE IF NOT EXISTS patient_portal_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('Patient', 'Staff')),
    staff_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL, -- Null if sent by patient
    subject VARCHAR(300),
    body TEXT NOT NULL,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_portal_messages_patient ON patient_portal_messages(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_portal_messages_unread ON patient_portal_messages(patient_id, is_read) WHERE is_read = FALSE;

-- 3. Register RBAC permissions for chat and communications
INSERT INTO permissions (name, module, description) VALUES
('MANAGE_CHAT', 'System', 'Allows staff members to use direct chat, channels, and reply to patient and doctor portal messages')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

-- Grant permissions to Admin
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id FROM permissions WHERE name = 'MANAGE_CHAT'
ON CONFLICT DO NOTHING;

-- Grant permissions to Receptionist, Radiologist, Technician, Nurse, and HR
INSERT INTO role_permissions (role_name, permission_id)
SELECT r.role::user_role, p.permission_id
FROM (VALUES ('Receptionist'), ('Radiologist'), ('Technician'), ('Nurse'), ('HR')) AS r(role)
CROSS JOIN (SELECT permission_id FROM permissions WHERE name = 'MANAGE_CHAT') AS p
ON CONFLICT DO NOTHING;
