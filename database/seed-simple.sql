-- Quick Seed Script for RCMS
-- Run with: psql -U postgres -d rcms -f database/seed-simple.sql

-- Clear existing data
TRUNCATE TABLE system_logs, payments, invoices, examinations, appointments, patients, contracts, insurance_providers, modalities, users CASCADE;

-- Create Admin user
-- Passwords are provisioned by deployment/CI and must not be committed as plaintext.
INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES
('Admin User', 'admin@rcms.com', '***REMOVED***', 'Admin', TRUE),
('Receptionist', 'reception@rcms.com', '***REMOVED***', 'Receptionist', TRUE),
('Dr. Alice Smith', 'alice@rcms.com', '***REMOVED***', 'Radiologist', TRUE),
('Accountant', 'accountant@rcms.com', '***REMOVED***', 'Accountant', TRUE),
('HR Manager', 'hr@rcms.com', '***REMOVED***', 'HR', TRUE),
('Lead Technician', 'tech@rcms.com', '***REMOVED***', 'Technician', TRUE),
('Charge Nurse', 'nurse@rcms.com', '***REMOVED***', 'Nurse', TRUE)
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- Insert Modalities
INSERT INTO modalities (name, type, room_number, status) VALUES
('MRI-01 Siemens', 'MRI', 'Room 101', 'Active'),
('CT-01 GE', 'CT', 'Room 201', 'Active'),
('X-Ray-01', 'X-Ray', 'Room 301', 'Active'),
('US-01 Philips', 'Ultrasound', 'Room 401', 'Active'),
('PET-CT-01', 'PET', 'Room 501', 'Active');

SELECT 'Seed completed successfully!' as status;
SELECT email, role FROM users;
