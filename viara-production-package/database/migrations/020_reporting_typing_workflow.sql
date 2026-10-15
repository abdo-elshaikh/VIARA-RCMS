-- Phase 8: Reporting templates, lifecycle, versions, amendments, and print export support

CREATE TABLE IF NOT EXISTS report_templates (
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
    ADD COLUMN IF NOT EXISTS report_status VARCHAR(30) DEFAULT 'Draft' CHECK (report_status IN ('Draft', 'Typed', 'Reviewed', 'Approved', 'Amended', 'Finalized')),
    ADD COLUMN IF NOT EXISTS report_sections JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES report_templates(template_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS typist_id UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS typed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS digital_signature_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS digital_signature_role VARCHAR(80),
    ADD COLUMN IF NOT EXISTS digital_signature_hash VARCHAR(128),
    ADD COLUMN IF NOT EXISTS report_locked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS report_locked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS amendment_reason TEXT,
    ADD COLUMN IF NOT EXISTS amended_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS amended_by UUID REFERENCES users(user_id);

CREATE TABLE IF NOT EXISTS report_versions (
    version_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    report_status VARCHAR(30) NOT NULL,
    report_content TEXT,
    report_sections JSONB DEFAULT '{}'::jsonb,
    amendment_reason TEXT,
    created_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (exam_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_report_templates_modality_exam ON report_templates(modality_type, exam_type_id, is_active);
CREATE INDEX IF NOT EXISTS idx_report_versions_exam ON report_versions(exam_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_examinations_report_status ON examinations(report_status);
