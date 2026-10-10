-- An empty preparation payload must not produce an empty portal notification.
UPDATE notification_templates
SET body = '{{prep_instructions || "Preparation instructions are available in your portal."}}',
    updated_at = CURRENT_TIMESTAMP
WHERE event_type = 'PrepInstructions'
  AND channel = 'InApp'
  AND language = 'en'
  AND body = '{{prep_instructions}}'
  AND created_by IS NULL;
