-- Reconcile notification triggers, catalog entries, audience policies, and templates.

INSERT INTO notification_event_catalog
    (event_type, category, default_priority, default_channels, description, required_variables)
VALUES
    ('AppointmentReminder', 'Clinical', 'Normal', ARRAY['Email', 'SMS'], 'Scheduled appointment reminder', '["order_number", "appointment_time"]'::jsonb),
    ('RefundRequested', 'Financial', 'Normal', ARRAY['InApp'], 'Refund submitted for financial review', '["invoice_number", "amount", "payment_method"]'::jsonb),
    ('SUPPLY_ADDED_PAYMENT_DUE', 'Financial', 'Action', ARRAY['InApp'], 'Exam supply charge added to an existing invoice', '["invoice_number", "item_name", "item_amount", "balance_amount"]'::jsonb),
    ('ManualSend', 'Operational', 'Action', ARRAY[]::text[], 'Operator-authored notification dispatched with an inline body', '[]'::jsonb),
    ('ManualReminder', 'Operational', 'Action', ARRAY[]::text[], 'Operator-authored appointment reminder dispatched with an inline body', '[]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

UPDATE notification_event_catalog SET required_variables = '["item_name", "quantity", "min_level"]'::jsonb WHERE event_type = 'LowStock';
UPDATE notification_event_catalog SET required_variables = '["item_name", "expiry_date", "quantity"]'::jsonb WHERE event_type = 'ItemExpired';
UPDATE notification_event_catalog SET required_variables = '["delivery_method"]'::jsonb WHERE event_type = 'ResultDelivered';
UPDATE notification_event_catalog SET required_variables = '["backup_file", "backup_size", "duration"]'::jsonb WHERE event_type = 'BackupCompleted';
UPDATE notification_event_catalog SET required_variables = '["error", "backup_file"]'::jsonb WHERE event_type = 'BackupFailed';
UPDATE notification_event_catalog SET required_variables = '[]'::jsonb WHERE event_type = 'STUDY_IMPORTED';
UPDATE notification_event_catalog SET required_variables = '["exported_by"]'::jsonb WHERE event_type = 'STUDY_EXPORTED';
UPDATE notification_event_catalog SET required_variables = '["updated_by", "changes"]'::jsonb WHERE event_type = 'PACS_CONFIG_UPDATED';
UPDATE notification_event_catalog SET required_variables = '[]'::jsonb WHERE event_type = 'AI_ANALYSIS_REQUESTED';
UPDATE notification_event_catalog SET required_variables = '["viewed_by"]'::jsonb WHERE event_type = 'IMAGE_VIEW';
UPDATE notification_event_catalog SET required_variables = '["invoice_number", "amount", "payment_method", "payment_date"]'::jsonb WHERE event_type = 'PaymentReceived';
UPDATE notification_event_catalog SET required_variables = '["invoice_number", "amount"]'::jsonb WHERE event_type = 'RefundProcessed';
UPDATE notification_event_catalog SET required_variables = '["patient_name", "center_name", "campaign_message", "unsubscribe_text"]'::jsonb WHERE event_type = 'MarketingCampaign';

UPDATE notification_event_catalog SET default_channels = ARRAY['InApp', 'Email'] WHERE event_type IN ('AppointmentNoShow', 'LowStock', 'ItemExpired', 'PACS_CONFIG_UPDATED');
UPDATE notification_event_catalog SET default_channels = ARRAY['InApp', 'Email', 'SMS'] WHERE event_type = 'BackupFailed';
UPDATE notification_event_catalog SET default_channels = ARRAY['InApp', 'Email'] WHERE event_type IN ('PaymentReceived', 'RefundProcessed', 'ClaimApproved', 'ClaimRejected', 'ClaimPaid');
UPDATE notification_event_catalog SET default_channels = ARRAY['InApp'] WHERE event_type IN ('OrderCreated', 'ExamCreated', 'ExamScheduled', 'ExamStatusChanged', 'ClaimSubmitted');

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority, inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
    ('RefundRequested', NULL, 'Cashier', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('RefundRequested', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('RefundRequested', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('SUPPLY_ADDED_PAYMENT_DUE', NULL, 'Cashier', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
    ('SUPPLY_ADDED_PAYMENT_DUE', NULL, 'Accountant', ARRAY['InApp'], 'Action', TRUE, FALSE, FALSE, FALSE),
    ('ExamStatusChanged', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('ExamStatusChanged', NULL, 'Radiologist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('ExamStatusChanged', NULL, 'Technician', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('ExamStatusChanged', NULL, 'Nurse', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('ExamStatusChanged', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('ExamStatusChanged', NULL, 'Accountant', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('AppointmentRequested', NULL, 'Receptionist', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('ProfileUpdateRequested', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
    ('DocumentDownloaded', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

-- All bodies use only the renderer-supported {{name}} syntax. Upsert reactivates
-- previously disabled rows and repairs installations seeded by older migrations.
INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
    ('LOGIN_FAILED', 'InApp', 'en', 'Failed Login Attempt', 'A failed login attempt was detected. IP: {{ip_address}} User: {{user_email}} Reason: {{reason}}', TRUE),
    ('LOGIN_FAILED', 'Email', 'en', 'Failed Login Attempt', 'A failed login attempt was detected. IP: {{ip_address}} User: {{user_email}} Reason: {{reason}}', TRUE),
    ('ACCOUNT_LOCKED', 'Email', 'en', 'Account Locked', 'An account was locked after repeated failed login attempts. User: {{user_email}} IP: {{ip_address}}', TRUE),
    ('ACCOUNT_LOCKED', 'SMS', 'en', NULL, 'VIARA security alert: account {{user_email}} was locked after repeated failed login attempts.', TRUE),
    ('ACCOUNT_LOCKED_ACCESS', 'Email', 'en', 'Locked Account Access Attempt', 'An access attempt was made against locked account {{user_email}} from {{ip_address}}. Locked until: {{locked_until}}', TRUE),
    ('ACCOUNT_LOCKED_ACCESS', 'SMS', 'en', NULL, 'VIARA security alert: locked account {{user_email}} was accessed from {{ip_address}}.', TRUE),
    ('TOKEN_REUSE_DETECTED', 'Email', 'en', 'Token Reuse Detected', 'A reused token was detected. Token: {{token_id}} Owner: {{owner_id}}. All sessions were revoked.', TRUE),
    ('TOKEN_REUSE_DETECTED', 'SMS', 'en', NULL, 'VIARA security alert: token reuse was detected for owner {{owner_id}}. Sessions were revoked.', TRUE),
    ('AppointmentReminder', 'WhatsApp', 'en', NULL, 'VIARA reminder: Appointment {{appointment_time}}. Order: {{order_number}}.', TRUE),
    ('AppointmentCancelled', 'WhatsApp', 'en', NULL, 'VIARA: Appointment {{order_number}} was cancelled. Contact us to reschedule.', TRUE),
    ('ReportReady', 'WhatsApp', 'en', NULL, 'VIARA: Report ready for order {{order_number}}. Log in to the portal to download it.', TRUE),
    ('AppointmentRequestReviewed', 'Email', 'en', 'Appointment Request Update', 'Your appointment request has been reviewed. Status: {{status}} Notes: {{staff_notes}}', TRUE),
    ('AppointmentNoShow', 'Email', 'en', 'Patient No-Show', 'Appointment {{order_number}} at {{appointment_time}} was marked as no-show. Reason: {{reason}}', TRUE),
    ('RefundRequested', 'InApp', 'en', 'Refund Requested', 'Refund review requested for invoice {{invoice_number}}. Amount: {{amount}}. Method: {{payment_method}}.', TRUE),
    ('SUPPLY_ADDED_PAYMENT_DUE', 'InApp', 'en', 'Supply Charge Added', 'Supply {{item_name}} was added to invoice {{invoice_number}} for {{item_amount}}. Balance due: {{balance_amount}}.', TRUE),
    ('LowStock', 'InApp', 'en', 'Low Stock', '{{item_name}} is below minimum stock. Available: {{quantity}} {{unit}}. Minimum: {{min_level}}.', TRUE),
    ('LowStock', 'Email', 'en', 'Low Stock Alert', '{{item_name}} is below minimum stock. Available: {{quantity}} {{unit}}. Minimum: {{min_level}}.', TRUE),
    ('ItemExpired', 'Email', 'en', 'Inventory Item Expired', '{{item_name}} batch {{batch_number}} expired on {{expiry_date}}. Remaining quantity: {{quantity}} {{unit}}.', TRUE),
    ('ResultDelivered', 'SMS', 'en', NULL, 'VIARA: Results for order {{order_number}} were delivered via {{delivery_method}}.', TRUE),
    ('ResultDelivered', 'WhatsApp', 'en', NULL, 'VIARA: Results for order {{order_number}} were delivered via {{delivery_method}}.', TRUE),
    ('STUDY_EXPORTED', 'Email', 'en', 'PACS Study Exported', 'PACS study {{accession_number}} for {{patient_name}} was exported by {{exported_by}}.', TRUE),
    ('PACS_CONFIG_UPDATED', 'Email', 'en', 'PACS Configuration Updated', 'PACS configuration was updated by {{updated_by}}. Changes: {{changes}}.', TRUE),
    ('BackupFailed', 'Email', 'en', 'Backup Failed', 'Database backup failed. File: {{backup_file}}. Error: {{error}}.', TRUE),
    ('BackupFailed', 'SMS', 'en', NULL, 'VIARA critical alert: database backup {{backup_file}} failed. Error: {{error}}.', TRUE),
    ('PaymentReceived', 'Email', 'en', 'Payment Confirmation - Invoice {{invoice_number}}', 'Payment of {{amount}} was received for invoice {{invoice_number}} via {{payment_method}} on {{payment_date}}.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

WITH active_contract(event_type, channel) AS (VALUES
    ('AppointmentCreated', 'Email'), ('AppointmentCreated', 'SMS'),
    ('AppointmentReminder', 'Email'), ('AppointmentReminder', 'SMS'), ('AppointmentReminder', 'WhatsApp'),
    ('AppointmentCancelled', 'Email'), ('AppointmentCancelled', 'SMS'), ('AppointmentCancelled', 'WhatsApp'),
    ('AppointmentRescheduled', 'Email'), ('AppointmentRescheduled', 'SMS'),
    ('AppointmentNoShow', 'InApp'), ('AppointmentNoShow', 'Email'),
    ('PrepInstructions', 'Email'), ('PrepInstructions', 'SMS'),
    ('FollowUpReminder', 'Email'), ('FollowUpReminder', 'SMS'),
    ('ReportReady', 'Email'), ('ReportReady', 'SMS'), ('ReportReady', 'WhatsApp'),
    ('ResultDelivered', 'Email'), ('ResultDelivered', 'SMS'), ('ResultDelivered', 'WhatsApp'),
    ('PaymentDue', 'Email'), ('PaymentDue', 'SMS'),
    ('MarketingCampaign', 'Email'), ('MarketingCampaign', 'SMS'), ('MarketingCampaign', 'WhatsApp'),
    ('PaymentReceived', 'Email'), ('PaymentReceived', 'InApp'),
    ('OrderCreated', 'InApp'), ('ExamCreated', 'InApp'), ('ExamScheduled', 'InApp'), ('ExamStatusChanged', 'InApp'),
    ('RefundRequested', 'InApp'), ('RefundProcessed', 'InApp'), ('RefundProcessed', 'Email'),
    ('LOGIN_FAILED', 'InApp'), ('LOGIN_FAILED', 'Email'),
    ('ACCOUNT_LOCKED', 'InApp'), ('ACCOUNT_LOCKED', 'Email'), ('ACCOUNT_LOCKED', 'SMS'),
    ('ACCOUNT_LOCKED_ACCESS', 'InApp'), ('ACCOUNT_LOCKED_ACCESS', 'Email'), ('ACCOUNT_LOCKED_ACCESS', 'SMS'),
    ('TOKEN_REUSE_DETECTED', 'InApp'), ('TOKEN_REUSE_DETECTED', 'Email'), ('TOKEN_REUSE_DETECTED', 'SMS'),
    ('PERMISSION_DENIED', 'InApp'),
    ('STAFF_CREATED', 'InApp'), ('STAFF_UPDATED', 'InApp'), ('STAFF_DEACTIVATED', 'InApp'),
    ('STUDY_IMPORTED', 'InApp'), ('STUDY_EXPORTED', 'InApp'), ('STUDY_EXPORTED', 'Email'),
    ('PACS_CONFIG_UPDATED', 'InApp'), ('PACS_CONFIG_UPDATED', 'Email'),
    ('AI_ANALYSIS_REQUESTED', 'InApp'), ('IMAGE_VIEW', 'InApp'),
    ('ClaimSubmitted', 'InApp'), ('ClaimApproved', 'InApp'), ('ClaimApproved', 'Email'),
    ('ClaimRejected', 'InApp'), ('ClaimRejected', 'Email'), ('ClaimPaid', 'InApp'), ('ClaimPaid', 'Email'),
    ('BackupCompleted', 'InApp'), ('BackupFailed', 'InApp'), ('BackupFailed', 'Email'), ('BackupFailed', 'SMS'),
    ('DATA_EXPORT_REQUESTED', 'InApp'), ('DATA_EXPORT_REQUESTED', 'Email'),
    ('CONSENT_REVOKED', 'InApp'), ('PRIVACY_REQUEST_RESOLVED', 'InApp'), ('PRIVACY_REQUEST_RESOLVED', 'Email'),
    ('AppointmentRequested', 'InApp'), ('AppointmentRequestReviewed', 'Email'),
    ('ProfileUpdateRequested', 'InApp'), ('DocumentDownloaded', 'InApp'), ('ChatMessageReceived', 'InApp'),
    ('LowStock', 'InApp'), ('LowStock', 'Email'), ('ItemExpired', 'InApp'), ('ItemExpired', 'Email'),
    ('PurchaseOrderReceived', 'InApp'), ('PartialPaymentException', 'InApp'),
    ('SUPPLY_ADDED_PAYMENT_DUE', 'InApp')
)
UPDATE notification_templates template
SET is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
FROM active_contract contract
WHERE template.event_type = contract.event_type
  AND template.channel = contract.channel
  AND template.language = 'en';
