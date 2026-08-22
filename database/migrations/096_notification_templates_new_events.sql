-- Seed additional notification templates for new event types
-- Idempotent with ON CONFLICT DO NOTHING

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
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
