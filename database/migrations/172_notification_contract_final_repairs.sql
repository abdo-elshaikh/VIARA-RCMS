-- Repair remaining notification contract gaps surfaced by the backend trigger audit.
-- This covers events actively emitted by the app that were missing from the catalog,
-- policy tables, and active-English template set.

INSERT INTO notification_event_catalog
    (event_type, category, default_priority, default_channels, description, required_variables)
VALUES
    ('NegativeFeedbackAlert', 'Operational', 'Critical', ARRAY['InApp', 'Email'], 'Patient reported negative experience and requires escalation', '["rating", "comments", "source"]'::jsonb),
    ('PatientFeedbackRequest', 'Operational', 'Normal', ARRAY['Email', 'SMS'], 'Request patient feedback after result delivery', '["patient_name", "order_number"]'::jsonb),
    ('ClaimStatusChanged', 'Financial', 'Normal', ARRAY['InApp', 'Email'], 'Claim status changed for the patient or insurer', '["claim_number", "status", "updated_by"]'::jsonb)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority, inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
    ('NegativeFeedbackAlert', NULL, 'Receptionist', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('NegativeFeedbackAlert', NULL, 'Admin', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
    ('PatientFeedbackRequest', NULL, 'Patient', ARRAY['Email', 'SMS'], 'Normal', FALSE, TRUE, TRUE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
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
UPDATE notification_templates template
SET is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
FROM active_contract contract
WHERE template.event_type = contract.event_type
  AND template.channel = contract.channel
  AND template.language = 'en';
