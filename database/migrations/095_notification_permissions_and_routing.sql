-- Notification Service Hardening: Staff Preferences, Event Catalog, and Audience Policies
-- Idempotent migration with IF NOT EXISTS guards.

-- 1. Extend notification_preferences for staff users
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS staff_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS role VARCHAR(50),
    ADD COLUMN IF NOT EXISTS inapp_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_security_event BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_staff_lifecycle BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_order_events BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_queue_change BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_pacs_alert BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_backup_status BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_privacy_request BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_chat_message BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_inventory_expiry BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_claim_update BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notify_payment_update BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quiet_hours_start INTEGER DEFAULT 22,
    ADD COLUMN IF NOT EXISTS quiet_hours_end INTEGER DEFAULT 7;

-- Unique index for staff preferences
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_prefs_staff
    ON notification_preferences(staff_user_id)
    WHERE staff_user_id IS NOT NULL;

-- 2. Notification event catalog
CREATE TABLE IF NOT EXISTS notification_event_catalog (
    event_type VARCHAR(80) PRIMARY KEY,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Security', 'Clinical', 'Financial', 'Operational', 'Patient', 'System')),
    default_priority VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (default_priority IN ('Normal', 'Action', 'Warning', 'Critical')),
    default_channels TEXT[] DEFAULT '{Email}',
    description TEXT,
    required_variables JSONB DEFAULT '[]'::jsonb
);

-- 3. Notification audience policies
CREATE TABLE IF NOT EXISTS notification_audience_policies (
    policy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(80) REFERENCES notification_event_catalog(event_type) ON DELETE CASCADE,
    event_category VARCHAR(50) CHECK (event_category IN ('Security', 'Clinical', 'Financial', 'Operational', 'Patient', 'System')),
    role VARCHAR(50) NOT NULL,
    allowed_channels TEXT[] NOT NULL,
    min_priority VARCHAR(20) NOT NULL DEFAULT 'Normal' CHECK (min_priority IN ('Normal', 'Action', 'Warning', 'Critical')),
    inapp_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT TRUE,
    whatsapp_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_policy_target CHECK (event_type IS NOT NULL OR event_category IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_audience_policies_role
    ON notification_audience_policies(role, min_priority);

CREATE INDEX IF NOT EXISTS idx_audience_policies_event
    ON notification_audience_policies(event_type, event_category);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audience_policies_event_role
    ON notification_audience_policies(event_type, role);

-- 4. Seed event catalog
INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description) VALUES
('AppointmentCreated', 'Clinical', 'Normal', '{Email, SMS}', 'Patient appointment confirmation'),
('AppointmentCancelled', 'Clinical', 'Action', '{Email, SMS}', 'Patient appointment cancellation'),
('AppointmentRescheduled', 'Clinical', 'Action', '{Email, SMS}', 'Patient appointment reschedule'),
('AppointmentNoShow', 'Operational', 'Warning', '{Email}', 'Patient no-show alert'),
('PrepInstructions', 'Clinical', 'Normal', '{Email, SMS}', 'Preparation instructions for exam'),
('PaymentDue', 'Financial', 'Action', '{Email, SMS}', 'Invoice payment reminder'),
('PaymentReceived', 'Financial', 'Normal', '{Email}', 'Payment confirmation'),
('ReportReady', 'Clinical', 'Normal', '{Email, SMS}', 'Finalized report available'),
('ResultDelivered', 'Clinical', 'Normal', '{Email, SMS, WhatsApp}', 'Results delivered to patient'),
('FollowUpReminder', 'Clinical', 'Normal', '{Email, SMS}', 'Follow-up appointment reminder'),
('MarketingCampaign', 'Patient', 'Normal', '{Email, SMS, WhatsApp}', 'Marketing message'),
('OrderCreated', 'Clinical', 'Normal', '{Email}', 'New order/exam created'),
('ExamCreated', 'Clinical', 'Normal', '{Email}', 'New exam record created'),
('ExamScheduled', 'Clinical', 'Normal', '{Email}', 'Exam scheduled for patient'),
('ExamStatusChanged', 'Clinical', 'Normal', '{Email}', 'Exam status transition'),
('LowStock', 'Operational', 'Warning', '{InApp}', 'Inventory below minimum level'),
('StockExpired', 'Operational', 'Warning', '{InApp}', 'Inventory item expired'),
('LOGIN_FAILED', 'Security', 'Warning', '{InApp}', 'Failed login attempt'),
('ACCOUNT_LOCKED', 'Security', 'Critical', '{InApp, Email}', 'Account locked after failed attempts'),
('ACCOUNT_LOCKED_ACCESS', 'Security', 'Critical', '{InApp, Email}', 'Access attempt on locked account'),
('TOKEN_REUSE_DETECTED', 'Security', 'Critical', '{InApp, Email}', 'Token reuse attack detected'),
('PERMISSION_DENIED', 'Security', 'Warning', '{InApp}', 'Permission denied event'),
('STAFF_CREATED', 'System', 'Normal', '{InApp}', 'New staff account created'),
('STAFF_UPDATED', 'System', 'Normal', '{InApp}', 'Staff account updated'),
('STAFF_DEACTIVATED', 'System', 'Normal', '{InApp}', 'Staff account deactivated'),
('STUDY_IMPORTED', 'Clinical', 'Normal', '{InApp}', 'PACS study imported'),
('STUDY_EXPORTED', 'Clinical', 'Warning', '{InApp, Email}', 'PACS study exported'),
('PACS_CONFIG_UPDATED', 'System', 'Warning', '{InApp}', 'PACS configuration changed'),
('AI_ANALYSIS_REQUESTED', 'Clinical', 'Normal', '{InApp}', 'AI analysis requested'),
('IMAGE_VIEW', 'Clinical', 'Normal', '{InApp}', 'Image viewed in PACS'),
('ClaimSubmitted', 'Financial', 'Normal', '{Email}', 'Insurance claim submitted'),
('ClaimApproved', 'Financial', 'Normal', '{Email}', 'Insurance claim approved'),
('ClaimRejected', 'Financial', 'Action', '{Email}', 'Insurance claim rejected'),
('ClaimPaid', 'Financial', 'Normal', '{Email}', 'Insurance claim paid'),
('BackupCompleted', 'System', 'Normal', '{InApp}', 'Database backup completed'),
('BackupFailed', 'System', 'Critical', '{InApp, Email}', 'Database backup failed'),
('DATA_EXPORT_REQUESTED', 'Patient', 'Normal', '{InApp, Email}', 'Patient data export requested'),
('CONSENT_REVOKED', 'Patient', 'Warning', '{InApp}', 'Patient consent revoked'),
('PRIVACY_REQUEST_RESOLVED', 'Patient', 'Normal', '{Email}', 'Privacy request resolved'),
('AppointmentRequested', 'Patient', 'Normal', '{InApp}', 'Patient appointment request submitted'),
('AppointmentRequestReviewed', 'Patient', 'Normal', '{Email}', 'Appointment request reviewed'),
('ProfileUpdateRequested', 'Patient', 'Normal', '{InApp}', 'Profile update request submitted'),
('DocumentDownloaded', 'Patient', 'Normal', '{InApp}', 'Patient document downloaded'),
('ChatMessageReceived', 'Operational', 'Normal', '{InApp}', 'New chat message received'),
('ItemExpired', 'Operational', 'Warning', '{InApp}', 'Inventory item expired'),
('PurchaseOrderReceived', 'Operational', 'Normal', '{InApp}', 'Purchase order received'),
('RefundProcessed', 'Financial', 'Normal', '{Email}', 'Refund processed'),
('PartialPaymentException', 'Financial', 'Warning', '{InApp}', 'Partial payment exception recorded')
ON CONFLICT (event_type) DO NOTHING;

-- 5. Seed default audience policies
-- Security events: Admin + HR get all; other roles get Critical only
INSERT INTO notification_audience_policies (event_type, event_category, role, allowed_channels, min_priority, inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
('LOGIN_FAILED', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('LOGIN_FAILED', NULL, 'HR', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('LOGIN_FAILED', NULL, 'Developer', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('ACCOUNT_LOCKED', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('ACCOUNT_LOCKED', NULL, 'HR', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('ACCOUNT_LOCKED', NULL, 'Developer', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('ACCOUNT_LOCKED_ACCESS', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('ACCOUNT_LOCKED_ACCESS', NULL, 'HR', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('ACCOUNT_LOCKED_ACCESS', NULL, 'Developer', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('TOKEN_REUSE_DETECTED', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('TOKEN_REUSE_DETECTED', NULL, 'HR', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('TOKEN_REUSE_DETECTED', NULL, 'Developer', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('PERMISSION_DENIED', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PERMISSION_DENIED', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PERMISSION_DENIED', NULL, 'Developer', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
-- Staff lifecycle: Admin + HR only
('STAFF_CREATED', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STAFF_CREATED', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STAFF_UPDATED', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STAFF_UPDATED', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STAFF_DEACTIVATED', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STAFF_DEACTIVATED', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
-- Clinical events: relevant clinical staff + Admin
('OrderCreated', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('OrderCreated', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('OrderCreated', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamCreated', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamCreated', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamCreated', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamCreated', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamCreated', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamScheduled', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamScheduled', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamScheduled', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamScheduled', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ExamScheduled', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('AppointmentNoShow', NULL, 'Receptionist', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('AppointmentNoShow', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
-- PACS events: Radiologist, Technician, Admin
('STUDY_IMPORTED', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STUDY_IMPORTED', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STUDY_IMPORTED', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('STUDY_EXPORTED', NULL, 'Radiologist', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('STUDY_EXPORTED', NULL, 'Technician', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('STUDY_EXPORTED', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('PACS_CONFIG_UPDATED', NULL, 'Radiologist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PACS_CONFIG_UPDATED', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PACS_CONFIG_UPDATED', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('AI_ANALYSIS_REQUESTED', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('AI_ANALYSIS_REQUESTED', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('IMAGE_VIEW', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
-- System events: Admin only (unless overridden)
('BackupCompleted', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('BackupCompleted', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('BackupFailed', NULL, 'Admin', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('BackupFailed', NULL, 'Accountant', ARRAY['InApp', 'Email'], 'Critical', TRUE, TRUE, FALSE, FALSE),
-- Privacy: Admin + HR
('DATA_EXPORT_REQUESTED', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('DATA_EXPORT_REQUESTED', NULL, 'HR', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('CONSENT_REVOKED', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('CONSENT_REVOKED', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PRIVACY_REQUEST_RESOLVED', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('PRIVACY_REQUEST_RESOLVED', NULL, 'HR', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
-- Financial: Accountant, Admin, Cashier
('ClaimSubmitted', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ClaimSubmitted', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ClaimApproved', NULL, 'Accountant', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('ClaimApproved', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('ClaimRejected', NULL, 'Accountant', ARRAY['InApp', 'Email'], 'Action', TRUE, TRUE, FALSE, FALSE),
('ClaimRejected', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Action', TRUE, TRUE, FALSE, FALSE),
('ClaimPaid', NULL, 'Accountant', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('ClaimPaid', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('PaymentReceived', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PaymentReceived', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PaymentReceived', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('RefundProcessed', NULL, 'Cashier', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('RefundProcessed', NULL, 'Accountant', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
('RefundProcessed', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Normal', TRUE, TRUE, FALSE, FALSE),
-- Inventory: Technician, Admin
('StockExpired', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('StockExpired', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('PurchaseOrderReceived', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('PurchaseOrderReceived', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
-- Chat: all roles get InApp
('ChatMessageReceived', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Insurance_Staff', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Marketing', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('ChatMessageReceived', NULL, 'Developer', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

-- 6. Index for efficient policy lookup by role
CREATE INDEX IF NOT EXISTS idx_audience_policies_role_lookup
    ON notification_audience_policies(role, min_priority, event_type);
