-- Role-specific clinical task ownership and immutable assignment history.
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS nurse_assigned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS technician_assigned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS nurse_task_available_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS technician_task_available_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS nurse_task_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS technician_task_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS nurse_assignment_version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS technician_assignment_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS radiologist_assigned_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS radiologist_task_available_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS radiologist_task_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS radiologist_assignment_version INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_appointment_assignment_metadata()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.nurse_id IS NOT NULL THEN
            NEW.nurse_assigned_at := COALESCE(NEW.nurse_assigned_at, CURRENT_TIMESTAMP);
            NEW.nurse_assignment_version := GREATEST(NEW.nurse_assignment_version, 1);
        END IF;
        IF NEW.technician_id IS NOT NULL THEN
            NEW.technician_assigned_at := COALESCE(NEW.technician_assigned_at, CURRENT_TIMESTAMP);
            NEW.technician_assignment_version := GREATEST(NEW.technician_assignment_version, 1);
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.nurse_id IS DISTINCT FROM OLD.nurse_id THEN
        NEW.nurse_assigned_at := CASE WHEN NEW.nurse_id IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END;
        NEW.nurse_task_started_at := NULL;
        NEW.nurse_assignment_version := GREATEST(NEW.nurse_assignment_version, OLD.nurse_assignment_version + 1);
    END IF;
    IF NEW.technician_id IS DISTINCT FROM OLD.technician_id THEN
        NEW.technician_assigned_at := CASE WHEN NEW.technician_id IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END;
        NEW.technician_task_started_at := NULL;
        NEW.technician_assignment_version := GREATEST(NEW.technician_assignment_version, OLD.technician_assignment_version + 1);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_appointment_assignment_metadata ON appointments;
CREATE TRIGGER trg_sync_appointment_assignment_metadata
BEFORE INSERT OR UPDATE OF nurse_id, technician_id ON appointments
FOR EACH ROW EXECUTE FUNCTION sync_appointment_assignment_metadata();

CREATE OR REPLACE FUNCTION sync_radiologist_assignment_metadata()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.performing_radiologist_id IS NOT NULL THEN
            NEW.radiologist_assigned_at := COALESCE(NEW.radiologist_assigned_at, CURRENT_TIMESTAMP);
            NEW.radiologist_assignment_version := GREATEST(NEW.radiologist_assignment_version, 1);
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.performing_radiologist_id IS DISTINCT FROM OLD.performing_radiologist_id THEN
        NEW.radiologist_assigned_at := CASE WHEN NEW.performing_radiologist_id IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END;
        NEW.radiologist_task_started_at := NULL;
        NEW.radiologist_assignment_version := GREATEST(NEW.radiologist_assignment_version, OLD.radiologist_assignment_version + 1);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_radiologist_assignment_metadata ON examinations;
CREATE TRIGGER trg_sync_radiologist_assignment_metadata
BEFORE INSERT OR UPDATE OF performing_radiologist_id ON examinations
FOR EACH ROW EXECUTE FUNCTION sync_radiologist_assignment_metadata();

UPDATE appointments
SET nurse_assigned_at = COALESCE(nurse_assigned_at, created_at),
    nurse_assignment_version = GREATEST(nurse_assignment_version, 1)
WHERE nurse_id IS NOT NULL;

UPDATE appointments
SET technician_assigned_at = COALESCE(technician_assigned_at, created_at),
    technician_assignment_version = GREATEST(technician_assignment_version, 1)
WHERE technician_id IS NOT NULL;

UPDATE examinations
SET radiologist_assigned_at = COALESCE(radiologist_assigned_at, created_at),
    radiologist_assignment_version = GREATEST(radiologist_assignment_version, 1)
WHERE performing_radiologist_id IS NOT NULL;

UPDATE appointments a
SET nurse_task_available_at = COALESCE(a.nurse_task_available_at, e.arrived_at, e.created_at)
FROM examinations e
WHERE e.appointment_id = a.appointment_id
  AND e.current_station = 'Nurse';

UPDATE appointments a
SET technician_task_available_at = COALESCE(a.technician_task_available_at, e.prep_completed_at, e.created_at)
FROM examinations e
WHERE e.appointment_id = a.appointment_id
  AND e.current_station = 'Modality';

UPDATE examinations
SET radiologist_task_available_at = COALESCE(radiologist_task_available_at, exam_completed_at, created_at)
WHERE current_station = 'Radiologist';

UPDATE appointments a
SET nurse_task_started_at = COALESCE(a.nurse_task_started_at, e.prep_started_at)
FROM examinations e
WHERE e.appointment_id = a.appointment_id
  AND a.nurse_id IS NOT NULL
  AND e.current_station = 'Nurse'
  AND e.prep_started_at IS NOT NULL;

UPDATE appointments a
SET technician_task_started_at = COALESCE(a.technician_task_started_at, e.exam_started_at)
FROM examinations e
WHERE e.appointment_id = a.appointment_id
  AND a.technician_id IS NOT NULL
  AND e.current_station = 'Modality'
  AND e.exam_started_at IS NOT NULL;

UPDATE examinations
SET radiologist_task_started_at = COALESCE(radiologist_task_started_at, reporting_started_at)
WHERE performing_radiologist_id IS NOT NULL
  AND current_station = 'Radiologist'
  AND reporting_started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS clinical_task_assignment_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    task_role VARCHAR(30) NOT NULL CHECK (task_role IN ('Nurse', 'Technician', 'Radiologist')),
    action VARCHAR(30) NOT NULL CHECK (action IN ('Claim', 'Assign', 'Transfer', 'Release')),
    previous_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    new_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    performed_by UUID NOT NULL REFERENCES users(user_id),
    reason TEXT,
    available_at TIMESTAMP WITH TIME ZONE,
    assignment_version INTEGER NOT NULL CHECK (assignment_version > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE clinical_task_assignment_events
    ADD COLUMN IF NOT EXISTS available_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_clinical_task_assignment_exam
    ON clinical_task_assignment_events (exam_id, task_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_task_assignment_new_user
    ON clinical_task_assignment_events (new_user_id, created_at DESC)
    WHERE new_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_nurse_active_assignment
    ON appointments (nurse_id, nurse_assigned_at)
    WHERE nurse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_technician_active_assignment
    ON appointments (technician_id, technician_assigned_at)
    WHERE technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_examinations_radiologist_active_assignment
    ON examinations (performing_radiologist_id, radiologist_assigned_at)
    WHERE performing_radiologist_id IS NOT NULL;

INSERT INTO permissions (name, module, description)
VALUES ('ASSIGN_CLINICAL_TASKS', 'Clinical Operations', 'Assign or transfer role-specific clinical tasks')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT 'Admin'::user_role, permission_id
FROM permissions
WHERE name = 'ASSIGN_CLINICAL_TASKS'
ON CONFLICT DO NOTHING;
