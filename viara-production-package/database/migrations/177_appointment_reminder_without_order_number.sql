-- A scheduled appointment can exist before an order number is assigned.
-- Reminders must therefore use the appointment time, not require an order.
UPDATE notification_event_catalog
SET required_variables = '["appointment_time"]'::jsonb
WHERE event_type = 'AppointmentReminder';

WITH copy(channel, language, subject, body) AS (VALUES
    ('Email', 'en', 'Reminder: Your VIARA Appointment',
     'Dear patient,\n\nThis is a reminder of your VIARA appointment at {{appointment_time}}. Please review any preparation instructions in your portal and arrive 15 minutes early.\n\nVIARA Radiology Center'),
    ('Email', 'ar', 'تذكير بموعدك لدى VIARA',
     'مرحبًا،\n\nنذكّرك بموعدك لدى VIARA في {{appointment_time}}. يُرجى مراجعة تعليمات التحضير في حسابك والوصول قبل الموعد بـ15 دقيقة.\n\nمركز VIARA للأشعة'),
    ('InApp', 'en', 'Appointment Reminder',
     'Your VIARA appointment is at {{appointment_time}}. Review preparation instructions before your visit.'),
    ('InApp', 'ar', 'تذكير بالموعد',
     'موعدك لدى VIARA في {{appointment_time}}. يُرجى مراجعة تعليمات التحضير قبل زيارتك.'),
    ('SMS', 'en', NULL,
     'VIARA reminder: Your appointment is at {{appointment_time}}. Check your portal for preparation instructions. Reply STOP to opt out.'),
    ('SMS', 'ar', NULL,
     'تذكير VIARA: موعدك في {{appointment_time}}. راجع تعليمات التحضير في حسابك. للإلغاء رد STOP.'),
    ('WhatsApp', 'en', NULL,
     'VIARA reminder: Your appointment is at {{appointment_time}}. Check your portal for preparation instructions.'),
    ('WhatsApp', 'ar', NULL,
     'تذكير VIARA: موعدك في {{appointment_time}}. راجع تعليمات التحضير في حسابك.')
)
UPDATE notification_templates AS template
SET subject = copy.subject,
    body = replace(copy.body, '\n', E'\n'),
    updated_at = CURRENT_TIMESTAMP
FROM copy
WHERE template.event_type = 'AppointmentReminder'
  AND template.channel = copy.channel
  AND template.language = copy.language
  AND template.created_by IS NULL;
