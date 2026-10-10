-- Add the technical Developer role and ensure existing application roles are present.
-- Keep this migration enum-only so later migrations can use the new values safely.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role'
          AND e.enumlabel = 'Marketing'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'Marketing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role'
          AND e.enumlabel = 'Developer'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'Developer';
    END IF;
END $$;
