-- 053_modality_dicom_config.sql

-- Add DICOM connection parameters to the modalities table
ALTER TABLE modalities ADD COLUMN IF NOT EXISTS aet VARCHAR(50);
ALTER TABLE modalities ADD COLUMN IF NOT EXISTS ip_address VARCHAR(255);
ALTER TABLE modalities ALTER COLUMN ip_address TYPE VARCHAR(255);
ALTER TABLE modalities ADD COLUMN IF NOT EXISTS port INTEGER;

-- Ensure port is valid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'modalities'::regclass
          AND conname = 'chk_modality_port'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'modalities'::regclass
          AND conname = 'modalities_port_check'
    ) THEN
        ALTER TABLE modalities
            ADD CONSTRAINT chk_modality_port CHECK (port IS NULL OR (port > 0 AND port <= 65535));
    END IF;
END $$;

-- Add a column to track if it has been synced to Orthanc
ALTER TABLE modalities ADD COLUMN IF NOT EXISTS dicom_synced BOOLEAN DEFAULT FALSE;
