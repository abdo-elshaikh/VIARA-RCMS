-- Phase 4: Order Management / Study Request Handling

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_priority') THEN
        CREATE TYPE order_priority AS ENUM ('Routine', 'Urgent', 'Emergency');
    END IF;
END $$;

ALTER TABLE examination_types
    ADD COLUMN IF NOT EXISTS body_part VARCHAR(100),
    ADD COLUMN IF NOT EXISTS preparation_instructions TEXT,
    ADD COLUMN IF NOT EXISTS contrast_required BOOLEAN DEFAULT FALSE;

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS order_number VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS priority order_priority DEFAULT 'Routine',
    ADD COLUMN IF NOT EXISTS clinical_indication TEXT,
    ADD COLUMN IF NOT EXISTS provisional_diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS icd_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS body_part VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contrast_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pregnancy_safety_status VARCHAR(30) DEFAULT 'Unknown',
    ADD COLUMN IF NOT EXISTS implant_safety_status VARCHAR(30) DEFAULT 'Unknown',
    ADD COLUMN IF NOT EXISTS renal_safety_status VARCHAR(30) DEFAULT 'Unknown';

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS order_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS priority order_priority DEFAULT 'Routine',
    ADD COLUMN IF NOT EXISTS clinical_indication TEXT,
    ADD COLUMN IF NOT EXISTS provisional_diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS icd_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS body_part VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contrast_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pregnancy_safety_status VARCHAR(30) DEFAULT 'Unknown',
    ADD COLUMN IF NOT EXISTS implant_safety_status VARCHAR(30) DEFAULT 'Unknown',
    ADD COLUMN IF NOT EXISTS renal_safety_status VARCHAR(30) DEFAULT 'Unknown';

UPDATE appointments
SET order_number = 'ORD-' || to_char(COALESCE(created_at, NOW()), 'YYYYMMDD') || '-' || upper(substr(replace(appointment_id::text, '-', ''), 1, 6))
WHERE order_number IS NULL;

UPDATE examinations e
SET order_number = a.order_number,
    priority = COALESCE(e.priority, a.priority),
    clinical_indication = COALESCE(e.clinical_indication, a.clinical_indication),
    provisional_diagnosis = COALESCE(e.provisional_diagnosis, a.provisional_diagnosis),
    icd_code = COALESCE(e.icd_code, a.icd_code),
    body_part = COALESCE(e.body_part, a.body_part),
    contrast_required = COALESCE(e.contrast_required, a.contrast_required),
    pregnancy_safety_status = COALESCE(e.pregnancy_safety_status, a.pregnancy_safety_status),
    implant_safety_status = COALESCE(e.implant_safety_status, a.implant_safety_status),
    renal_safety_status = COALESCE(e.renal_safety_status, a.renal_safety_status)
FROM appointments a
WHERE e.appointment_id = a.appointment_id
  AND e.order_number IS NULL;

CREATE TABLE IF NOT EXISTS order_status_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (appointment_id IS NOT NULL OR exam_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_appointments_order_number ON appointments(order_number);
CREATE INDEX IF NOT EXISTS idx_appointments_priority ON appointments(priority);
CREATE INDEX IF NOT EXISTS idx_examinations_order_number ON examinations(order_number);
CREATE INDEX IF NOT EXISTS idx_examinations_priority ON examinations(priority);
CREATE INDEX IF NOT EXISTS idx_order_status_history_appointment ON order_status_history(appointment_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_exam ON order_status_history(exam_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at);

ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS chk_appointments_pregnancy_safety_status,
    ADD CONSTRAINT chk_appointments_pregnancy_safety_status CHECK (pregnancy_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    DROP CONSTRAINT IF EXISTS chk_appointments_implant_safety_status,
    ADD CONSTRAINT chk_appointments_implant_safety_status CHECK (implant_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    DROP CONSTRAINT IF EXISTS chk_appointments_renal_safety_status,
    ADD CONSTRAINT chk_appointments_renal_safety_status CHECK (renal_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable'));

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS chk_examinations_pregnancy_safety_status,
    ADD CONSTRAINT chk_examinations_pregnancy_safety_status CHECK (pregnancy_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    DROP CONSTRAINT IF EXISTS chk_examinations_implant_safety_status,
    ADD CONSTRAINT chk_examinations_implant_safety_status CHECK (implant_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    DROP CONSTRAINT IF EXISTS chk_examinations_renal_safety_status,
    ADD CONSTRAINT chk_examinations_renal_safety_status CHECK (renal_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable'));
