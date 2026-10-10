-- Secure anonymous portal workflows: short-lived case verification challenges
-- and encrypted appointment requests. No plain-text public contact details are
-- retained by these tables.

CREATE TABLE IF NOT EXISTS public_case_verification_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE CASCADE,
    identifier_hash VARCHAR(64) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    delivery_channel VARCHAR(20),
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    ip_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_case_challenge_expiry
    ON public_case_verification_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_public_case_challenge_identifier
    ON public_case_verification_challenges(identifier_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS public_appointment_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number VARCHAR(30) UNIQUE NOT NULL,
    name_enc VARCHAR(500) NOT NULL,
    phone_enc VARCHAR(500) NOT NULL,
    phone_hash VARCHAR(64) NOT NULL,
    request_mode VARCHAR(20) NOT NULL CHECK (request_mode IN ('center', 'home', 'consult')),
    requested_service VARCHAR(180) NOT NULL,
    preferred_date DATE,
    consent_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Contacted', 'Scheduled', 'Rejected', 'Cancelled')),
    source VARCHAR(30) NOT NULL DEFAULT 'Website',
    ip_hash VARCHAR(64),
    user_agent VARCHAR(500),
    staff_notes TEXT,
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_appointment_requests_status
    ON public_appointment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_appointment_requests_phone
    ON public_appointment_requests(phone_hash, created_at DESC);

-- Existing authenticated and public appointment requests share the same event.
-- Optional fields keep the original patient-portal payload compatible while
-- giving reception enough information to action an anonymous web request.
UPDATE notification_templates
SET body = 'A patient has submitted an appointment request.\n\nPatient: {{patient_name}}\nPreferred Date: {{preferred_date}}\nExam Type: {{exam_type}}{{#if request_number}}\nRequest #: {{request_number}}{{/if}}{{#if contact_phone}}\nContact: {{contact_phone}}{{/if}}',
    updated_at = CURRENT_TIMESTAMP
WHERE event_type = 'AppointmentRequested'
  AND channel = 'InApp'
  AND language = 'en';
