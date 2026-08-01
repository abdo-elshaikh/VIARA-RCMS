-- Phase 10: Patient portal online access

CREATE TABLE IF NOT EXISTS patient_appointment_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    preferred_date DATE,
    preferred_time_window VARCHAR(50),
    modality_type VARCHAR(30),
    exam_type_id UUID REFERENCES examination_types(type_id) ON DELETE SET NULL,
    clinical_notes TEXT,
    contact_phone VARCHAR(50),
    contact_email VARCHAR(150),
    status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reviewed', 'Scheduled', 'Rejected', 'Cancelled')),
    staff_notes TEXT,
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_portal_documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    title VARCHAR(180) NOT NULL,
    document_type VARCHAR(80) NOT NULL DEFAULT 'Other',
    file_url TEXT NOT NULL,
    is_patient_visible BOOLEAN DEFAULT TRUE,
    uploaded_by UUID REFERENCES users(user_id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS patient_profile_update_requests (
    update_request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    requested_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Applied')),
    staff_notes TEXT,
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_portal_audit (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    resource_type VARCHAR(80),
    resource_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(80),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_appointment_requests_patient ON patient_appointment_requests(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_appointment_requests_status ON patient_appointment_requests(status);
CREATE INDEX IF NOT EXISTS idx_patient_portal_documents_patient ON patient_portal_documents(patient_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_profile_update_requests_patient ON patient_profile_update_requests(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_portal_audit_patient ON patient_portal_audit(patient_id, created_at DESC);
