-- Restore missing bilingual notification templates from the reviewed historical seed definitions.

-- This migration does not overwrite existing administrator-authored templates.

CREATE TEMP TABLE notification_template_seed (LIKE notification_templates INCLUDING ALL) ON COMMIT DROP;

-- Source: 024_notifications_expanded.sql

-- Seed default templates
INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
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

-- Source: 030_security_events_and_roles.sql

-- Marketing campaign notification template
INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('MarketingCampaign', 'Email', 'en',
 'News from {{center_name}}',
 'Dear {{patient_name}},\n\n{{campaign_message}}\n\nReply STOP to opt out of marketing messages.\n\nRegards,\n{{center_name}}'),
('MarketingCampaign', 'SMS', 'en',
 NULL,
 '{{center_name}}: {{campaign_message}} Reply STOP to opt out.')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 073_marketing_campaign_delivery_controls.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('MarketingCampaign', 'Email', 'en',
 'A message from {{center_name}}',
 'Hello {{patient_name}},

{{campaign_message}}

{{unsubscribe_text}}'),
('MarketingCampaign', 'SMS', 'en',
 NULL,
 '{{center_name}}: {{campaign_message}} {{unsubscribe_text}}'),
('MarketingCampaign', 'WhatsApp', 'en',
 NULL,
 '{{center_name}}: {{campaign_message}}

{{unsubscribe_text}}')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 096_notification_templates_new_events.sql

-- Seed additional notification templates for new event types
-- Idempotent with ON CONFLICT DO NOTHING

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
-- Security events (InApp)
('LOGIN_FAILED', 'InApp', 'en', 'Failed Login Attempt', 'A failed login attempt was detected.\n\nIP: {{ip_address}}\nUser: {{user_email || "Unknown"}}\nReason: {{reason}}'),
('ACCOUNT_LOCKED', 'InApp', 'en', 'Account Locked', 'Account has been locked due to multiple failed login attempts.\n\nUser: {{user_email}}\nIP: {{ip_address}}\nDuration: 15 minutes'),
('ACCOUNT_LOCKED_ACCESS', 'InApp', 'en', 'Locked Account Access Attempt', 'Someone tried to access a locked account.\n\nUser: {{user_email}}\nIP: {{ip_address}}\nLocked Until: {{locked_until}}'),
('TOKEN_REUSE_DETECTED', 'InApp', 'en', 'Token Reuse Detected', 'A reused token was detected - possible session hijacking.\n\nToken ID: {{token_id}}\nOwner ID: {{owner_id}}\nAction: All sessions revoked.'),
('PERMISSION_DENIED', 'InApp', 'en', 'Permission Denied', 'An unauthorized access attempt was blocked.\n\nUser: {{user_email}}\nRole: {{role}}\nRequired: {{required_permission}}\nPath: {{path}}'),
-- Staff lifecycle (InApp)
('STAFF_CREATED', 'InApp', 'en', 'New Staff Account Created', 'A new staff account has been created.\n\nName: {{staff_name}}\nEmail: {{staff_email}}\nRole: {{role}}\nCreated By: {{created_by}}'),
('STAFF_UPDATED', 'InApp', 'en', 'Staff Account Updated', 'A staff account has been updated.\n\nName: {{staff_name}}\nEmail: {{staff_email}}\nChanged Fields: {{changed_fields}}'),
('STAFF_DEACTIVATED', 'InApp', 'en', 'Staff Account Deactivated', 'A staff account has been deactivated.\n\nName: {{staff_name}}\nEmail: {{staff_email}}\nRole: {{role}}'),
-- Orders / Exams (InApp)
('OrderCreated', 'InApp', 'en', 'New Order Created', 'A new order has been created.\n\nOrder #: {{order_number}}\nPatient: {{patient_name}}\nExam Type: {{exam_type}}\nPriority: {{priority}}'),
('ExamCreated', 'InApp', 'en', 'New Exam Created', 'A new exam has been created.\n\nExam ID: {{exam_id}}\nOrder #: {{order_number}}\nPatient: {{patient_name}}\nStatus: {{status}}'),
('ExamScheduled', 'InApp', 'en', 'Exam Scheduled', 'An exam has been scheduled.\n\nExam ID: {{exam_id}}\nOrder #: {{order_number}}\nPatient: {{patient_name}}\nTime: {{exam_time}}'),
('ExamStatusChanged', 'InApp', 'en', 'Exam Status Changed', 'Exam status has been updated.\n\nExam ID: {{exam_id}}\nOrder #: {{order_number}}\nOld Status: {{old_status}}\nNew Status: {{new_status}}'),
('AppointmentNoShow', 'InApp', 'en', 'Patient No-Show', 'A patient did not show up for their appointment.\n\nOrder #: {{order_number}}\nPatient: {{patient_name}}\nTime: {{appointment_time}}'),
-- PACS events (InApp)
('STUDY_IMPORTED', 'InApp', 'en', 'Study Imported', 'A new study has been imported into PACS.\n\nAccession #: {{accession_number}}\nPatient: {{patient_name}}\nModality: {{modality}}'),
('STUDY_EXPORTED', 'InApp', 'en', 'Study Exported', 'A study has been exported from PACS.\n\nAccession #: {{accession_number}}\nPatient: {{patient_name}}\nExported By: {{exported_by}}'),
('PACS_CONFIG_UPDATED', 'InApp', 'en', 'PACS Configuration Updated', 'PACS configuration has been changed.\n\nUpdated By: {{updated_by}}\nChanges: {{changes}}'),
('AI_ANALYSIS_REQUESTED', 'InApp', 'en', 'AI Analysis Requested', 'AI analysis has been requested for a study.\n\nAccession #: {{accession_number}}\nModel: {{ai_model}}'),
('IMAGE_VIEW', 'InApp', 'en', 'Image Viewed', 'An image was viewed in PACS.\n\nAccession #: {{accession_number}}\nViewed By: {{viewed_by}}'),
-- System events (InApp)
('BackupCompleted', 'InApp', 'en', 'Backup Completed', 'Database backup has completed successfully.\n\nFile: {{backup_file}}\nSize: {{backup_size}}\nDuration: {{duration}}'),
('BackupFailed', 'InApp', 'en', 'Backup Failed', 'Database backup failed.\n\nError: {{error}}\nFile: {{backup_file}}'),
-- Privacy events (InApp + Email)
('DATA_EXPORT_REQUESTED', 'InApp', 'en', 'Data Export Requested', 'A patient data export has been requested.\n\nPatient: {{patient_name}}\nRequest ID: {{request_id}}\nRequested By: {{requested_by}}'),
('DATA_EXPORT_REQUESTED', 'Email', 'en', 'Data Export Requested', 'Dear {{recipient_name}},\n\nA patient data export request has been submitted.\n\nPatient: {{patient_name}}\nRequest ID: {{request_id}}\nPlease review and process this request.\n\nRegards,\nVIARA System'),
('CONSENT_REVOKED', 'InApp', 'en', 'Consent Revoked', 'A patient has revoked consent.\n\nPatient: {{patient_name}}\nConsent Type: {{consent_type}}\nRevoked At: {{revoked_at}}'),
('PRIVACY_REQUEST_RESOLVED', 'InApp', 'en', 'Privacy Request Resolved', 'A privacy request has been resolved.\n\nPatient: {{patient_name}}\nRequest ID: {{request_id}}\nResolution: {{resolution}}'),
('PRIVACY_REQUEST_RESOLVED', 'Email', 'en', 'Privacy Request Resolved', 'Dear {{patient_name}},\n\nYour privacy request (ID: {{request_id}}) has been resolved.\n\nResolution: {{resolution}}\n\nIf you have questions, please contact us.\n\nRegards,\nVIARA Privacy Team'),
-- Portal events (InApp + Email)
('AppointmentRequested', 'InApp', 'en', 'New Appointment Request', 'A patient has submitted an appointment request.\n\nPatient: {{patient_name}}\nPreferred Date: {{preferred_date}}\nExam Type: {{exam_type}}'),
('AppointmentRequestReviewed', 'InApp', 'en', 'Appointment Request Reviewed', 'Your appointment request has been reviewed.\n\nStatus: {{status}}\nStaff Notes: {{staff_notes}}'),
('AppointmentRequestReviewed', 'Email', 'en', 'Appointment Request Update', 'Dear {{patient_name}},\n\nYour appointment request has been reviewed.\n\nStatus: {{status}}\n{{#if staff_notes}}Notes: {{staff_notes}}{{/if}}\n\nPlease contact us for next steps.\n\nRegards,\nVIARA Team'),
('ProfileUpdateRequested', 'InApp', 'en', 'Profile Update Requested', 'A patient has requested a profile update.\n\nPatient: {{patient_name}}\nFields: {{fields}}'),
('DocumentDownloaded', 'InApp', 'en', 'Document Downloaded', 'A patient document was downloaded.\n\nDocument: {{document_title}}\nPatient: {{patient_name}}\nDownloaded By: {{downloaded_by}}'),
-- Chat (InApp)
('ChatMessageReceived', 'InApp', 'en', 'New Message', 'You have a new message from {{sender_name}}.\n\n{{message_preview}}'),
-- Inventory events (InApp)
('ItemExpired', 'InApp', 'en', 'Inventory Item Expired', 'An inventory item has expired.\n\nItem: {{item_name}}\nBatch: {{batch_number}}\nExpiry Date: {{expiry_date}}\nQuantity: {{quantity}}'),
('PurchaseOrderReceived', 'InApp', 'en', 'Purchase Order Received', 'A purchase order has been received.\n\nPO #: {{po_number}}\nSupplier: {{supplier_name}}\nItems: {{item_count}}'),
-- Financial events (InApp + Email)
('PaymentReceived', 'InApp', 'en', 'Payment Received', 'A payment has been received.\n\nInvoice: {{invoice_number}}\nAmount: {{amount}}\nMethod: {{payment_method}}'),
('PaymentReceived', 'Email', 'en', 'Payment Confirmation', 'Dear {{patient_name}},\n\nWe have received your payment.\n\nInvoice: {{invoice_number}}\nAmount: {{amount}}\nDate: {{payment_date}}\n\nThank you for your payment.\n\nRegards,\nVIARA Billing'),
('RefundProcessed', 'InApp', 'en', 'Refund Processed', 'A refund has been processed.\n\nInvoice: {{invoice_number}}\nAmount: {{amount}}\nReason: {{reason}}'),
('RefundProcessed', 'Email', 'en', 'Refund Confirmation', 'Dear {{patient_name}},\n\nYour refund has been processed.\n\nInvoice: {{invoice_number}}\nAmount: {{amount}}\nExpected Time: 5-10 business days\n\nRegards,\nVIARA Billing'),
('ClaimSubmitted', 'InApp', 'en', 'Claim Submitted', 'An insurance claim has been submitted.\n\nClaim ID: {{claim_id}}\nPatient: {{patient_name}}\nProvider: {{provider_name}}\nAmount: {{amount}}'),
('ClaimApproved', 'InApp', 'en', 'Claim Approved', 'An insurance claim has been approved.\n\nClaim ID: {{claim_id}}\nPatient: {{patient_name}}\nApproved Amount: {{approved_amount}}'),
('ClaimApproved', 'Email', 'en', 'Claim Approved', 'Dear {{patient_name}},\n\nYour insurance claim has been approved.\n\nClaim ID: {{claim_id}}\nApproved Amount: {{approved_amount}}\n\nPlease contact us for payment arrangements.\n\nRegards,\nVIARA Billing'),
('ClaimRejected', 'InApp', 'en', 'Claim Rejected', 'An insurance claim has been rejected.\n\nClaim ID: {{claim_id}}\nPatient: {{patient_name}}\nReason: {{rejection_reason}}'),
('ClaimRejected', 'Email', 'en', 'Claim Update', 'Dear {{patient_name}},\n\nYour insurance claim has been reviewed.\n\nClaim ID: {{claim_id}}\nStatus: Rejected\nReason: {{rejection_reason}}\n\nPlease contact us for next steps.\n\nRegards,\nVIARA Billing'),
('ClaimPaid', 'InApp', 'en', 'Claim Paid', 'An insurance claim has been paid.\n\nClaim ID: {{claim_id}}\nPatient: {{patient_name}}\nPaid Amount: {{paid_amount}}'),
('ClaimPaid', 'Email', 'en', 'Claim Payment', 'Dear {{patient_name}},\n\nYour insurance claim has been paid.\n\nClaim ID: {{claim_id}}\nPaid Amount: {{paid_amount}}\n\nThank you for choosing VIARA.\n\nRegards,\nVIARA Billing'),
('PartialPaymentException', 'InApp', 'en', 'Partial Payment Exception', 'A partial payment exception has been recorded.\n\nInvoice: {{invoice_number}}\nPatient: {{patient_name}}\nAmount: {{amount}}\nReason: {{reason}}')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 123_notification_contract_fixes.sql

-- All bodies use only the renderer-supported {{name}} syntax. Upsert reactivates
-- previously disabled rows and repairs installations seeded by older migrations.
INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
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
UPDATE notification_template_seed template
SET is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
FROM active_contract contract
WHERE template.event_type = contract.event_type
  AND template.channel = contract.channel
  AND template.language = 'en';

-- Source: 124_equipment_and_critical_notifications.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('EquipmentMaintenanceCreated', 'InApp', 'en', 'Maintenance Scheduled', 'Maintenance {{maintenance_id}} was created for {{modality_name}} ({{maintenance_type}}) on {{scheduled_date}}. Status: {{status}}.'),
('EquipmentMaintenanceUpdated', 'InApp', 'en', 'Maintenance Updated', 'Maintenance {{maintenance_id}} for {{modality_name}} is now {{status}}. Changed: {{changed_fields}}.'),
('EquipmentDowntimeCreated', 'InApp', 'en', 'Equipment Downtime Created', '{{modality_name}} downtime was created from {{start_time}} to {{end_time}}. Status: {{status}}. Reason: {{reason}}.'),
('EquipmentDowntimeCreated', 'Email', 'en', 'Equipment downtime: {{modality_name}}', '{{modality_name}} downtime was created from {{start_time}} to {{end_time}}. Status: {{status}}. Reason: {{reason}}.'),
('EquipmentDowntimeCreated', 'SMS', 'en', NULL, '{{modality_name}} downtime: {{start_time}} to {{end_time}} ({{status}}).'),
('EquipmentDowntimeUpdated', 'InApp', 'en', 'Equipment Downtime Updated', '{{modality_name}} downtime was updated. Status: {{status}}. Changed: {{changed_fields}}.'),
('EquipmentDowntimeUpdated', 'Email', 'en', 'Equipment downtime updated: {{modality_name}}', '{{modality_name}} downtime was updated. Window: {{start_time}} to {{end_time}}. Status: {{status}}. Changed: {{changed_fields}}.'),
('EquipmentDowntimeResolved', 'InApp', 'en', 'Equipment Downtime Resolved', '{{modality_name}} downtime has been resolved. Resolution: {{resolution_notes}}.'),
('CriticalResultFinalized', 'InApp', 'en', 'Critical Result Requires Acknowledgement', 'Critical result finalized for order {{order_number}} (exam {{exam_id}}). Marked at {{critical_marked_at}}. Acknowledgement is required.'),
('CriticalResultFinalized', 'Email', 'en', 'Critical result requires acknowledgement: {{order_number}}', 'A diagnostic result explicitly marked critical has been finalized. Order: {{order_number}}. Exam: {{exam_id}}. Marked at: {{critical_marked_at}}. Please review and acknowledge promptly.'),
('CriticalResultFinalized', 'SMS', 'en', NULL, 'CRITICAL RESULT: Order {{order_number}} requires prompt review and acknowledgement.'),
('CriticalResultFinalized', 'WhatsApp', 'en', NULL, 'CRITICAL RESULT: Order {{order_number}} (exam {{exam_id}}) requires prompt review and acknowledgement.')
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 126_portal_inapp_notification_contract.sql

-- Ensure patient and referring-doctor inboxes receive actionable in-app copies
-- of the external events already generated by clinical and billing workflows.
INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
('AppointmentCreated', 'InApp', 'en', 'Appointment Created', 'Your appointment for order {{order_number}} has been created for {{appointment_time}}.', TRUE),
('AppointmentReminder', 'InApp', 'en', 'Appointment Reminder', 'Reminder: your appointment for order {{order_number}} is scheduled for {{appointment_time}}.', TRUE),
('AppointmentCancelled', 'InApp', 'en', 'Appointment Cancelled', 'Appointment {{order_number}} was cancelled. Reason: {{cancellation_reason}}.', TRUE),
('AppointmentRescheduled', 'InApp', 'en', 'Appointment Rescheduled', 'Appointment {{order_number}} was moved to {{appointment_time}}. Reason: {{reschedule_reason}}.', TRUE),
('PrepInstructions', 'InApp', 'en', 'Preparation Instructions', '{{prep_instructions}}', TRUE),
('PaymentDue', 'InApp', 'en', 'Payment Due', 'Payment is due for invoice {{invoice_number}}. Amount: {{amount}}.', TRUE),
('ReportReady', 'InApp', 'en', 'Report Ready', 'The report for order {{order_number}} is ready in the secure portal.', TRUE),
('ResultDelivered', 'InApp', 'en', 'Result Delivered', 'Results for order {{order_number}} were delivered via {{delivery_method}}.', TRUE),
('AppointmentRequestReviewed', 'InApp', 'en', 'Appointment Request Updated', 'Your appointment request status is {{status}}. Notes: {{staff_notes}}', TRUE),
('RefundProcessed', 'InApp', 'en', 'Refund Processed', 'Refund for invoice {{invoice_number}} was processed. Amount: {{amount}}. Reason: {{reason}}.', TRUE),
('CriticalResultFinalized', 'InApp', 'en', 'Critical Result Requires Acknowledgement', 'A critical diagnostic result for order {{order_number}} requires immediate review and acknowledgement.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 129_break_glass_governance.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
    ('EmergencyAccessGranted', 'InApp', 'en', 'Emergency access activated', '{{actor_name}} ({{actor_role}}) activated emergency access. Grant: {{grant_id}}. Expires: {{expires_at}}.', TRUE),
    ('EmergencyAccessGranted', 'Email', 'en', 'VIARA security alert: emergency access activated', '{{actor_name}} ({{actor_role}}) activated emergency access. Grant: {{grant_id}}. Expires: {{expires_at}}. Review the RBAC audit log immediately.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 131_notification_workflow_completion.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
('PatientAppointmentNoShowNotice', 'InApp', 'en', 'Appointment attendance update', 'Your appointment for order {{order_number}} at {{appointment_time}} was recorded as missed. Contact the center if you need to reschedule.', TRUE),
('PatientAppointmentNoShowNotice', 'Email', 'en', 'Appointment attendance update', 'Your appointment for order {{order_number}} at {{appointment_time}} was recorded as missed. Contact the center if you need to reschedule. The internal reason is not included in this message.', TRUE),
('CriticalResultEscalated', 'InApp', 'en', 'Critical result acknowledgement overdue', 'Critical result for order {{order_number}} (exam {{exam_id}}) has not been acknowledged since {{overdue_since}}. Immediate escalation action is required.', TRUE),
('CriticalResultEscalated', 'Email', 'en', 'URGENT: critical result acknowledgement overdue', 'Critical result for order {{order_number}} (exam {{exam_id}}) has not been acknowledged since {{overdue_since}}. Review and acknowledge immediately.', TRUE),
('CriticalResultEscalated', 'SMS', 'en', NULL, 'URGENT: Critical result for order {{order_number}} remains unacknowledged. Review VIARA immediately.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 132_integration_failure_notification_contract.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active)
VALUES (
    'INTEGRATION_FAILED', 'InApp', 'en',
    '{{notification_subject}}', '{{notification_body}}', TRUE
)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 143_reception_operations_hardening.sql

INSERT INTO notification_template_seed
    (event_type, channel, language, subject, body, is_active)
VALUES
    ('API_TOKEN_WRITE_SCOPE_DENIED', 'InApp', 'en', 'Write API Token Request Denied',
     'A request to create a write-scoped API token was denied.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE;

-- Source: 144_clinical_payment_exception_workflow.sql

INSERT INTO notification_template_seed
    (event_type, channel, language, subject, body, is_active)
VALUES
    (
        'PartialPaymentException', 'InApp', 'ar',
        'تحديث طلب الاستثناء المالي',
        'حالة الطلب: {{status}}\nالمريض: {{patient_name}}\nالفاتورة: {{invoice_number}}\nالخطوة المطلوبة: {{target_stage}}\nالمتبقي: {{amount}}\nالسبب: {{reason}}\nملاحظات المراجعة: {{review_notes}}',
        TRUE
    ),
    (
        'PartialPaymentException', 'InApp', 'en',
        'Financial Exception Request Update',
        'Status: {{status}}\nPatient: {{patient_name}}\nInvoice: {{invoice_number}}\nRequested step: {{target_stage}}\nBalance: {{amount}}\nReason: {{reason}}\nReview notes: {{review_notes}}',
        TRUE
    )
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 148_refund_hardening.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('RefundReviewed', 'InApp', 'en', 'Refund Request Reviewed',
 'Your refund request has been reviewed.\n\nInvoice: {{invoice_number}}\nAmount: {{amount}}\nOutcome: {{status}}{{#if review_reason}}\nNotes: {{review_reason}}{{/if}}')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 149_payroll_lifecycle_notifications.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('PayrollRunStatusChanged', 'InApp', 'en', 'Payroll Run Update',
 'Payroll run {{period_name}} moved to {{status}}.\n\nNet total: {{total_net}} {{currency_code}}'),
('PenaltyImposed', 'InApp', 'en', 'Penalty Imposed',
 'An approved penalty was recorded against you.\n\nType: {{penalty_type}}\nAmount: {{amount}}\nReason: {{reason}}\n\nYou can acknowledge it or file a dispute from your penalties page.'),
('PenaltyDisputed', 'InApp', 'en', 'Penalty Disputed',
 'An employee disputed a penalty; it is excluded from payroll calculation until resolved.\n\nType: {{penalty_type}}\nAmount: {{amount}}\nDispute reason: {{dispute_reason}}'),
('PenaltyDisputeResolved', 'InApp', 'en', 'Penalty Dispute Resolved',
 'Your penalty dispute was resolved.\n\nOutcome: {{outcome}}\nType: {{penalty_type}}\nResolution: {{resolution}}'),
('PenaltyCancelled', 'InApp', 'en', 'Penalty Cancelled',
 'An approved penalty was cancelled before it was applied.\n\nType: {{penalty_type}}\nAmount: {{amount}}\nReason: {{reason}}')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 150_shift_lifecycle_notifications.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('CASHIER_VARIANCE_REQUIRES_REVIEW', 'InApp', 'en', 'Cashier Variance Requires Review',
 'A cashier shift was closed with a material cash variance.\n\nCashier: {{cashier_name}}\nExpected: {{expected_cash}}\nCounted: {{counted_cash}}\nVariance: {{variance}}\nBusiness Date: {{business_date}}'),
('CASHIER_VARIANCE_REQUIRES_REVIEW', 'Email', 'en', 'Cashier Variance Requires Review',
 'Dear {{recipient_name}},\n\nA cashier shift was closed with a material cash variance and requires review before the cashier can open a new shift.\n\nCashier: {{cashier_name}}\nExpected: {{expected_cash}}\nCounted: {{counted_cash}}\nVariance: {{variance}}\nBusiness Date: {{business_date}}\n\nRegards,\nVIARA Billing'),
('LEAVE_REQUEST_SUBMITTED', 'InApp', 'en', 'New Leave Request',
 'A leave request is awaiting review.\n\nEmployee: {{employee_name}}\nType: {{leave_type}}\nFrom: {{start_date}}\nTo: {{end_date}}'),
('LEAVE_REQUEST_DECIDED', 'InApp', 'en', 'Leave Request Reviewed',
 'Your leave request has been reviewed.\n\nStatus: {{status}}\nType: {{leave_type}}\nFrom: {{start_date}}\nTo: {{end_date}}{{#if review_notes}}\nNotes: {{review_notes}}{{/if}}'),
('ATTENDANCE_SESSION_AUTO_CAPPED', 'InApp', 'en', 'Attendance Session Auto-Capped',
 'An open attendance session was automatically capped.\n\nEmployee: {{employee_name}}\nClock-in: {{clock_in}}\nCapped clock-out: {{clock_out}}\nContact HR if this is incorrect.'),
('RECEPTION_SHIFT_AUTO_CLOSED', 'InApp', 'en', 'Reception Shift Auto-Closed',
 'A reception shift was closed automatically after its owner stopped responding.\n\nDesk: {{desk_identifier}}\nIdle for: {{abandoned_minutes}} minutes')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 151_payroll_skipped_employees.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('PayrollEmployeesSkipped', 'InApp', 'en', 'Payroll Skipped Employees',
 'Payroll run {{period_name}} was calculated without {{skipped_count}} employee(s) because they have no active compensation profile.\n\n{{employee_names}}\n\nAdd their compensation profiles and recalculate before approval if they should be paid.')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 152_hr_leave_balances_credentials.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('CredentialExpiring', 'InApp', 'en', 'Credential Expiring Soon',
 'A staff credential is approaching its expiry date.\n\nEmployee: {{employee_name}}\nCredential: {{credential_type}}\nExpires: {{expires_at}}\nDays left: {{days_left}}{{#if credential_number}}\nNumber: {{credential_number}}{{/if}}'),
('CredentialExpiring', 'Email', 'en', 'Credential Expiring Soon',
 'Dear {{recipient_name}},\n\nA staff credential is approaching its expiry date and requires renewal follow-up.\n\nEmployee: {{employee_name}}\nCredential: {{credential_type}}\nExpires: {{expires_at}}\nDays left: {{days_left}}\n\nRegards,\nVIARA HR')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 156_advanced_attendance_system.sql

-- Templates
INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('AttendanceLate', 'InApp', 'ar', 'تنبيه: تأخر موظف عن الوردية', 'سجل الموظف {{employee_name}} حضوراً متأخراً بـ {{late_minutes}} دقيقة بعد تجاوز فترة السماح.'),
('AttendanceLate', 'InApp', 'en', 'Alert: Late Shift Clock-In', 'Staff {{employee_name}} clocked in {{late_minutes}} minutes late past the grace period.'),
('AttendanceEarlyDepartureAttempt', 'InApp', 'ar', 'تنبيه عاجل: انصراف مبكر', 'قام الموظف {{employee_name}} بتسجيل انصراف مبكر بـ {{early_minutes}} دقيقة قبل موعد نهاية الوردية.'),
('AttendanceEarlyDepartureAttempt', 'InApp', 'en', 'Urgent: Early Departure', 'Staff {{employee_name}} departed {{early_minutes}} minutes prior to shift end.'),
('AttendanceAutoAbsent', 'InApp', 'ar', 'تسجيل غياب تلقائي لوردية منتهية', 'انتهت وردية الموظف {{employee_name}} بتاريخ {{shift_date}} دون تسجيل حضور وتم تسجيله غائباً تلقائياً.'),
('AttendanceAutoAbsent', 'InApp', 'en', 'Automatic Absence Recorded', 'Shift for {{employee_name}} on {{shift_date}} ended with no clock-in and was automatically marked absent.'),
('AttendancePermissionFiled', 'InApp', 'ar', 'طلب إذن حضور/انصراف جديد', 'قدم الموظف {{employee_name}} طلب إذن {{permission_type}} بتاريخ {{effective_date}}. يرجى المراجعة والاعتماد.'),
('AttendancePermissionFiled', 'InApp', 'en', 'New Attendance Permission Request', 'Staff {{employee_name}} submitted a {{permission_type}} request for {{effective_date}}. Please review.'),
('AttendancePermissionResolved', 'InApp', 'ar', 'تحديث حالة طلب الإذن', 'تم {{status}} طلب إذن {{permission_type}} المقدم لتاريخ {{effective_date}}.'),
('AttendancePermissionResolved', 'InApp', 'en', 'Attendance Permission Status Update', 'Your {{permission_type}} request for {{effective_date}} has been {{status}}.')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 158_public_portal_security_and_booking.sql

-- Existing authenticated and public appointment requests share the same event.
-- Optional fields keep the original patient-portal payload compatible while
-- giving reception enough information to action an anonymous web request.
UPDATE notification_template_seed
SET body = 'A patient has submitted an appointment request.\n\nPatient: {{patient_name}}\nPreferred Date: {{preferred_date}}\nExam Type: {{exam_type}}{{#if request_number}}\nRequest #: {{request_number}}{{/if}}{{#if contact_phone}}\nContact: {{contact_phone}}{{/if}}',
    updated_at = CURRENT_TIMESTAMP
WHERE event_type = 'AppointmentRequested'
  AND channel = 'InApp'
  AND language = 'en';

-- Source: 159_attendance_auto_absent_notification.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body) VALUES
('AttendanceAutoAbsent', 'InApp', 'en', 'Shift Marked Absent',
 'Your shift was closed automatically because it was left unattended.\n\nEmployee: {{employee_name}}\nShift date: {{shift_date}}\nContact HR if this is incorrect.')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Source: 162_emergency_access_revoked_notification.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
    ('EmergencyAccessRevoked', 'InApp', 'en', 'Emergency access revoked', '{{actor_name}} ended emergency access grant {{grant_id}} (administrative: {{administrative}}). The elevated permissions are no longer in effect.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 165_notification_contract_repairs.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
('AttendanceEarlyDepartureAttempt', 'Email', 'ar', 'تنبيه: انصراف مبكر', 'قام الموظف {{employee_name}} بتسجيل انصراف مبكر بـ {{early_minutes}} دقيقة قبل نهاية الوردية.', TRUE),
('AttendanceEarlyDepartureAttempt', 'Email', 'en', 'Alert: Early Departure', 'Staff {{employee_name}} departed {{early_minutes}} minutes prior to shift end.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 166_notification_arabic_templates.sql

-- Provide Arabic templates for every active event/channel that currently only
-- has an English template. Required variables are kept as placeholders so the
-- Arabic path remains compatible with the notification contract.

WITH event_labels(event_type, label_ar) AS (
    VALUES
        ('ACCOUNT_LOCKED', 'قفل الحساب'),
        ('ACCOUNT_LOCKED_ACCESS', 'محاولة الوصول إلى حساب مقفل'),
        ('AI_ANALYSIS_REQUESTED', 'طلب تحليل بالذكاء الاصطناعي'),
        ('AppointmentCancelled', 'إلغاء الموعد'),
        ('AppointmentCreated', 'تأكيد الموعد'),
        ('AppointmentNoShow', 'عدم حضور المريض'),
        ('AppointmentReminder', 'تذكير بالموعد'),
        ('AppointmentRequested', 'طلب موعد جديد'),
        ('AppointmentRequestReviewed', 'مراجعة طلب الموعد'),
        ('AppointmentRescheduled', 'إعادة جدولة الموعد'),
        ('BackupCompleted', 'اكتمال النسخ الاحتياطي'),
        ('BackupFailed', 'فشل النسخ الاحتياطي'),
        ('ChatMessageReceived', 'رسالة جديدة'),
        ('ClaimApproved', 'اعتماد المطالبة'),
        ('ClaimPaid', 'سداد المطالبة'),
        ('ClaimRejected', 'رفض المطالبة'),
        ('ClaimSubmitted', 'إرسال المطالبة'),
        ('CONSENT_REVOKED', 'سحب الموافقة'),
        ('CriticalResultFinalized', 'اعتماد نتيجة حرجة'),
        ('CriticalResultEscalated', 'تصعيد نتيجة حرجة'),
        ('DATA_EXPORT_REQUESTED', 'طلب تصدير البيانات'),
        ('DocumentDownloaded', 'تنزيل المستند'),
        ('EquipmentDowntimeCreated', 'تسجيل توقف المعدات'),
        ('EquipmentDowntimeResolved', 'حل توقف المعدات'),
        ('EquipmentDowntimeUpdated', 'تحديث توقف المعدات'),
        ('EquipmentMaintenanceCreated', 'تسجيل صيانة المعدات'),
        ('EquipmentMaintenanceUpdated', 'تحديث صيانة المعدات'),
        ('ExamCreated', 'إنشاء الفحص'),
        ('ExamScheduled', 'جدولة الفحص'),
        ('ExamStatusChanged', 'تغيير حالة الفحص'),
        ('FollowUpReminder', 'تذكير بالمتابعة'),
        ('IMAGE_VIEW', 'عرض الصورة'),
        ('ItemExpired', 'انتهاء صلاحية الصنف'),
        ('LOGIN_FAILED', 'فشل تسجيل الدخول'),
        ('LowStock', 'انخفاض المخزون'),
        ('MarketingCampaign', 'حملة تسويقية'),
        ('OrderCreated', 'إنشاء الطلب'),
        ('PartialPaymentException', 'استثناء دفعة جزئية'),
        ('PACS_CONFIG_UPDATED', 'تحديث إعدادات PACS'),
        ('PaymentDue', 'استحقاق الدفع'),
        ('PaymentReceived', 'استلام الدفع'),
        ('PERMISSION_DENIED', 'رفض الصلاحية'),
        ('PrepInstructions', 'تعليمات التحضير'),
        ('PRIVACY_REQUEST_RESOLVED', 'إغلاق طلب الخصوصية'),
        ('ProfileUpdateRequested', 'طلب تحديث الملف الشخصي'),
        ('PurchaseOrderReceived', 'استلام أمر الشراء'),
        ('RefundProcessed', 'معالجة الاسترداد'),
        ('RefundRequested', 'طلب الاسترداد'),
        ('RefundReviewed', 'مراجعة الاسترداد'),
        ('ReportReady', 'جاهزية التقرير'),
        ('ResultDelivered', 'تسليم النتيجة'),
        ('STAFF_CREATED', 'إنشاء حساب موظف'),
        ('STAFF_DEACTIVATED', 'تعطيل حساب موظف'),
        ('STAFF_UPDATED', 'تحديث حساب موظف'),
        ('STUDY_EXPORTED', 'تصدير الدراسة'),
        ('STUDY_IMPORTED', 'استيراد الدراسة'),
        ('SUPPLY_ADDED_PAYMENT_DUE', 'إضافة مستلزم مع استحقاق الدفع'),
        ('TOKEN_REUSE_DETECTED', 'اكتشاف إعادة استخدام رمز الدخول'),
        ('EmergencyAccessGranted', 'منح وصول طارئ'),
        ('EmergencyAccessRevoked', 'إلغاء وصول طارئ'),
        ('PatientAppointmentNoShowNotice', 'إشعار عدم حضور المريض'),
        ('INTEGRATION_FAILED', 'فشل التكامل'),
        ('API_TOKEN_WRITE_SCOPE_DENIED', 'رفض نطاق الكتابة لرمز API'),
        ('ATTENDANCE_SESSION_AUTO_CAPPED', 'إغلاق جلسة الحضور تلقائيًا'),
        ('RECEPTION_SHIFT_AUTO_CLOSED', 'إغلاق وردية الاستقبال تلقائيًا'),
        ('AttendanceAutoAbsent', 'تسجيل الغياب تلقائيًا'),
        ('AttendanceEarlyDepartureAttempt', 'محاولة انصراف مبكر'),
        ('CASHIER_VARIANCE_REQUIRES_REVIEW', 'مراجعة فرق الصندوق'),
        ('LEAVE_REQUEST_SUBMITTED', 'إرسال طلب الإجازة'),
        ('LEAVE_REQUEST_DECIDED', 'اتخاذ قرار بشأن طلب الإجازة'),
        ('PayrollRunStatusChanged', 'تغيير حالة مسير الرواتب'),
        ('PenaltyImposed', 'فرض جزاء'),
        ('PenaltyDisputed', 'الاعتراض على الجزاء'),
        ('PenaltyDisputeResolved', 'حسم الاعتراض على الجزاء'),
        ('PenaltyCancelled', 'إلغاء الجزاء'),
        ('PayrollEmployeesSkipped', 'تخطي موظفين في مسير الرواتب'),
        ('CredentialExpiring', 'اقتراب انتهاء صلاحية الاعتماد')
), missing AS (
    SELECT DISTINCT ON (english.event_type, english.channel)
        english.event_type,
        english.channel,
        COALESCE(labels.label_ar, 'إشعار نظام VIARA') AS label_ar,
        COALESCE(catalog.required_variables, '[]'::jsonb) AS required_variables
    FROM notification_template_seed english
    LEFT JOIN event_labels labels ON labels.event_type = english.event_type
    LEFT JOIN notification_event_catalog catalog ON catalog.event_type = english.event_type
    WHERE english.language = 'en'
      AND english.is_active = TRUE
      AND NOT EXISTS (
          SELECT 1
          FROM notification_template_seed arabic
          WHERE arabic.event_type = english.event_type
            AND arabic.channel = english.channel
            AND arabic.language = 'ar'
      )
    ORDER BY english.event_type, english.channel, english.template_id
)
INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active)
SELECT
    event_type,
    channel,
    'ar',
    CASE WHEN channel = 'Email' THEN label_ar ELSE NULL END,
    'تم تسجيل ' || label_ar || ' في نظام VIARA.' ||
        CASE WHEN jsonb_array_length(required_variables) > 0 THEN
            E'\n\nالتفاصيل:\n' || (
                SELECT string_agg('{{' || variable || '}}', E'\n' ORDER BY variable)
                FROM jsonb_array_elements_text(required_variables) AS variables(variable)
            )
        ELSE '' END,
    TRUE
FROM missing
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Source: 167_attendance_notification_contract_repairs.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active) VALUES
('AttendanceUnscheduled', 'InApp', 'ar', 'حضور دون وردية مجدولة',
 'سجل الموظف {{employee_name}} حضورًا دون وردية مجدولة في {{clock_in}}.' , TRUE),
('AttendanceUnscheduled', 'InApp', 'en', 'Unscheduled Clock-In',
 'Staff {{employee_name}} clocked in without a scheduled shift at {{clock_in}}.', TRUE),
('AttendanceEmergencyDeparture', 'InApp', 'ar', 'انصراف طارئ',
 'سجل الموظف {{employee_name}} انصرافًا طارئًا قبل نهاية الوردية بـ {{early_minutes}} دقيقة. السبب: {{reason}}', TRUE),
('AttendanceEmergencyDeparture', 'InApp', 'en', 'Emergency Departure',
 'Staff {{employee_name}} completed an emergency departure {{early_minutes}} minutes before shift end. Reason: {{reason}}', TRUE),
('AttendancePermissionResolved', 'InApp', 'ar', 'تحديث طلب إذن الحضور',
 'تم تحديث طلب إذن {{permission_type}} للموظف {{employee_name}} إلى الحالة {{status}}.', TRUE),
('AttendancePermissionResolved', 'InApp', 'en', 'Attendance Permission Update',
 'The {{permission_type}} request for {{employee_name}} is now {{status}}.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

UPDATE notification_template_seed
SET subject = COALESCE(NULLIF(split_part(body, E'\n', 1), ''), 'إشعار نظام VIARA'),
    updated_at = CURRENT_TIMESTAMP
WHERE language = 'ar'
  AND channel = 'InApp'
  AND is_active = TRUE
  AND subject IS NULL;

-- Source: 171_end_of_shift_pending_exam_notification.sql

-- ─── 3. Notification Templates ───────────────────────────────────────────────

-- English — InApp
INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active)
VALUES (
    'SHIFT_CLOSED_WITH_PENDING_EXAMS',
    'InApp',
    'en',
    'Shift Closed — Pending Exams',
    'The shift closed by {{receptionist_name}} on {{shift_date}} ended with {{pending_count}} unexamined case(s).'
    || E'\n\n'
    || 'Completed today: {{completed_today}} / {{total_today}} ({{completion_rate}}%)'
    || E'\n\n'
    || 'Please open the End-of-Shift Review page to resolve outstanding cases.',
    TRUE
)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject   = EXCLUDED.subject,
    body      = EXCLUDED.body,
    is_active = TRUE;

-- Arabic — InApp
INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active)
VALUES (
    'SHIFT_CLOSED_WITH_PENDING_EXAMS',
    'InApp',
    'ar',
    'الوردية أُغلقت — توجد حالات معلّقة',
    'أُغلقت الوردية التي أدارها/أدارتها {{receptionist_name}} بتاريخ {{shift_date}} مع وجود {{pending_count}} حالة لم يُجرَ لها الفحص.'
    || E'\n\n'
    || 'المكتملة اليوم: {{completed_today}} / {{total_today}} ({{completion_rate}}%)'
    || E'\n\n'
    || 'يرجى فتح صفحة «مراجعة نهاية الوردية» لمعالجة الحالات العالقة.',
    TRUE
)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject   = EXCLUDED.subject,
    body      = EXCLUDED.body,
    is_active = TRUE;

-- Source: 172_notification_contract_final_repairs.sql

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active)
VALUES
    ('NegativeFeedbackAlert', 'InApp', 'en', 'Negative Feedback Escalated', 'Patient feedback rating {{rating}} was received via {{source}}. Notes: {{comments}}', TRUE),
    ('NegativeFeedbackAlert', 'Email', 'en', 'Negative Feedback Escalated', 'Patient feedback rating {{rating}} was received via {{source}}. Notes: {{comments}}', TRUE),
    ('NegativeFeedbackAlert', 'InApp', 'ar', 'تقييم سلبي تم تصعيده', 'تم استلام تقييم سلبي للمريض {{rating}} عبر {{source}}. الملاحظات: {{comments}}', TRUE),
    ('NegativeFeedbackAlert', 'Email', 'ar', 'تقييم سلبي تم تصعيده', 'تم استلام تقييم سلبي للمريض {{rating}} عبر {{source}}. الملاحظات: {{comments}}', TRUE),
    ('PatientFeedbackRequest', 'Email', 'en', 'Share Your Feedback', 'Thank you for visiting VIARA. Please share feedback for order {{order_number}}. Patient: {{patient_name}}', TRUE),
    ('PatientFeedbackRequest', 'SMS', 'en', NULL, 'VIARA: Please share feedback for order {{order_number}}.', TRUE),
    ('PatientFeedbackRequest', 'Email', 'ar', 'شاركنا رأيك', 'شكرًا لزيارتك VIARA. يُرجى مشاركة رأيك حول الطلب {{order_number}}. المريض: {{patient_name}}', TRUE),
    ('PatientFeedbackRequest', 'SMS', 'ar', NULL, 'VIARA: يُرجى مشاركة رأيك حول الطلب {{order_number}}.', TRUE),
    ('ClaimStatusChanged', 'InApp', 'en', 'Claim Status Updated', 'Claim {{claim_number}} status changed to {{status}}.', TRUE),
    ('ClaimStatusChanged', 'Email', 'en', 'Claim Status Updated', 'Claim {{claim_number}} status changed to {{status}} by {{updated_by}}.', TRUE),
    ('ClaimStatusChanged', 'InApp', 'ar', 'تحديث حالة المطالبة', 'تغيرت حالة المطالبة {{claim_number}} إلى {{status}}.', TRUE),
    ('ClaimStatusChanged', 'Email', 'ar', 'تحديث حالة المطالبة', 'تغيرت حالة المطالبة {{claim_number}} إلى {{status}} بواسطة {{updated_by}}.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

WITH active_contract(event_type, channel) AS (VALUES
    ('NegativeFeedbackAlert', 'InApp'),
    ('NegativeFeedbackAlert', 'Email'),
    ('PatientFeedbackRequest', 'Email'),
    ('PatientFeedbackRequest', 'SMS'),
    ('ClaimStatusChanged', 'InApp'),
    ('ClaimStatusChanged', 'Email')
)
UPDATE notification_template_seed template
SET is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
FROM active_contract contract
WHERE template.event_type = contract.event_type
  AND template.channel = contract.channel
  AND template.language = 'en';

INSERT INTO notification_template_seed (event_type, channel, language, subject, body, is_active)
VALUES
('StockExpired', 'InApp', 'en', 'Expired Stock', 'An inventory item has expired. Review stock records and remove the affected item from use.', TRUE),
('StockExpired', 'InApp', 'ar', 'انتهاء صلاحية صنف بالمخزون', 'انتهت صلاحية صنف بالمخزون. يُرجى مراجعة السجل وسحب الصنف المتأثر من الاستخدام.', TRUE)
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Improve the most frequent operational notices and keep external marketing
-- messages useful, short, and explicit about opting out.
UPDATE notification_template_seed AS seed
SET subject = copy.subject,
    body = copy.body
FROM (VALUES
    ('ExamCreated', 'InApp', 'ar', 'فحص جديد', 'أُنشئ فحص جديد للطلب {{order_number}}. المريض: {{patient_name}}. يُرجى مراجعة تفاصيل الفحص داخل النظام.'),
    ('ExamScheduled', 'InApp', 'ar', 'تحديد موعد فحص', 'حُدّد موعد فحص للطلب {{order_number}} بتاريخ {{exam_time}}. يُرجى مراجعة الجدول داخل النظام.'),
    ('ExamStatusChanged', 'InApp', 'ar', 'تحديث حالة فحص', 'تغيّرت حالة فحص الطلب {{order_number}} من {{old_status}} إلى {{new_status}}. يُرجى مراجعة الحالة داخل النظام.'),
    ('OrderCreated', 'InApp', 'ar', 'طلب جديد', 'أُنشئ طلب جديد برقم {{order_number}}. يُرجى مراجعة بياناته داخل النظام.'),
    ('PaymentReceived', 'InApp', 'ar', 'تسجيل دفعة', 'استُلِمت دفعة بقيمة {{amount}} للفاتورة {{invoice_number}} عبر {{payment_method}} بتاريخ {{payment_date}}.'),
    ('PaymentReceived', 'Email', 'ar', 'تأكيد استلام دفعة', 'تم استلام دفعة بقيمة {{amount}} للفاتورة {{invoice_number}} عبر {{payment_method}} بتاريخ {{payment_date}}. يرجى الاحتفاظ بهذه الرسالة للرجوع إليها.'),
    ('LOGIN_FAILED', 'InApp', 'ar', 'محاولة دخول غير ناجحة', 'رُصدت محاولة دخول غير ناجحة للحساب {{user_email}} من عنوان {{ip_address}}. السبب: {{reason}}.'),
    ('LOGIN_FAILED', 'Email', 'ar', 'تنبيه بمحاولة دخول غير ناجحة', 'رُصدت محاولة دخول غير ناجحة للحساب {{user_email}} من عنوان {{ip_address}}. إذا لم تكن أنت، فراجع أمان حسابك.'),
    ('PERMISSION_DENIED', 'InApp', 'ar', 'محاولة وصول مرفوضة', 'مُنعت محاولة وصول غير مصرح بها للمستخدم {{user_email}} إلى {{path}}. الصلاحية المطلوبة: {{required_permission}}.'),
    ('CASHIER_VARIANCE_REQUIRES_REVIEW', 'InApp', 'ar', 'فرق بالصندوق يحتاج مراجعة', 'أُغلقت وردية الصندوق مع وجود فرق بقيمة {{variance}}. أمين الصندوق: {{cashier_name}}. يُرجى مراجعة التسوية قبل فتح وردية جديدة.'),
    ('CASHIER_VARIANCE_REQUIRES_REVIEW', 'Email', 'ar', 'مراجعة فرق الصندوق', 'أُغلقت وردية الصندوق مع وجود فرق بقيمة {{variance}} بتاريخ {{business_date}}. أمين الصندوق: {{cashier_name}}. المتوقع: {{expected_cash}}؛ المعدود: {{counted_cash}}. يُرجى مراجعة التسوية.'),
    ('MarketingCampaign', 'Email', 'ar', 'أخبار من {{center_name}}', 'عزيزي/عزيزتي {{patient_name}}،\n\n{{campaign_message}}\n\n{{unsubscribe_text}}\n\n{{center_name}}'),
    ('MarketingCampaign', 'SMS', 'ar', '', 'رسالة من {{center_name}}: {{campaign_message}}. {{unsubscribe_text}}'),
    ('MarketingCampaign', 'WhatsApp', 'ar', '', 'رسالة من {{center_name}}: {{campaign_message}}\n\n{{unsubscribe_text}}'),
    ('MarketingCampaign', 'Email', 'en', 'News from {{center_name}}', 'Dear {{patient_name}},\n\n{{campaign_message}}\n\n{{unsubscribe_text}}\n\n{{center_name}}'),
    ('MarketingCampaign', 'SMS', 'en', '', '{{center_name}}: {{campaign_message}} {{unsubscribe_text}}'),
    ('CriticalResultFinalized', 'SMS', 'ar', '', 'تنبيه عاجل من VIARA: نتيجة حرجة للطلب {{order_number}} تتطلب المراجعة والإقرار داخل النظام فورًا.'),
    ('CriticalResultFinalized', 'WhatsApp', 'ar', '', 'تنبيه عاجل من VIARA: نتيجة حرجة للطلب {{order_number}} تتطلب المراجعة والإقرار داخل النظام فورًا.'),
    ('CriticalResultFinalized', 'InApp', 'ar', 'نتيجة حرجة تتطلب الإقرار', 'اعتمدت نتيجة حرجة للطلب {{order_number}}. يُرجى مراجعتها والإقرار بالاطلاع عليها فورًا داخل النظام.'),
    ('CriticalResultFinalized', 'Email', 'ar', 'نتيجة حرجة تتطلب الإقرار', 'اعتمدت نتيجة حرجة للطلب {{order_number}} (الفحص {{exam_id}}) بتاريخ {{critical_marked_at}}. يُرجى مراجعتها والإقرار بالاطلاع عليها فورًا داخل النظام.')
) AS copy(event_type, channel, language, subject, body)
WHERE seed.event_type = copy.event_type
  AND seed.channel = copy.channel
  AND seed.language = copy.language;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
SELECT seed.event_type, seed.channel, seed.language,
       NULLIF(seed.subject, ''), replace(seed.body, '\n', E'\n'), seed.is_active
FROM notification_template_seed seed
JOIN notification_event_catalog catalog ON catalog.event_type = seed.event_type
WHERE seed.is_active = TRUE
ON CONFLICT (event_type, channel, language) DO NOTHING;
