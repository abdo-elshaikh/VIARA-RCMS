-- Migration: Add new roles to the user_role enum

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'HR' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'HR';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Technician' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'Technician';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Nurse' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'Nurse';
    END IF;
END $$;

-- Seed new users
INSERT INTO users (full_name, email, password_hash, role, is_active)
VALUES
('Human Resources', 'hr@rcms.com', '***REMOVED***', 'HR', TRUE),
('Tech Tom', 'tech@rcms.com', '***REMOVED***', 'Technician', TRUE),
('Nurse Nancy', 'nurse@rcms.com', '***REMOVED***', 'Nurse', TRUE)
ON CONFLICT (email) DO NOTHING;
