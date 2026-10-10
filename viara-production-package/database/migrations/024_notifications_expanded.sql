-- Phase 12: Communication & Notifications — Expanded Schema

-- 1. Expand existing notifications table
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'Email'
        CHECK (channel IN ('Email', 'SMS', 'WhatsApp', 'InApp')),
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS entity_id UUID,
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referring_doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

-- Rename type column value constraint (Email, SMS already exist; add WhatsApp, InApp)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('Email', 'SMS', 'WhatsApp', 'InApp', 'Email_Stub', 'SMS_Stub', 'WhatsApp_Stub'));

-- 2. Notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
    template_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(80) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('Email', 'SMS', 'WhatsApp', 'InApp')),
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    subject VARCHAR(300),                 -- For Email only
    body TEXT NOT NULL,                   -- Supports {{variable}} placeholders
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_type, channel, language)
);

-- 3. Notification jobs queue (scheduled/pending delivery)
CREATE TABLE IF NOT EXISTS notification_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(80) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('Email', 'SMS', 'WhatsApp', 'InApp')),
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('Patient', 'Doctor', 'Staff', 'Custom')),
    recipient_id UUID,                    -- patient_id or doctor_id
    recipient_contact VARCHAR(300),       -- email or phone (override / custom)
    entity_type VARCHAR(50),              -- 'Appointment', 'Exam', 'Invoice', etc.
    entity_id UUID,
    variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Processing', 'Sent', 'Failed', 'Cancelled', 'Skipped')),
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    notification_id UUID REFERENCES notifications(notification_id) ON DELETE SET NULL,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Notification preferences per patient and referring doctor
CREATE TABLE IF NOT EXISTS notification_preferences (
    preference_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Link to either patient or referring doctor (not both)
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE CASCADE,
    -- Channel opt-ins
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    -- Event opt-ins
    notify_appointment_created BOOLEAN NOT NULL DEFAULT TRUE,
    notify_appointment_reminder BOOLEAN NOT NULL DEFAULT TRUE,
    notify_appointment_rescheduled BOOLEAN NOT NULL DEFAULT TRUE,
    notify_appointment_cancelled BOOLEAN NOT NULL DEFAULT TRUE,
    notify_prep_instructions BOOLEAN NOT NULL DEFAULT TRUE,
    notify_payment_due BOOLEAN NOT NULL DEFAULT TRUE,
    notify_report_ready BOOLEAN NOT NULL DEFAULT TRUE,
    notify_result_delivered BOOLEAN NOT NULL DEFAULT TRUE,
    notify_followup_reminder BOOLEAN NOT NULL DEFAULT FALSE,
    notify_marketing BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_pref_single_owner CHECK (
        (patient_id IS NOT NULL AND doctor_id IS NULL) OR
        (patient_id IS NULL AND doctor_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_patient ON notifications(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_event_type ON notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notification_templates_event ON notification_templates(event_type, channel, language);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status ON notification_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_entity ON notification_jobs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_patient ON notification_preferences(patient_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_doctor ON notification_preferences(doctor_id);

-- Seed default templates
INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
-- AppointmentCreated
('AppointmentCreated', 'Email', 'en',
 'Appointment Confirmed – {{order_number}}',
 'Dear {{patient_name}},\n\nYour appointment has been scheduled.\n\nOrder: {{order_number}}\nDate & Time: {{appointment_time}}\nExam: {{exam_type}}\nModality: {{modality}}\n\n{{prep_instructions}}\n\nPlease arrive 15 minutes early.\n\nRegards,\nVIARA Radiology Center'),
('AppointmentCreated', 'SMS', 'en',
 NULL,
 'VIARA: Appt confirmed for {{patient_name}} on {{appointment_time}}. Order: {{order_number}}. {{prep_short}}'),

-- AppointmentReminder
('AppointmentReminder', 'Email', 'en',
 'Reminder: Your Appointment Tomorrow – {{order_number}}',
 'Dear {{patient_name}},\n\nThis is a reminder that you have an appointment tomorrow.\n\nDate & Time: {{appointment_time}}\nExam: {{exam_type}}\nOrder: {{order_number}}\n\n{{prep_instructions}}\n\nRegards,\nVIARA Radiology Center'),
('AppointmentReminder', 'SMS', 'en',
 NULL,
 'VIARA Reminder: Appointment tomorrow {{appointment_time}}. Order: {{order_number}}. Reply STOP to opt out.'),

-- AppointmentRescheduled
('AppointmentRescheduled', 'Email', 'en',
 'Appointment Rescheduled – {{order_number}}',
 'Dear {{patient_name}},\n\nYour appointment has been rescheduled.\n\nNew Date & Time: {{appointment_time}}\nOrder: {{order_number}}\nReason: {{reschedule_reason}}\n\nRegards,\nVIARA Radiology Center'),
('AppointmentRescheduled', 'SMS', 'en',
 NULL,
 'VIARA: Appt rescheduled to {{appointment_time}}. Order: {{order_number}}.'),

-- AppointmentCancelled
('AppointmentCancelled', 'Email', 'en',
 'Appointment Cancelled – {{order_number}}',
 'Dear {{patient_name}},\n\nYour appointment (Order: {{order_number}}) has been cancelled.\nReason: {{cancellation_reason}}\n\nPlease contact us to reschedule.\n\nRegards,\nVIARA Radiology Center'),
('AppointmentCancelled', 'SMS', 'en',
 NULL,
 'VIARA: Appt {{order_number}} cancelled. Contact us to reschedule.'),

-- ReportReady
('ReportReady', 'Email', 'en',
 'Your Radiology Report is Ready – {{order_number}}',
 'Dear {{patient_name}},\n\nYour radiology report for Order {{order_number}} is now finalized and available.\n\nYou can download your report from the Patient Portal at any time.\n\nRegards,\nVIARA Radiology Center'),
('ReportReady', 'SMS', 'en',
 NULL,
 'VIARA: Report ready for {{patient_name}}. Order: {{order_number}}. Log in to your portal to download.'),

-- ResultDelivered
('ResultDelivered', 'Email', 'en',
 'Results Delivered – {{order_number}}',
 'Dear {{patient_name}},\n\nYour radiology results for Order {{order_number}} have been delivered via {{delivery_method}}.\n\nRegards,\nVIARA Radiology Center'),

-- PaymentDue
('PaymentDue', 'Email', 'en',
 'Payment Due – Invoice {{invoice_number}}',
 'Dear {{patient_name}},\n\nThis is a reminder that payment is due for Invoice {{invoice_number}}.\n\nAmount: {{amount}}\nDue Date: {{due_date}}\n\nPlease contact us to arrange payment.\n\nRegards,\nVIARA Radiology Center'),
('PaymentDue', 'SMS', 'en',
 NULL,
 'VIARA: Payment due for Invoice {{invoice_number}}. Amount: {{amount}}. Due: {{due_date}}. Contact us for payment options.'),

-- PrepInstructions
('PrepInstructions', 'Email', 'en',
 'Preparation Instructions – {{order_number}}',
 'Dear {{patient_name}},\n\nPlease follow these preparation instructions before your appointment (Order: {{order_number}}) on {{appointment_time}}:\n\n{{prep_instructions}}\n\nIf you have questions, please contact us.\n\nRegards,\nVIARA Radiology Center'),
('PrepInstructions', 'SMS', 'en',
 NULL,
 'VIARA: Prep required for appt {{order_number}} on {{appointment_time}}. {{prep_short}} Contact us for details.'),

-- FollowUpReminder
('FollowUpReminder', 'Email', 'en',
 'Follow-Up Reminder – VIARA Radiology',
 'Dear {{patient_name}},\n\nThis is a reminder to schedule your follow-up radiology appointment.\n\nPrevious exam: {{exam_type}} (Order: {{order_number}})\n\nPlease contact us at your convenience to book your next visit.\n\nRegards,\nVIARA Radiology Center'),
('FollowUpReminder', 'SMS', 'en',
 NULL,
 'VIARA: Follow-up reminder for {{patient_name}}. Please schedule your next radiology visit. Call us to book.')

ON CONFLICT (event_type, channel, language) DO NOTHING;
