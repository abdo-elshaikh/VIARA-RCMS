-- Migration 171: End-of-Shift Pending Exam Notification Contract
--
-- Adds the SHIFT_CLOSED_WITH_PENDING_EXAMS notification event used by
-- endOfDayService.onShiftClose() when a reception shift is closed (manually
-- or automatically) while unexamined cases remain on the queue.
--
-- Contract: catalog → audience policies → templates (EN + AR)

-- ─── 1. Event Catalog ────────────────────────────────────────────────────────
INSERT INTO notification_event_catalog
    (event_type, category, default_priority, default_channels, description, required_variables)
VALUES
    (
        'SHIFT_CLOSED_WITH_PENDING_EXAMS',
        'Operational',
        'Warning',
        ARRAY['InApp'],
        'A reception shift was closed while one or more patient exams remain unexamined',
        '["receptionist_name", "pending_count", "shift_date"]'::jsonb
    )
ON CONFLICT (event_type) DO UPDATE SET
    category           = EXCLUDED.category,
    default_priority   = EXCLUDED.default_priority,
    default_channels   = EXCLUDED.default_channels,
    description        = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

-- ─── 2. Audience Policies ────────────────────────────────────────────────────
-- Admins and Receptionists see the in-app warning; Developers too.
INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
    ('SHIFT_CLOSED_WITH_PENDING_EXAMS', NULL, 'Admin',        ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_CLOSED_WITH_PENDING_EXAMS', NULL, 'Receptionist', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
    ('SHIFT_CLOSED_WITH_PENDING_EXAMS', NULL, 'Developer',    ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels   = EXCLUDED.allowed_channels,
    min_priority       = EXCLUDED.min_priority,
    inapp_enabled      = EXCLUDED.inapp_enabled,
    email_enabled      = EXCLUDED.email_enabled,
    sms_enabled        = EXCLUDED.sms_enabled,
    whatsapp_enabled   = EXCLUDED.whatsapp_enabled;

-- ─── 3. Notification Templates ───────────────────────────────────────────────

-- English — InApp
INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
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
INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
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
