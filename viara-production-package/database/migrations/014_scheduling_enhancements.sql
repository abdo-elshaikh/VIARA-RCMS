-- Migration 014: Scheduling enhancements, waiting list, and reschedule history

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS appointment_source VARCHAR(30) DEFAULT 'Walk-in',
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(user_id),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS no_show_reason TEXT,
ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS preparation_status VARCHAR(30) DEFAULT 'Not Required';

ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS chk_appointments_source,
ADD CONSTRAINT chk_appointments_source
CHECK (appointment_source IN ('Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center'));

ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS chk_appointments_preparation_status,
ADD CONSTRAINT chk_appointments_preparation_status
CHECK (preparation_status IN ('Not Required', 'Pending', 'Completed', 'Waived'));

CREATE TABLE IF NOT EXISTS appointment_reschedule_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    old_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    old_end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    new_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    new_end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waiting_list (
    waitlist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    modality_id UUID REFERENCES modalities(modality_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    preferred_date DATE,
    preferred_start_time TIME,
    preferred_end_time TIME,
    priority VARCHAR(20) DEFAULT 'Routine' CHECK (priority IN ('Routine', 'Urgent', 'Emergency')),
    source VARCHAR(30) DEFAULT 'Walk-in' CHECK (source IN ('Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center')),
    status VARCHAR(20) DEFAULT 'Waiting' CHECK (status IN ('Waiting', 'Contacted', 'Scheduled', 'Cancelled')),
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    assigned_appointment_id UUID REFERENCES appointments(appointment_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waiting_list_status ON waiting_list(status);
CREATE INDEX IF NOT EXISTS idx_waiting_list_patient ON waiting_list(patient_id);
CREATE INDEX IF NOT EXISTS idx_waiting_list_modality_date ON waiting_list(modality_id, preferred_date);
CREATE INDEX IF NOT EXISTS idx_reschedule_history_appointment ON appointment_reschedule_history(appointment_id);
