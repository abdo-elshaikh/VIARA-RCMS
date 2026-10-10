-- Re-notify the originally assigned clinical recipient once after 15 minutes.
-- Critical results without a referring doctor are assigned to active nurses.

WITH superseded AS (
    UPDATE critical_result_acknowledgements
    SET status = 'Superseded',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'Pending'
      AND recipient_role = 'Admin'
      AND EXISTS (
          SELECT 1
          FROM examinations e
          WHERE e.exam_id = critical_result_acknowledgements.exam_id
            AND e.critical_result = TRUE
      )
    RETURNING acknowledgement_id, exam_id
)
UPDATE notification_jobs nj
SET status = 'Cancelled',
    processed_at = CURRENT_TIMESTAMP,
    next_retry_at = NULL,
    locked_at = NULL,
    locked_by = NULL,
    error_message = 'Critical-result administrative escalation was retired'
FROM superseded s
WHERE nj.entity_type = 'Exam'
  AND nj.entity_id = s.exam_id
  AND nj.variables ->> 'occurrence_key' = s.acknowledgement_id::text
  AND nj.event_type IN ('CriticalResultFinalized', 'CriticalResultEscalated')
  AND nj.status IN ('Pending', 'Processing');

DELETE FROM notification_audience_policies
WHERE event_type = 'CriticalResultEscalated'
  AND role IN ('Admin', 'Radiologist');

INSERT INTO notification_audience_policies (
    event_type, event_category, role, allowed_channels, min_priority,
    inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled
) VALUES
('CriticalResultFinalized', NULL, 'Nurse', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE),
('CriticalResultEscalated', NULL, 'Doctor', ARRAY['InApp', 'Email', 'SMS'], 'Critical', TRUE, TRUE, TRUE, FALSE),
('CriticalResultEscalated', NULL, 'Nurse', ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

UPDATE notification_event_catalog
SET description = 'One-time reminder to the assigned clinical recipient when a critical result remains unacknowledged'
WHERE event_type = 'CriticalResultEscalated';

UPDATE notification_templates
SET subject = CASE
        WHEN channel = 'InApp' THEN 'Critical result reminder'
        WHEN channel = 'Email' THEN 'Reminder: critical result remains unacknowledged'
        ELSE subject
    END,
    body = CASE channel
        WHEN 'InApp' THEN 'Reminder: critical result for order {{order_number}} (exam {{exam_id}}) remains unacknowledged since {{overdue_since}}. Please review and acknowledge.'
        WHEN 'Email' THEN 'Reminder: critical result for order {{order_number}} (exam {{exam_id}}) remains unacknowledged since {{overdue_since}}. Please review and acknowledge.'
        WHEN 'SMS' THEN 'Reminder: Critical result for order {{order_number}} remains unacknowledged. Review VIARA.'
        ELSE body
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE event_type = 'CriticalResultEscalated'
  AND language = 'en';

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
('CriticalResultEscalated', 'InApp', 'ar', 'تذكير بنتيجة حرجة', 'تذكير: لا يزال إقرار النتيجة الحرجة للطلب {{order_number}} (الفحص {{exam_id}}) معلقاً منذ {{overdue_since}}. يرجى مراجعتها والإقرار بها.', TRUE),
('CriticalResultEscalated', 'Email', 'ar', 'تذكير: نتيجة حرجة بانتظار الإقرار', 'تذكير: لا يزال إقرار النتيجة الحرجة للطلب {{order_number}} (الفحص {{exam_id}}) معلقاً منذ {{overdue_since}}. يرجى مراجعتها والإقرار بها.', TRUE),
('CriticalResultEscalated', 'SMS', 'ar', NULL, 'تذكير: النتيجة الحرجة للطلب {{order_number}} لا تزال بانتظار الإقرار. يرجى مراجعتها في VIARA.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
