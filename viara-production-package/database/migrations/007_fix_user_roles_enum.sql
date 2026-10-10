-- Fix user_role enum by adding missing values
-- PostgreSQL requires ALTER TYPE ADD VALUE for enums

DO $$ 
BEGIN
    -- Add HR role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'HR' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'HR';
    END IF;
    
    -- Add Technician role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Technician' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'Technician';
    END IF;
    
    -- Add Nurse role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Nurse' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'Nurse';
    END IF;
END $$;
