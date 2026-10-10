-- Add missing audience policies for events introduced in notification hardening
-- Idempotent with ON CONFLICT DO NOTHING

INSERT INTO notification_audience_policies (event_type, event_category, role, allowed_channels, min_priority, inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
-- Inventory: LowStock and ItemExpired were missing policies
('LowStock', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('LowStock', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('ItemExpired', NULL, 'Technician', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('ItemExpired', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
-- PartialPaymentException: notify financial staff
('PartialPaymentException', NULL, 'Accountant', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PartialPaymentException', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('PartialPaymentException', NULL, 'Cashier', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;
