-- The same event covers status changes, queue movement, and a safety hold.
-- Render only the details present in that occurrence.
UPDATE notification_templates
SET subject = 'Exam Update Requires Review',
    body = 'Exam update.{{#if safety_hold}} A safety hold was applied.{{/if}}{{#if old_status}} Status changed from {{old_status}} to {{new_status}}.{{/if}}{{#if to_stage}} Workflow moved from {{from_stage}} to {{to_stage}}.{{/if}}{{#if order_number}} Order: {{order_number}}.{{/if}}{{#if reason}} Reason: {{reason}}.{{/if}} Review the exam in VIARA.',
    updated_at = CURRENT_TIMESTAMP
WHERE event_type = 'ExamStatusChanged'
  AND channel = 'InApp'
  AND language = 'en'
  AND created_by IS NULL;

UPDATE notification_templates
SET subject = 'تحديث فحص يتطلب المراجعة',
    body = 'تحديث الفحص.{{#if safety_hold}} وُضع قيد الانتظار لأسباب تتعلق بالسلامة.{{/if}}{{#if old_status}} تغيّرت حالته من {{old_status}} إلى {{new_status}}.{{/if}}{{#if to_stage}} انتقل من مرحلة {{from_stage}} إلى {{to_stage}}.{{/if}}{{#if order_number}} رقم الطلب: {{order_number}}.{{/if}}{{#if reason}} السبب: {{reason}}.{{/if}} يُرجى مراجعة الفحص داخل نظام VIARA.',
    updated_at = CURRENT_TIMESTAMP
WHERE event_type = 'ExamStatusChanged'
  AND channel = 'InApp'
  AND language = 'ar'
  AND created_by IS NULL;
