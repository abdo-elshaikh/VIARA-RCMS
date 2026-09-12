-- Migration: Clean up duplicate and redundant database constraints on examinations table
-- Removes older duplicate CHECK constraints that were created inconsistently across migrations.

-- Remove duplicate pregnancy_safety_status CHECK (chk_ prefix duplicate of examinations_ prefix)
ALTER TABLE examinations DROP CONSTRAINT IF EXISTS chk_examinations_pregnancy_safety_status;

-- Remove duplicate implant_safety_status CHECK
ALTER TABLE examinations DROP CONSTRAINT IF EXISTS chk_examinations_implant_safety_status;

-- Remove duplicate renal_safety_status CHECK
ALTER TABLE examinations DROP CONSTRAINT IF EXISTS chk_examinations_renal_safety_status;

-- Remove duplicate current_station CHECK
ALTER TABLE examinations DROP CONSTRAINT IF EXISTS chk_examinations_current_station;

-- examinations_exam_id_not_null is redundant with the PRIMARY KEY on exam_id
DO $$
BEGIN
    ALTER TABLE examinations DROP CONSTRAINT IF EXISTS examinations_exam_id_not_null;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
