-- Marketing campaign delivery controls and baseline templates.

ALTER TABLE patients
ALTER COLUMN opt_in_marketing SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
    campaign_recipient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES marketing_campaigns(campaign_id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('Email', 'SMS', 'WhatsApp')),
    status VARCHAR(20) NOT NULL DEFAULT 'Queued'
        CHECK (status IN ('Queued', 'Sent', 'Failed', 'Skipped', 'Cancelled', 'Converted')),
    job_id UUID REFERENCES notification_jobs(job_id) ON DELETE SET NULL,
    notification_id UUID REFERENCES notifications(notification_id) ON DELETE SET NULL,
    failure_reason TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    converted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (campaign_id, patient_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_campaign
ON marketing_campaign_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_patient
ON marketing_campaign_recipients(patient_id, created_at DESC);

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
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
