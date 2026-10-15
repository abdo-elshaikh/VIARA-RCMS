-- Phase 11: Doctor Portal
-- Adds portal auth fields to referring_doctors, and new tables for messages and audit.

-- 1. Add portal auth + activity fields to existing referring_doctors table
ALTER TABLE referring_doctors
    ADD COLUMN IF NOT EXISTS portal_password_hash TEXT,
    ADD COLUMN IF NOT EXISTS portal_is_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS portal_last_login TIMESTAMP WITH TIME ZONE;

-- 2. Doctor-to-staff messaging
CREATE TABLE IF NOT EXISTS doctor_portal_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID NOT NULL REFERENCES referring_doctors(doctor_id) ON DELETE CASCADE,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('Doctor', 'Staff')),
    -- When sender_role = 'Staff', this is the staff user who replied
    staff_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    subject VARCHAR(300),
    body TEXT NOT NULL,
    -- Optional context linkage
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Doctor portal activity audit
CREATE TABLE IF NOT EXISTS doctor_portal_audit (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    resource_type VARCHAR(80),
    resource_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(80),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doctor_portal_messages_doctor ON doctor_portal_messages(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_portal_messages_unread ON doctor_portal_messages(doctor_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_doctor_portal_audit_doctor ON doctor_portal_audit(doctor_id, created_at DESC);
