-- VIARA Database Schema (PostgreSQL)

-- 1. ENUMS and Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

CREATE TYPE user_role AS ENUM ('Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Referring_Doctor', 'HR', 'Technician', 'Nurse', 'Marketing');
CREATE TYPE machine_status AS ENUM ('Active', 'Maintenance', 'Down');
CREATE TYPE exam_status AS ENUM ('Scheduled', 'Checked-in', 'Scanning', 'Completed', 'Reporting', 'Finalized');
CREATE TYPE payment_status AS ENUM ('Pending', 'Paid', 'Refunded', 'Partial');
CREATE TYPE order_priority AS ENUM ('Routine', 'Urgent', 'Emergency');

-- 2. Users & Authentication
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    phone VARCHAR(30),
    department VARCHAR(100),
    job_title VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    two_factor_secret VARCHAR(255), -- For 2FA
    is_2fa_enabled BOOLEAN DEFAULT FALSE,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- 3. Inventory & Machines
CREATE TABLE modalities (
    modality_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL, -- e.g., 'MRI-01', 'CT-Scanner-A'
    type VARCHAR(20) NOT NULL, -- 'MRI', 'CT', 'X-Ray'
    status VARCHAR(30) DEFAULT 'Active' CHECK (status IN ('Active', 'Under Maintenance', 'Out of Service')),
    room_number VARCHAR(20),
    maintenance_schedule JSONB, -- Stores next maintenance dates
    aet VARCHAR(50), -- DICOM Application Entity Title
    ip_address VARCHAR(45),
    port INTEGER CHECK (port > 0 AND port <= 65535),
    dicom_synced BOOLEAN DEFAULT FALSE, -- Track if pushed to Orthanc
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE examination_types (
    type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modality_id UUID REFERENCES modalities(modality_id),
    code VARCHAR(40),
    name VARCHAR(100) NOT NULL, -- e.g., 'Brain MRI', 'Chest CT'
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0), 
    duration_minutes INTEGER DEFAULT 30 CHECK (duration_minutes BETWEEN 1 AND 1440),
    body_part VARCHAR(100),
    preparation_instructions TEXT,
    contrast_required BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (modality_id, name)
);

CREATE UNIQUE INDEX idx_examination_types_code_unique
    ON examination_types (UPPER(code)) WHERE code IS NOT NULL;
CREATE INDEX idx_examination_types_active_modality
    ON examination_types (is_active, modality_id, name);

-- 4. Patients (PII Sensitive)
-- Note: 'encrypted_pii' field could be used if decided to store whole blob encrypted, 
-- but here we assume specific sensitive fields like ssn/dob might be handled in app layer 
-- or stored as separate columns. For this strict schema, we'll keep standard columns 
-- but mark them conceptually for app-level encryption.
CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mrn VARCHAR(50) UNIQUE NOT NULL, -- Medical Record Number
    iv_vector VARCHAR(255), -- For encryption (Initialization Vector)
    
    -- Encrypted fields (Stored as Text/Bytea in practice, here Varchar for representation)
    first_name_enc VARCHAR(500) NOT NULL,
    last_name_enc VARCHAR(500) NOT NULL,
    date_of_birth_enc VARCHAR(500),
    phone_enc VARCHAR(500),
    address_enc TEXT,
    national_id_enc VARCHAR(500),
    national_id_hash VARCHAR(64),
    passport_number_enc VARCHAR(500),
    passport_number_hash VARCHAR(64),
    date_of_birth_hash VARCHAR(64),
    name_dob_hash VARCHAR(64),
    emergency_contact_name_enc VARCHAR(500),
    emergency_contact_phone_enc VARCHAR(500),
    emergency_contact_relationship VARCHAR(100),
    emergency_contact_address_enc TEXT,
    allergies_enc TEXT,
    chronic_diseases_enc TEXT,
    prior_surgeries_enc TEXT,
    pregnancy_status VARCHAR(30),
    implants_devices_enc TEXT,
    renal_function_notes_enc TEXT,
    preferred_language VARCHAR(50) DEFAULT 'English',
    communication_preference VARCHAR(20) DEFAULT 'Phone' CHECK (communication_preference IN ('Phone', 'Email', 'SMS', 'WhatsApp')),
    consent_sms BOOLEAN DEFAULT FALSE,
    consent_email BOOLEAN DEFAULT FALSE,
    consent_whatsapp BOOLEAN DEFAULT FALSE,
    consent_marketing BOOLEAN DEFAULT FALSE,
    opt_in_marketing BOOLEAN DEFAULT FALSE,
    consent_data_sharing BOOLEAN DEFAULT FALSE,
    is_confidential BOOLEAN DEFAULT FALSE,
    patient_status VARCHAR(20) DEFAULT 'Active' CHECK (patient_status IN ('Active', 'Inactive', 'Deceased', 'Merged', 'Restricted', 'Anonymized')),
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255),
    assigned_manager_id UUID REFERENCES users(user_id),
    lead_status VARCHAR(30) DEFAULT 'New',
    planned_activity VARCHAR(255),
    first_name_hash VARCHAR(64),
    last_name_hash VARCHAR(64),
    phone_hash VARCHAR(64),
    
    gender VARCHAR(10), -- Usually not PII enough to require heavy encryption if used for stats
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patients_mrn ON patients(mrn);
CREATE INDEX idx_patients_first_name_hash ON patients(first_name_hash);
CREATE INDEX idx_patients_last_name_hash ON patients(last_name_hash);
CREATE INDEX idx_patients_phone_hash ON patients(phone_hash);
CREATE INDEX idx_patients_national_id_hash ON patients(national_id_hash);
CREATE INDEX idx_patients_passport_number_hash ON patients(passport_number_hash);
CREATE INDEX idx_patients_date_of_birth_hash ON patients(date_of_birth_hash);
CREATE INDEX idx_patients_name_dob_hash ON patients(name_dob_hash);
CREATE INDEX idx_patients_status ON patients(patient_status);

CREATE TABLE referring_doctors (
    doctor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    specialty VARCHAR(100),
    clinic_hospital VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    tax_id VARCHAR(100),
    contract_id UUID,
    referral_source_category VARCHAR(50) DEFAULT 'Doctor',
    commission_percentage DECIMAL(5,2) DEFAULT 0,
    preferred_contact_method VARCHAR(20) DEFAULT 'Email' CHECK (preferred_contact_method IN ('Phone', 'Email', 'SMS', 'WhatsApp')),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_referring_doctors_active ON referring_doctors(is_active);
CREATE INDEX idx_referring_doctors_name ON referring_doctors(full_name);

-- 5. Appointments & Scheduling
CREATE TABLE appointments (
    appointment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id),
    modality_id UUID REFERENCES modalities(modality_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'Confirmed', -- Confirmed, Cancelled, No-Show
    order_number VARCHAR(50) UNIQUE,
    priority order_priority DEFAULT 'Routine',
    clinical_indication TEXT,
    provisional_diagnosis TEXT,
    icd_code VARCHAR(30),
    body_part VARCHAR(100),
    contrast_required BOOLEAN DEFAULT FALSE,
    pregnancy_safety_status VARCHAR(30) DEFAULT 'Unknown' CHECK (pregnancy_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    implant_safety_status VARCHAR(30) DEFAULT 'Unknown' CHECK (implant_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    renal_safety_status VARCHAR(30) DEFAULT 'Unknown' CHECK (renal_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
    prior_exam_id UUID,
    follow_up_reason TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    referring_doctor VARCHAR(255),
    referring_doctor_id UUID REFERENCES referring_doctors(doctor_id),
    technician_id UUID REFERENCES users(user_id),
    nurse_id UUID REFERENCES users(user_id),
    radiologist_id UUID REFERENCES users(user_id),
    technician_assigned_at TIMESTAMP WITH TIME ZONE,
    nurse_assigned_at TIMESTAMP WITH TIME ZONE,
    technician_task_available_at TIMESTAMP WITH TIME ZONE,
    nurse_task_available_at TIMESTAMP WITH TIME ZONE,
    technician_task_started_at TIMESTAMP WITH TIME ZONE,
    nurse_task_started_at TIMESTAMP WITH TIME ZONE,
    technician_assignment_version INTEGER NOT NULL DEFAULT 0,
    nurse_assignment_version INTEGER NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    payment_amount DECIMAL(10,2),
    transaction_ref VARCHAR(100),
    appointment_source VARCHAR(30) DEFAULT 'Walk-in' CHECK (appointment_source IN ('Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center')),
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(user_id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    no_show_reason TEXT,
    no_show_at TIMESTAMP WITH TIME ZONE,
    preparation_status VARCHAR(30) DEFAULT 'Not Required' CHECK (preparation_status IN ('Not Required', 'Pending', 'Completed', 'Waived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT no_overlap EXCLUDE USING GIST (
        modality_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status != 'Cancelled') 
);

-- 6. Examinations (Workflow)
CREATE TABLE examinations (
    exam_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(appointment_id),
    patient_id UUID REFERENCES patients(patient_id),
    modality_id UUID REFERENCES modalities(modality_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    performing_radiologist_id UUID REFERENCES users(user_id),
    radiologist_assigned_at TIMESTAMP WITH TIME ZONE,
    radiologist_task_available_at TIMESTAMP WITH TIME ZONE,
    radiologist_task_started_at TIMESTAMP WITH TIME ZONE,
    radiologist_assignment_version INTEGER NOT NULL DEFAULT 0,
    referring_doctor_id UUID REFERENCES users(user_id), -- Can be internal or external
    external_referring_doctor_id UUID REFERENCES referring_doctors(doctor_id),
    
    study_instance_uid VARCHAR(255) UNIQUE, -- DICOM Link
    status exam_status DEFAULT 'Scheduled',
    order_number VARCHAR(50),
    priority order_priority DEFAULT 'Routine',
    clinical_indication TEXT,
    provisional_diagnosis TEXT,
    icd_code VARCHAR(30),
    body_part VARCHAR(100),
    contrast_required BOOLEAN DEFAULT FALSE,
    pregnancy_safety_status VARCHAR(30) DEFAULT 'Unknown' CHECK (pregnancy_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    implant_safety_status VARCHAR(30) DEFAULT 'Unknown' CHECK (implant_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    renal_safety_status VARCHAR(30) DEFAULT 'Unknown' CHECK (renal_safety_status IN ('Unknown', 'Cleared', 'At Risk', 'Not Applicable')),
    is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
    prior_exam_id UUID REFERENCES examinations(exam_id) ON DELETE RESTRICT,
    follow_up_reason TEXT,
    queue_stage VARCHAR(30) DEFAULT 'Scheduled' CHECK (queue_stage IN ('Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam', 'In Exam', 'Images Ready', 'Images Delivered', 'Reporting', 'Finalized', 'Delivered', 'Cancelled')),
    current_station VARCHAR(30) DEFAULT 'Reception' CHECK (current_station IN ('Reception', 'Cashier', 'Nurse', 'Modality', 'Radiologist', 'Delivery')),
    arrived_at TIMESTAMP WITH TIME ZONE,
    prep_started_at TIMESTAMP WITH TIME ZONE,
    prep_completed_at TIMESTAMP WITH TIME ZONE,
    exam_started_at TIMESTAMP WITH TIME ZONE,
    exam_completed_at TIMESTAMP WITH TIME ZONE,
    reporting_started_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    is_on_hold BOOLEAN DEFAULT FALSE,
    hold_started_at TIMESTAMP WITH TIME ZONE,
    hold_released_at TIMESTAMP WITH TIME ZONE,
    hold_reason TEXT,
    report_content TEXT, -- Rich text HTML or JSON
    report_finalized_at TIMESTAMP WITH TIME ZONE,
    report_status VARCHAR(30) DEFAULT 'Draft' CHECK (report_status IN ('Draft', 'Typed', 'Reviewed', 'Approved', 'Amended', 'Finalized')),
    report_request_status VARCHAR(30) NOT NULL DEFAULT 'Requested' CHECK (report_request_status IN ('NotRequested', 'Requested', 'Cancelled')),
    report_requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    report_requested_by UUID REFERENCES users(user_id),
    report_request_source VARCHAR(30) NOT NULL DEFAULT 'Booking' CHECK (report_request_source IN ('Booking', 'Reception', 'Patient', 'Doctor', 'Automatic')),
    images_ready_at TIMESTAMP WITH TIME ZONE,
    images_delivered_at TIMESTAMP WITH TIME ZONE,
    report_sections JSONB DEFAULT '{}'::jsonb,
    template_id UUID,
    typist_id UUID REFERENCES users(user_id),
    typed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    digital_signature_name VARCHAR(150),
    digital_signature_role VARCHAR(80),
    digital_signature_hash VARCHAR(128),
    report_locked BOOLEAN DEFAULT FALSE,
    report_locked_at TIMESTAMP WITH TIME ZONE,
    amendment_reason TEXT,
    amended_at TIMESTAMP WITH TIME ZONE,
    amended_by UUID REFERENCES users(user_id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_templates (
    template_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    modality_type VARCHAR(30),
    exam_type_id UUID REFERENCES examination_types(type_id) ON DELETE SET NULL,
    clinical_history TEXT,
    technique TEXT,
    findings TEXT,
    impression TEXT,
    recommendations TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(user_id),
    updated_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE examinations
    ADD CONSTRAINT fk_examinations_template
    FOREIGN KEY (template_id) REFERENCES report_templates(template_id) ON DELETE SET NULL;

ALTER TABLE appointments
    ADD CONSTRAINT fk_appointments_prior_exam
    FOREIGN KEY (prior_exam_id) REFERENCES examinations(exam_id) ON DELETE RESTRICT,
    ADD CONSTRAINT chk_appointments_follow_up_link CHECK (
        (is_follow_up = TRUE AND prior_exam_id IS NOT NULL)
        OR (is_follow_up = FALSE AND prior_exam_id IS NULL)
    );

ALTER TABLE examinations
    ADD CONSTRAINT chk_examinations_follow_up_link CHECK (
        ((is_follow_up = TRUE AND prior_exam_id IS NOT NULL)
        OR (is_follow_up = FALSE AND prior_exam_id IS NULL))
        AND prior_exam_id IS DISTINCT FROM exam_id
    );

CREATE INDEX idx_appointments_prior_exam ON appointments(prior_exam_id) WHERE prior_exam_id IS NOT NULL;
CREATE INDEX idx_examinations_prior_exam ON examinations(prior_exam_id) WHERE prior_exam_id IS NOT NULL;

CREATE TABLE report_versions (
    version_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    report_status VARCHAR(30) NOT NULL,
    report_content TEXT,
    report_sections JSONB DEFAULT '{}'::jsonb,
    amendment_reason TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    signature_hash VARCHAR(128),
    signatory_name VARCHAR(255),
    signatory_role VARCHAR(100),
    signed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (exam_id, version_number)
);

CREATE TABLE result_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    referring_doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE SET NULL,
    delivery_method VARCHAR(30) NOT NULL CHECK (delivery_method IN (
        'Printed', 'Email', 'SMS Link', 'WhatsApp Link', 'Patient Portal',
        'Doctor Portal', 'Physical Pickup'
    )),
    recipient_name VARCHAR(150),
    recipient_contact VARCHAR(150),
    delivery_status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (delivery_status IN (
        'Pending', 'Sent', 'Delivered', 'Failed', 'Acknowledged',
        'Picked Up', 'Accessed', 'Printed'
    )),
    result_type VARCHAR(30) NOT NULL DEFAULT 'Report' CHECK (result_type IN ('Images', 'Report', 'ImagesAndReport')),
    delivered_by UUID REFERENCES users(user_id),
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    print_copy_count INTEGER NOT NULL DEFAULT 0 CHECK (print_copy_count >= 0),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by_name VARCHAR(150),
    notes TEXT,
    access_ip VARCHAR(80),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_request_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    source VARCHAR(30),
    reason TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_examinations_report_request_queue
    ON examinations(report_request_status, report_status, report_requested_at)
    WHERE report_request_status = 'Requested';
CREATE INDEX idx_report_request_events_exam
    ON report_request_events(exam_id, created_at DESC);

CREATE TABLE patient_appointment_requests (
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

CREATE TABLE patient_portal_documents (
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

CREATE TABLE patient_profile_update_requests (
    update_request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    requested_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Applied')),
    staff_notes TEXT,
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE patient_portal_audit (
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

CREATE TABLE order_status_history (
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

CREATE INDEX idx_appointments_order_number ON appointments(order_number);
CREATE INDEX idx_appointments_priority ON appointments(priority);
CREATE INDEX idx_examinations_order_number ON examinations(order_number);
CREATE INDEX idx_examinations_priority ON examinations(priority);
CREATE INDEX idx_order_status_history_appointment ON order_status_history(appointment_id);
CREATE INDEX idx_order_status_history_exam ON order_status_history(exam_id);
CREATE INDEX idx_order_status_history_created_at ON order_status_history(created_at);

CREATE TABLE queue_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    from_stage VARCHAR(30),
    to_stage VARCHAR(30),
    from_station VARCHAR(30),
    to_station VARCHAR(30),
    event_type VARCHAR(40) NOT NULL,
    reason TEXT,
    notes TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_examinations_queue_stage ON examinations(queue_stage);
CREATE INDEX idx_examinations_current_station ON examinations(current_station);
CREATE INDEX idx_examinations_queue_hold ON examinations(is_on_hold);
CREATE INDEX idx_queue_events_exam ON queue_events(exam_id);
CREATE INDEX idx_queue_events_created_at ON queue_events(created_at);

CREATE TABLE clinical_task_hold_intervals (
    hold_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    task_role VARCHAR(30),
    queue_stage VARCHAR(30) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (released_at IS NULL OR released_at >= started_at)
);

CREATE INDEX idx_clinical_task_hold_exam_time ON clinical_task_hold_intervals(exam_id, started_at, released_at);
CREATE UNIQUE INDEX idx_clinical_task_one_open_hold ON clinical_task_hold_intervals(exam_id) WHERE released_at IS NULL;

CREATE TABLE clinical_task_assignment_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    task_role VARCHAR(30) NOT NULL CHECK (task_role IN ('Nurse', 'Technician', 'Radiologist')),
    action VARCHAR(30) NOT NULL CHECK (action IN ('Claim', 'Assign', 'Transfer', 'Release', 'Complete')),
    previous_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    new_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    performed_by UUID NOT NULL REFERENCES users(user_id),
    reason TEXT,
    available_at TIMESTAMP WITH TIME ZONE,
    assignment_version INTEGER NOT NULL CHECK (assignment_version > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_hash VARCHAR(64),
    entry_hash VARCHAR(64)
);

CREATE INDEX idx_clinical_task_assignment_exam ON clinical_task_assignment_events(exam_id, task_role, created_at DESC);
CREATE INDEX idx_clinical_task_assignment_new_user ON clinical_task_assignment_events(new_user_id, created_at DESC) WHERE new_user_id IS NOT NULL;
CREATE INDEX idx_appointments_nurse_active_assignment ON appointments(nurse_id, nurse_assigned_at) WHERE nurse_id IS NOT NULL;
CREATE INDEX idx_appointments_technician_active_assignment ON appointments(technician_id, technician_assigned_at) WHERE technician_id IS NOT NULL;
CREATE INDEX idx_examinations_radiologist_active_assignment ON examinations(performing_radiologist_id, radiologist_assigned_at) WHERE performing_radiologist_id IS NOT NULL;

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

CREATE TRIGGER trg_sync_radiologist_assignment_metadata
BEFORE INSERT OR UPDATE OF performing_radiologist_id ON examinations
FOR EACH ROW EXECUTE FUNCTION sync_radiologist_assignment_metadata();

-- 7. Financials, Insurance & Contracts
CREATE TABLE insurance_providers (
    provider_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    payer_code VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    contact_info JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contracts (
    contract_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_name VARCHAR(100) NOT NULL, -- Doctor or Lab Name
    entity_type VARCHAR(20) NOT NULL, -- 'Doctor', 'Company'
    provider_id UUID REFERENCES insurance_providers(provider_id),
    contract_number VARCHAR(100),
    commission_percentage DECIMAL(5, 2),
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    coverage_notes TEXT
);

CREATE TABLE patient_insurance_policies (
    policy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES insurance_providers(provider_id),
    policy_number VARCHAR(100) NOT NULL,
    member_number VARCHAR(100),
    plan_name VARCHAR(150),
    holder_name VARCHAR(150),
    relationship_to_holder VARCHAR(50),
    valid_from DATE,
    valid_to DATE,
    is_primary BOOLEAN DEFAULT TRUE,
    approval_document_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider_id, policy_number)
);

CREATE TABLE insurance_coverage_rules (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES insurance_providers(provider_id) ON DELETE CASCADE,
    contract_id UUID REFERENCES contracts(contract_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    modality_type VARCHAR(30),
    coverage_percentage DECIMAL(5, 2) DEFAULT 0,
    coverage_ceiling DECIMAL(10, 2),
    copay_amount DECIMAL(10, 2) DEFAULT 0,
    preauthorization_required BOOLEAN DEFAULT FALSE,
    effective_from DATE,
    effective_to DATE,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE insurance_approvals (
    approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    policy_id UUID REFERENCES patient_insurance_policies(policy_id),
    provider_id UUID REFERENCES insurance_providers(provider_id),
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    exam_type_id UUID REFERENCES examination_types(type_id),
    status VARCHAR(30) DEFAULT 'Not Required' CHECK (status IN ('Not Required', 'Pending', 'Approved', 'Rejected', 'Expired')),
    approval_number VARCHAR(100),
    requested_amount DECIMAL(10, 2) DEFAULT 0,
    approved_amount DECIMAL(10, 2) DEFAULT 0,
    document_url TEXT,
    rejection_reason TEXT,
    expires_at DATE,
    requested_by UUID REFERENCES users(user_id),
    decided_by UUID REFERENCES users(user_id),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE invoices (
    invoice_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL DEFAULT ('INV-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
    appointment_id UUID REFERENCES appointments(appointment_id),
    exam_id UUID REFERENCES examinations(exam_id),
    patient_id UUID REFERENCES patients(patient_id),
    invoice_status VARCHAR(30) DEFAULT 'Pending' CHECK (invoice_status IN ('Draft', 'Pending', 'Partial', 'Paid', 'Refunded', 'Voided')),
    subtotal_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    insurance_covered_amount DECIMAL(10, 2) DEFAULT 0,
    insurance_policy_id UUID REFERENCES patient_insurance_policies(policy_id) ON DELETE RESTRICT,
    patient_payable_amount DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    discount_percentage DECIMAL(5, 2) DEFAULT 0,
    discount_reason TEXT,
    discount_approved_by UUID REFERENCES users(user_id),
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    package_code VARCHAR(100),
    package_name VARCHAR(150),
    due_date DATE,
    status payment_status DEFAULT 'Pending',
    void_reason TEXT,
    voided_by UUID REFERENCES users(user_id),
    voided_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_items (
    item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    exam_id UUID REFERENCES examinations(exam_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cashier_shifts (
    shift_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID NOT NULL REFERENCES users(user_id),
    opening_balance DECIMAL(10, 2) DEFAULT 0,
    closing_balance DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE TABLE cashier_closures (
    closure_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id UUID NOT NULL REFERENCES cashier_shifts(shift_id) ON DELETE CASCADE,
    business_date DATE DEFAULT CURRENT_DATE,
    totals JSONB DEFAULT '{}'::jsonb,
    expected_cash DECIMAL(10, 2) DEFAULT 0,
    counted_cash DECIMAL(10, 2) DEFAULT 0,
    variance DECIMAL(10, 2) DEFAULT 0,
    variance_reason TEXT,
    review_status VARCHAR(30) NOT NULL DEFAULT 'Accepted' CHECK (review_status IN ('Accepted', 'Requires Review', 'Reviewed')),
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    closed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE financial_operation_keys (
    operation_key_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key UUID NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(user_id),
    operation_type VARCHAR(40) NOT NULL,
    resource_id UUID NOT NULL,
    request_fingerprint VARCHAR(64) NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (actor_id, operation_type, idempotency_key)
);

CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(invoice_id),
    amount DECIMAL(10, 2) NOT NULL,
    method VARCHAR(50) CHECK (method IN ('Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate')),
    processed_by UUID REFERENCES users(user_id),
    cashier_shift_id UUID REFERENCES cashier_shifts(shift_id),
    receipt_number VARCHAR(50) UNIQUE DEFAULT ('RCT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('receipt_number_seq')::text, 6, '0')),
    payment_reference VARCHAR(150),
    payment_status VARCHAR(20) DEFAULT 'Completed' CHECK (payment_status IN ('Completed', 'Reversed')),
    reversed_at TIMESTAMP WITH TIME ZONE,
    reversed_by UUID REFERENCES users(user_id),
    reversal_reason TEXT,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refunds (
    refund_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(payment_id),
    amount DECIMAL(10, 2) NOT NULL,
    method VARCHAR(50) DEFAULT 'Cash' CHECK (method IN ('Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance', 'Corporate')),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Processed')),
    requested_by UUID REFERENCES users(user_id),
    approved_by UUID REFERENCES users(user_id),
    processed_by UUID REFERENCES users(user_id),
    cashier_shift_id UUID REFERENCES cashier_shifts(shift_id),
    reviewed_by UUID REFERENCES users(user_id),
    review_reason TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE insurance_claims (
    claim_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number VARCHAR(50) UNIQUE NOT NULL DEFAULT ('CLM-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 6))),
    invoice_id UUID REFERENCES invoices(invoice_id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    provider_id UUID NOT NULL REFERENCES insurance_providers(provider_id),
    policy_id UUID REFERENCES patient_insurance_policies(policy_id),
    approval_id UUID REFERENCES insurance_approvals(approval_id),
    claim_reference_number VARCHAR(100),
    status VARCHAR(30) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Submitted', 'Paid', 'Partially Paid', 'Rejected', 'Resubmitted', 'Written Off')),
    expected_amount DECIMAL(10, 2) DEFAULT 0,
    received_amount DECIMAL(10, 2) DEFAULT 0,
    rejection_reason TEXT,
    resubmission_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    written_off_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(user_id),
    updated_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_invoice_status ON invoices(invoice_status);
CREATE INDEX idx_invoices_appointment ON invoices(appointment_id);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_payments_shift ON payments(cashier_shift_id);
CREATE INDEX idx_cashier_shifts_cashier_status ON cashier_shifts(cashier_id, status);
CREATE INDEX idx_refunds_invoice ON refunds(invoice_id);
CREATE INDEX idx_patient_insurance_patient ON patient_insurance_policies(patient_id);
CREATE INDEX idx_patient_insurance_provider ON patient_insurance_policies(provider_id);
CREATE INDEX idx_coverage_rules_provider ON insurance_coverage_rules(provider_id);
CREATE INDEX idx_coverage_rules_exam_type ON insurance_coverage_rules(exam_type_id);
CREATE INDEX idx_insurance_approvals_patient ON insurance_approvals(patient_id);
CREATE INDEX idx_insurance_approvals_status ON insurance_approvals(status);
CREATE INDEX idx_insurance_claims_status ON insurance_claims(status);
CREATE INDEX idx_insurance_claims_provider ON insurance_claims(provider_id);
CREATE INDEX idx_insurance_claims_invoice ON insurance_claims(invoice_id);
CREATE INDEX idx_report_templates_modality_exam ON report_templates(modality_type, exam_type_id, is_active);
CREATE INDEX idx_report_versions_exam ON report_versions(exam_id, version_number DESC);
CREATE INDEX idx_examinations_report_status ON examinations(report_status);
CREATE INDEX idx_result_deliveries_exam ON result_deliveries(exam_id, delivered_at DESC);
CREATE INDEX idx_result_deliveries_patient ON result_deliveries(patient_id, delivered_at DESC);
CREATE INDEX idx_result_deliveries_status ON result_deliveries(delivery_status);
CREATE INDEX idx_patient_appointment_requests_patient ON patient_appointment_requests(patient_id, created_at DESC);
CREATE INDEX idx_patient_appointment_requests_status ON patient_appointment_requests(status);
CREATE INDEX idx_patient_portal_documents_patient ON patient_portal_documents(patient_id, uploaded_at DESC);
CREATE INDEX idx_patient_profile_update_requests_patient ON patient_profile_update_requests(patient_id, created_at DESC);
CREATE INDEX idx_patient_portal_audit_patient ON patient_portal_audit(patient_id, created_at DESC);

-- 8. Audit Logs (System Logs)
CREATE TABLE system_logs (
    log_id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    action VARCHAR(255) NOT NULL, -- e.g., 'UPDATE_PATIENT', 'VIEW_REPORT'
    resource_id UUID, -- Affected entity ID
    resource_table VARCHAR(50),
    ip_address VARCHAR(45),
    details JSONB,
    category VARCHAR(32),
    severity SMALLINT NOT NULL DEFAULT 20,
    outcome VARCHAR(16) NOT NULL DEFAULT 'success',
    http_method VARCHAR(8),
    request_path TEXT,
    previous_value JSONB,
    new_value JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    audit_hash_version SMALLINT NOT NULL DEFAULT 2,
    previous_hash VARCHAR(64),
    entry_hash VARCHAR(64),
    actor_type VARCHAR(30),
    actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    actor_role VARCHAR(50),
    actor_name TEXT,
    session_id UUID,
    request_id VARCHAR(100),
    event_code VARCHAR(120),
    event_family VARCHAR(60),
    event_action VARCHAR(60),
    target_type VARCHAR(80),
    target_id UUID,
    target_label TEXT,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(invoice_id) ON DELETE SET NULL,
    report_id UUID,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    source_system VARCHAR(80),
    user_agent TEXT,
    device_fingerprint VARCHAR(128),
    status_code INT,
    risk_score SMALLINT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    risk_reason TEXT,
    changed_fields JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_audit_user ON system_logs(user_id);
CREATE INDEX idx_audit_time ON system_logs(timestamp);
CREATE INDEX idx_audit_category_time ON system_logs (category, timestamp DESC);
CREATE INDEX idx_audit_outcome ON system_logs (outcome, timestamp DESC) WHERE outcome <> 'success';
CREATE INDEX idx_audit_severity ON system_logs (severity, timestamp DESC) WHERE severity >= 40;
CREATE INDEX idx_audit_event_code_time ON system_logs (event_code, timestamp DESC);
CREATE INDEX idx_audit_actor_time ON system_logs (actor_user_id, timestamp DESC);
CREATE INDEX idx_audit_actor_type_time ON system_logs (actor_type, timestamp DESC);
CREATE INDEX idx_audit_target_time ON system_logs (target_type, target_id, timestamp DESC);
CREATE INDEX idx_audit_patient_time ON system_logs (patient_id, timestamp DESC) WHERE patient_id IS NOT NULL;
CREATE INDEX idx_audit_exam_time ON system_logs (exam_id, timestamp DESC) WHERE exam_id IS NOT NULL;
CREATE INDEX idx_audit_invoice_time ON system_logs (invoice_id, timestamp DESC) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_audit_request_id ON system_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_risk_time ON system_logs (risk_score DESC, timestamp DESC) WHERE risk_score >= 50;
CREATE UNIQUE INDEX idx_system_logs_entry_hash ON system_logs(entry_hash) WHERE entry_hash IS NOT NULL;

CREATE TABLE audit_alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id BIGINT REFERENCES system_logs(log_id) ON DELETE SET NULL,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE SET NULL,
    target_type VARCHAR(80),
    target_id UUID,
    reason TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX idx_audit_alerts_status_time ON audit_alerts (status, created_at DESC);
CREATE INDEX idx_audit_alerts_actor_time ON audit_alerts (actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_alerts_patient_time ON audit_alerts (patient_id, created_at DESC) WHERE patient_id IS NOT NULL;

-- 8.5 Role-Based Access Control (RBAC)
CREATE TABLE permissions (
    permission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'VIEW_PATIENTS', 'EDIT_INVOICES'
    module VARCHAR(50) NOT NULL,       -- e.g., 'Patients', 'Billing', 'System'
    description TEXT
);

CREATE TABLE role_permissions (
    role_name user_role NOT NULL,
    permission_id UUID REFERENCES permissions(permission_id) ON DELETE CASCADE,
    PRIMARY KEY (role_name, permission_id)
);

CREATE TABLE emergency_access_logs (
    log_id BIGSERIAL PRIMARY KEY,
    grant_id UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    user_id UUID REFERENCES users(user_id),
    reason TEXT NOT NULL,
    reason_enc TEXT,
    permissions TEXT[] NOT NULL DEFAULT ARRAY['VIEW_PATIENTS', 'VIEW_EXAMS', 'VIEW_REPORTS', 'VIEW_PACS_IMAGES']::text[],
    session_id UUID,
    ip_address TEXT,
    user_agent TEXT,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Revoked')),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    revoke_reason TEXT,
    revoke_reason_enc TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_emergency_access_reason_length CHECK (char_length(btrim(reason)) BETWEEN 20 AND 1000)
);

CREATE INDEX idx_emergency_logs_user ON emergency_access_logs(user_id);
CREATE INDEX idx_emergency_access_active_user ON emergency_access_logs(user_id, expires_at DESC) WHERE status = 'Active';
CREATE UNIQUE INDEX uq_emergency_access_active_session ON emergency_access_logs(user_id, session_id) WHERE status = 'Active' AND session_id IS NOT NULL;

-- 9. Scheduling Support
CREATE TABLE appointment_reschedule_history (
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

CREATE TABLE waiting_list (
    waitlist_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    modality_id UUID REFERENCES modalities(modality_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    preferred_date DATE,
    preferred_start_time TIME,
    preferred_end_time TIME,
    priority VARCHAR(20) DEFAULT 'Routine' CHECK (priority IN ('Routine', 'Urgent', 'Emergency')),
    source VARCHAR(30) DEFAULT 'Walk-in' CHECK (source IN ('Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center')),
    status VARCHAR(20) DEFAULT 'Waiting' CHECK (status IN ('Waiting', 'Contacted', 'Offered', 'Scheduled', 'Declined', 'Expired', 'Cancelled')),
    notes TEXT,
    created_by UUID REFERENCES users(user_id),
    assigned_appointment_id UUID REFERENCES appointments(appointment_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_waiting_list_status ON waiting_list(status);
CREATE INDEX idx_waiting_list_patient ON waiting_list(patient_id);
CREATE INDEX idx_waiting_list_modality_date ON waiting_list(modality_id, preferred_date);
CREATE INDEX idx_reschedule_history_appointment ON appointment_reschedule_history(appointment_id);

-- 12. Data Privacy & Compliance (Phase 20)
CREATE TABLE patient_consents (
    consent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'Treatment', 'DataSharing', 'Marketing'
    status VARCHAR(20) DEFAULT 'Active', -- 'Active', 'Revoked'
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    document_url TEXT, -- Path to signed PDF if applicable
    signed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'Staff',
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    revoked_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE data_privacy_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    request_type VARCHAR(30) NOT NULL, -- 'Export', 'Anonymize', 'Correction'
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'InReview', 'Approved', 'Rejected', 'Completed', 'Cancelled', 'Resolved')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(user_id),
    requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    resolution_notes TEXT,
    rejected_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    export_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE privacy_export_artifacts (
    export_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES data_privacy_requests(request_id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    last_downloaded_at TIMESTAMP WITH TIME ZONE,
    last_downloaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

ALTER TABLE data_privacy_requests
    ADD CONSTRAINT data_privacy_requests_export_id_fkey
    FOREIGN KEY (export_id) REFERENCES privacy_export_artifacts(export_id) ON DELETE SET NULL;

CREATE INDEX idx_privacy_requests_status_created ON data_privacy_requests(status, created_at DESC);
CREATE INDEX idx_privacy_requests_patient_created ON data_privacy_requests(patient_id, created_at DESC);
CREATE INDEX idx_patient_consents_patient_type_status_signed ON patient_consents(patient_id, type, status, signed_at DESC);
CREATE INDEX idx_privacy_exports_request ON privacy_export_artifacts(request_id);
CREATE INDEX idx_privacy_exports_expires ON privacy_export_artifacts(expires_at);

CREATE TABLE data_retention_policies (
    policy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data_type VARCHAR(50) UNIQUE NOT NULL, -- 'PatientRecords', 'Exams', 'Invoices', 'AuditLogs'
    retention_years INT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Document Management (Phase 22)
CREATE TABLE documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    uploaded_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    
    type VARCHAR(100) NOT NULL, -- Consent Form, Patient ID, Insurance Card, Lab Result, etc.
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    size_bytes INT,
    notes TEXT,
    
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_patient ON documents(patient_id) WHERE is_deleted = FALSE;

-- 14. Integrations (Phase 23)
CREATE TABLE integrations (
    integration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'Twilio', 'Stripe', 'QuickBooks'
    type VARCHAR(50) NOT NULL, -- 'SMS', 'Payment', 'Accounting'
    api_key TEXT,
    api_secret TEXT,
    webhook_secret TEXT,
    webhook_url TEXT,
    sender_identity VARCHAR(100),
    extra_config JSONB DEFAULT '{}'::jsonb,
    max_retries INT DEFAULT 3,
    retry_backoff_ms INT DEFAULT 1000,
    webhook_timeout_ms INT DEFAULT 5000,
    secret_version INT DEFAULT 1,
    last_rotated_at TIMESTAMP WITH TIME ZONE,
    rotation_policy VARCHAR(50) DEFAULT 'manual',
    health_status VARCHAR(24) NOT NULL DEFAULT 'Disabled' CHECK (health_status IN ('NotConfigured', 'Unknown', 'Healthy', 'Degraded', 'Unhealthy', 'Disabled')),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error_code VARCHAR(80),
    last_error_message TEXT,
    config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
    updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE integration_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES integrations(integration_id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- e.g., 'Outbound SMS', 'Payment Capture'
    payload JSONB,
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Success', 'Failed'
    error_message TEXT,
    retry_count INT DEFAULT 0,
    idempotency_key VARCHAR(255),
    webhook_id VARCHAR(255),
    delivery_attempt INT DEFAULT 1,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    dead_letter_reason TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    provider_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integration_logs_status ON integration_logs(status);
CREATE UNIQUE INDEX uq_integration_logs_idempotency ON integration_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_integration_logs_claim ON integration_logs(status, next_retry_at, created_at)
    WHERE status IN ('Pending', 'Failed', 'Processing');
CREATE INDEX idx_integration_logs_dead_letter ON integration_logs(status, created_at DESC)
    WHERE status = 'DeadLetter';
CREATE INDEX idx_integrations_health ON integrations(is_active, health_status, last_checked_at DESC);

-- 15. Center Settings (Phase 24)
CREATE TABLE center_settings (
    setting_id INT PRIMARY KEY DEFAULT 1,
    center_name VARCHAR(255) DEFAULT 'VIARA Medical Center',
    tax_id VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    invoice_prefix VARCHAR(10) DEFAULT 'INV-',
    report_header TEXT,
    report_footer TEXT,
    working_hours JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (setting_id = 1)
);

-- Ensure there is exactly one row in center_settings
INSERT INTO center_settings (setting_id) VALUES (1) ON CONFLICT DO NOTHING;

-- 16. Clinical Safety Engine (Phase 26)
CREATE TABLE safety_templates (
    template_id SERIAL PRIMARY KEY,
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    schema_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_safety_responses (
    response_id SERIAL PRIMARY KEY,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE CASCADE,
    template_id INT REFERENCES safety_templates(template_id),
    answers_json JSONB NOT NULL,
    signed_by_user_id UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Safety Templates
INSERT INTO safety_templates (modality_id, name, schema_json)
SELECT modality_id, 'MRI Implant Safety Questionnaire',
       '[{"id":"q1","question":"Do you have a cardiac pacemaker?","type":"boolean","required":true},{"id":"q2","question":"Do you have any metallic implants or shrapnel?","type":"boolean","required":true},{"id":"q3","question":"Are you claustrophobic?","type":"boolean","required":false}]'::jsonb
FROM modalities
WHERE type = 'MRI'
LIMIT 1;

INSERT INTO safety_templates (modality_id, name, schema_json)
SELECT modality_id, 'CT Contrast & eGFR Screening',
       '[{"id":"q1","question":"Are you allergic to iodine or contrast media?","type":"boolean","required":true},{"id":"q2","question":"Latest eGFR value (ml/min)","type":"number","required":true},{"id":"q3","question":"Is the patient pregnant?","type":"boolean","required":true}]'::jsonb
FROM modalities
WHERE type = 'CT'
LIMIT 1;

-- 10. Refresh Tokens
CREATE TABLE refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES referring_doctors(doctor_id) ON DELETE CASCADE,
    session_id UUID,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(64),
    user_agent VARCHAR(500),
    revoked BOOLEAN DEFAULT FALSE,
    CONSTRAINT chk_token_owner CHECK (
        num_nonnulls(user_id, patient_id, doctor_id) = 1
    )
);

CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_patient ON refresh_tokens(patient_id);
CREATE INDEX idx_refresh_tokens_doctor ON refresh_tokens(doctor_id);

CREATE TABLE api_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    prefix VARCHAR(20) NOT NULL,
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'read_write')),
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_prefix ON api_tokens(prefix);

CREATE TABLE password_reset_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255),
    revoked BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- 17. Reporting & Performance Indices
CREATE INDEX idx_invoices_generated_at ON invoices(generated_at);
