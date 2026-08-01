-- Phase 20/0: Security events logging and Insurance Staff role

-- Insurance Staff role for claims workbench
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'Insurance_Staff'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'Insurance_Staff';
    END IF;
END $$;

-- Dedicated security event stream (complements system_logs audit trail)
CREATE TABLE IF NOT EXISTS security_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'critical')),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity) WHERE severity != 'info';

-- Marketing campaign notification template
INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('MarketingCampaign', 'Email', 'en',
 'News from {{center_name}}',
 'Dear {{patient_name}},\n\n{{campaign_message}}\n\nReply STOP to opt out of marketing messages.\n\nRegards,\n{{center_name}}'),
('MarketingCampaign', 'SMS', 'en',
 NULL,
 '{{center_name}}: {{campaign_message}} Reply STOP to opt out.')
ON CONFLICT (event_type, channel, language) DO NOTHING;

-- Default working hours in center_settings when missing
UPDATE center_settings
SET working_hours = COALESCE(working_hours, '{"start": 6, "end": 22, "holidays": []}'::jsonb)
WHERE working_hours IS NULL;
