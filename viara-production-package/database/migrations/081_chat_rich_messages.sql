-- Phase 23: Rich chat messages
-- Adds structured message kind and attachment metadata to staff, patient portal,
-- and referring doctor portal conversations.

ALTER TABLE staff_messages
    ADD COLUMN IF NOT EXISTS message_kind VARCHAR(20) NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE patient_portal_messages
    ADD COLUMN IF NOT EXISTS message_kind VARCHAR(20) NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_portal_messages
    ADD COLUMN IF NOT EXISTS message_kind VARCHAR(20) NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_staff_messages_message_kind'
    ) THEN
        ALTER TABLE staff_messages
            ADD CONSTRAINT chk_staff_messages_message_kind
            CHECK (message_kind IN ('text', 'sticker', 'attachment'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_portal_messages_message_kind'
    ) THEN
        ALTER TABLE patient_portal_messages
            ADD CONSTRAINT chk_patient_portal_messages_message_kind
            CHECK (message_kind IN ('text', 'sticker', 'attachment'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_doctor_portal_messages_message_kind'
    ) THEN
        ALTER TABLE doctor_portal_messages
            ADD CONSTRAINT chk_doctor_portal_messages_message_kind
            CHECK (message_kind IN ('text', 'sticker', 'attachment'));
    END IF;
END $$;
