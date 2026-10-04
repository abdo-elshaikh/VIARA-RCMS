-- Repair notification contracts whose advertised channels were not deliverable.

UPDATE notification_event_catalog
SET default_channels = ARRAY['InApp', 'Email']
WHERE event_type = 'CredentialExpiring';

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
('AttendanceEarlyDepartureAttempt', 'Email', 'ar', 'تنبيه: انصراف مبكر', 'قام الموظف {{employee_name}} بتسجيل انصراف مبكر بـ {{early_minutes}} دقيقة قبل نهاية الوردية.', TRUE),
('AttendanceEarlyDepartureAttempt', 'Email', 'en', 'Alert: Early Departure', 'Staff {{employee_name}} departed {{early_minutes}} minutes prior to shift end.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
