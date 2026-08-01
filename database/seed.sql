-- Initial Seed Data for RCMS

-- 1. Insert demo users
-- All demo users use password 'password123'.
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES 
('System Admin', 'admin@rcms.com', '***REMOVED***', 'Admin', TRUE), -- admin@rcms.com uses password 'password123'
('Dr. Alice Smith', 'alice@rcms.com', '***REMOVED***', 'Radiologist', TRUE), -- alice@rcms.com uses password 'password123'
('Front Desk', 'reception@rcms.com', '***REMOVED***', 'Receptionist', TRUE), -- reception@rcms.com uses password 'password123'
('Cashier Desk', 'cashier@rcms.com', '***REMOVED***', 'Cashier', TRUE), -- cashier@rcms.com uses password 'password123'
('Finance User', 'accountant@rcms.com', '***REMOVED***', 'Accountant', TRUE), -- accountant@rcms.com uses password 'password123'
('HR Manager', 'hr@rcms.com', '***REMOVED***', 'HR', TRUE), -- hr@rcms.com uses password 'password123'
('Lead Technician', 'tech@rcms.com', '***REMOVED***', 'Technician', TRUE), -- tech@rcms.com uses password 'password123'
('Charge Nurse', 'nurse@rcms.com', '***REMOVED***', 'Nurse', TRUE) -- nurse@rcms.com uses password 'password123'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- 2. Insert Modalities (Machines)
INSERT INTO modalities (name, type, room_number, status)
VALUES
('MRI - Siemens Magnetom', 'MRI', 'Room 101', 'Active'),
('CT - GE Revolution', 'CT', 'Room 102', 'Active'),
('X-Ray - Philips Digital', 'X-Ray', 'Room 103', 'Under Maintenance'),
('Ultrasound - GE Vantage', 'Ultrasound', 'Room 104', 'Active'),
('Panoramic X-Ray - GE Vantage', 'Panoramic X-Ray', 'Room 105', 'Active'),
('Mammography - GE Vantage', 'Mammography', 'Room 106', 'Active'),
('Cardiac Catheterization - GE Vantage', 'Cath Lab', 'Room 107', 'Active');

-- 2b. Insert Examination Types
INSERT INTO examination_types (modality_id, name, price, duration_minutes)
SELECT modality_id, exam_name, price, duration_minutes
FROM modalities
CROSS JOIN LATERAL (
    VALUES
        ('MRI', 'MRI Brain', 1500.00, 30),
        ('MRI', 'MRI Spine', 1800.00, 45),
        ('MRI', 'MRI Knee', 1200.00, 30),
        ('CT', 'CT Chest', 800.00, 15),
        ('CT', 'CT Abdomen', 1000.00, 20),
        ('X-Ray', 'Chest X-Ray', 200.00, 5),
        ('X-Ray', 'Leg X-Ray', 200.00, 5),
        ('Ultrasound', 'Abdominal Ultrasound', 400.00, 15),
        ('Ultrasound', 'Pelvic Ultrasound', 350.00, 15)
) AS exams(modality_type, exam_name, price, duration_minutes)
WHERE modalities.type = exams.modality_type
ON CONFLICT (modality_id, name) DO NOTHING;

-- 3. Insert Insurance Providers
INSERT INTO insurance_providers (name, contact_info)
VALUES
('Blue Cross', '{"phone": "555-0101", "email": "claims@bluecross.com"}'),
('Medicare', '{"phone": "555-0102", "email": "support@medicare.gov"}');

-- 4. Insert Contracts (Referring Doctors)
INSERT INTO contracts (entity_name, entity_type, commission_percentage, start_date)
VALUES
('Dr. Bob Jones', 'Doctor', 10.0, '2023-01-01'),
('City Clinic', 'Company', 15.0, '2023-01-01');
