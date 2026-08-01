-- Phase 7: Insurance & Contract Management

ALTER TABLE insurance_providers
    ADD COLUMN IF NOT EXISTS payer_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS email VARCHAR(150),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES insurance_providers(provider_id),
    ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS coverage_notes TEXT;

CREATE TABLE IF NOT EXISTS patient_insurance_policies (
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

CREATE TABLE IF NOT EXISTS insurance_coverage_rules (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES insurance_providers(provider_id) ON DELETE CASCADE,
    contract_id UUID REFERENCES contracts(contract_id),
    exam_type_id UUID REFERENCES examination_types(type_id),
    modality_type VARCHAR(30),
    coverage_percentage DECIMAL(5,2) DEFAULT 0,
    coverage_ceiling DECIMAL(10,2),
    copay_amount DECIMAL(10,2) DEFAULT 0,
    preauthorization_required BOOLEAN DEFAULT FALSE,
    effective_from DATE,
    effective_to DATE,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insurance_approvals (
    approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    policy_id UUID REFERENCES patient_insurance_policies(policy_id),
    provider_id UUID REFERENCES insurance_providers(provider_id),
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    exam_id UUID REFERENCES examinations(exam_id) ON DELETE SET NULL,
    exam_type_id UUID REFERENCES examination_types(type_id),
    status VARCHAR(30) DEFAULT 'Not Required' CHECK (status IN ('Not Required', 'Pending', 'Approved', 'Rejected', 'Expired')),
    approval_number VARCHAR(100),
    requested_amount DECIMAL(10,2) DEFAULT 0,
    approved_amount DECIMAL(10,2) DEFAULT 0,
    document_url TEXT,
    rejection_reason TEXT,
    expires_at DATE,
    requested_by UUID REFERENCES users(user_id),
    decided_by UUID REFERENCES users(user_id),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS insurance_claims (
    claim_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number VARCHAR(50) UNIQUE NOT NULL DEFAULT ('CLM-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 6))),
    invoice_id UUID REFERENCES invoices(invoice_id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    provider_id UUID NOT NULL REFERENCES insurance_providers(provider_id),
    policy_id UUID REFERENCES patient_insurance_policies(policy_id),
    approval_id UUID REFERENCES insurance_approvals(approval_id),
    claim_reference_number VARCHAR(100),
    status VARCHAR(30) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Submitted', 'Paid', 'Partially Paid', 'Rejected', 'Resubmitted', 'Written Off')),
    expected_amount DECIMAL(10,2) DEFAULT 0,
    received_amount DECIMAL(10,2) DEFAULT 0,
    rejection_reason TEXT,
    resubmission_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(user_id),
    updated_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_insurance_patient ON patient_insurance_policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_insurance_provider ON patient_insurance_policies(provider_id);
CREATE INDEX IF NOT EXISTS idx_coverage_rules_provider ON insurance_coverage_rules(provider_id);
CREATE INDEX IF NOT EXISTS idx_coverage_rules_exam_type ON insurance_coverage_rules(exam_type_id);
CREATE INDEX IF NOT EXISTS idx_insurance_approvals_patient ON insurance_approvals(patient_id);
CREATE INDEX IF NOT EXISTS idx_insurance_approvals_status ON insurance_approvals(status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_provider ON insurance_claims(provider_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_invoice ON insurance_claims(invoice_id);
