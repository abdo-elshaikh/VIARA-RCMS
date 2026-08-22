-- Demo seed data demonstrating inventory, HR, CRM, notifications, and equipment modules

-- Inventory demo items
INSERT INTO inventory_items (name, category, quantity, unit, min_level)
SELECT 'Iodine Contrast 100ml', 'Contrast', 8, 'vials', 10
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Iodine Contrast 100ml');

INSERT INTO inventory_items (name, category, quantity, unit, min_level)
SELECT 'Syringe 10ml', 'Supplies', 150, 'units', 50
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'Syringe 10ml');

INSERT INTO inventory_items (name, category, quantity, unit, min_level)
SELECT 'MRI Coils Disposable Cover', 'Supplies', 25, 'units', 20
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = 'MRI Coils Disposable Cover');

-- Supplier demo
INSERT INTO suppliers (name, contact_name, phone, email, status)
VALUES ('MedSupply Co.', 'Sarah Vendor', '555-0200', 'orders@medsupply.example', 'Active')
ON CONFLICT DO NOTHING;

-- Employee profile for demo HR user
INSERT INTO employee_profiles (user_id, employee_id, department, job_title, hire_date, employment_status)
SELECT user_id, 'EMP-HR-001', 'Human Resources', 'HR Manager', '2022-01-15', 'Active'
FROM users WHERE email = 'hr@VIARA.com'
ON CONFLICT (user_id) DO NOTHING;

-- CRM segment + campaign demo
INSERT INTO patient_segments (name, description, created_by)
SELECT 'Loyal Patients', 'Patients with repeat visits', user_id
FROM users WHERE email = 'admin@VIARA.com'
ON CONFLICT DO NOTHING;

INSERT INTO marketing_campaigns (name, target_segment, channel, status, budget, start_date, end_date, created_by)
SELECT 'Spring Checkup Promo', s.segment_id, 'Email', 'Draft', 500.00,
       CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', u.user_id
FROM patient_segments s
CROSS JOIN users u
WHERE s.name = 'Loyal Patients' AND u.email = 'admin@VIARA.com'
ON CONFLICT DO NOTHING;

-- Insurance staff demo user
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES ('Insurance Clerk', 'insurance@VIARA.com', '***REMOVED***', 'Insurance_Staff', TRUE)
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE;

-- RBAC for Insurance Staff
INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Insurance_Staff'::user_role, permission_id FROM permissions
WHERE name IN ('VIEW_PATIENTS', 'VIEW_INVOICES', 'VIEW_APPOINTMENTS')
ON CONFLICT DO NOTHING;
