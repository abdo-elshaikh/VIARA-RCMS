CREATE TABLE IF NOT EXISTS critical_result_admin_followup_tasks (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    critical_marked_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Completed')),
    created_by UUID NOT NULL REFERENCES users(user_id),
    contacted_party VARCHAR(160),
    follow_up_notes TEXT,
    completed_by UUID REFERENCES users(user_id),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_critical_result_admin_followup_occurrence UNIQUE (exam_id, critical_marked_at),
    CONSTRAINT chk_critical_result_admin_followup_completion CHECK (
        (status = 'Open' AND completed_by IS NULL AND completed_at IS NULL)
        OR
        (status = 'Completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL
            AND contacted_party IS NOT NULL AND follow_up_notes IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_critical_result_admin_followup_open
    ON critical_result_admin_followup_tasks (created_at, task_id)
    WHERE status = 'Open';

INSERT INTO notification_event_catalog (
    event_type, category, default_priority, default_channels, description, required_variables
) VALUES ('CriticalResultFollowUpRequired',
    'Clinical',
    'Critical',
    ARRAY['InApp'],
    'Administrative handoff required because no clinical acknowledgement recipient was available',
    '["task_id", "exam_id", "order_number"]'::jsonb
)
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description,
    required_variables = EXCLUDED.required_variables;

INSERT INTO notification_audience_policies (
    event_type, event_category, role, allowed_channels, min_priority,
    inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled
) VALUES ('CriticalResultFollowUpRequired', NULL, 'Admin',
    ARRAY['InApp'], 'Critical', TRUE, FALSE, FALSE, FALSE
)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active) VALUES
(
    'CriticalResultFollowUpRequired', 'InApp', 'en',
    'Urgent clinical handoff required',
    'Critical result for order {{order_number}} has no available doctor or nurse for acknowledgement. Coordinate urgent clinical follow-up for task {{task_id}}. Administrative follow-up does not replace clinical acknowledgement.',
    TRUE
),
(
    'CriticalResultFollowUpRequired', 'InApp', 'ar',
    'يلزم توجيه سريري عاجل',
    'لا يوجد طبيب أو ممرض متاح لإقرار النتيجة الحرجة للطلب {{order_number}}. نسّق المتابعة السريرية العاجلة للمهمة {{task_id}}. المتابعة الإدارية لا تُعد إقرارًا سريريًا.',
    TRUE
)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
