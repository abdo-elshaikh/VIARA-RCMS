-- Initial Seed Data for VIARA

-- 1. Insert demo users
-- Demo user passwords are provisioned by deployment/CI and must not be committed as plaintext.
-- Each demo account uses a per-user bcrypt hash generated at deployment time; this file only
-- provisions a random, non-login placeholder that is force-replaced by scripts/resetDemoAccounts.js
-- (or the JS seeders) before the environment is handed to any human.
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES
('System Admin', 'admin@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Admin', FALSE),
('Dr. Alice Smith', 'alice@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Radiologist', FALSE),
('Front Desk', 'reception@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Receptionist', FALSE),
('Cashier Desk', 'cashier@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Cashier', FALSE),
('Finance User', 'accountant@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Accountant', FALSE),
('HR Manager', 'hr@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'HR', FALSE),
('Lead Technician', 'tech@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Technician', FALSE),
('Charge Nurse', 'nurse@VIARA.com', '$2b$12$ DISABLED-PLACEHOLDER-RUN-SEEDER', 'Nurse', FALSE)
ON CONFLICT (email) DO NOTHING;

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
