-- HR hardening: leave balances, staff credentials, and cleanup.
-- 1. leave_balances stores per-year entitlement overrides; the effective
--    entitlement falls back to env-configured defaults. Unpaid leave is
--    exempt from balances by design.
-- 2. staff_credentials tracks licenses and certifications with expiry, the
--    compliance backbone for a radiology center.
-- 3. employee_profiles.salary is dead: compensation lives in
--    employee_compensation_profiles and nothing reads this column.

CREATE TABLE IF NOT EXISTS leave_balances (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('Sick', 'Vacation', 'Personal')),
    entitlement_days NUMERIC(5,1) NOT NULL CHECK (entitlement_days >= 0),
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, year, leave_type)
);

CREATE TABLE IF NOT EXISTS staff_credentials (
    credential_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    credential_type VARCHAR(100) NOT NULL,
    credential_number VARCHAR(100),
    issuing_authority VARCHAR(150),
    issued_date DATE,
    expires_at DATE NOT NULL,
    notes TEXT,
    last_expiry_notified_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_staff_credentials_dates CHECK (issued_date IS NULL OR expires_at >= issued_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_credentials_user ON staff_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_credentials_expiry ON staff_credentials(expires_at);

ALTER TABLE employee_profiles DROP COLUMN IF EXISTS salary;

-- Expiry notification contract for the daily sweep.
INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description, required_variables) VALUES
('CredentialExpiring', 'Operational', 'Warning', '{InApp}', 'A staff license or certification expires soon', '["credential_type", "expires_at"]'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
('CredentialExpiring', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('CredentialExpiring', NULL, 'HR', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('CredentialExpiring', 'InApp', 'en', 'Credential Expiring Soon',
 'A staff credential is approaching its expiry date.\n\nEmployee: {{employee_name}}\nCredential: {{credential_type}}\nExpires: {{expires_at}}\nDays left: {{days_left}}{{#if credential_number}}\nNumber: {{credential_number}}{{/if}}'),
('CredentialExpiring', 'Email', 'en', 'Credential Expiring Soon',
 'Dear {{recipient_name}},\n\nA staff credential is approaching its expiry date and requires renewal follow-up.\n\nEmployee: {{employee_name}}\nCredential: {{credential_type}}\nExpires: {{expires_at}}\nDays left: {{days_left}}\n\nRegards,\nVIARA HR')
ON CONFLICT (event_type, channel, language) DO NOTHING;
