-- Persist AI-generated preliminary report drafts for review and audit.
-- Drafts are suggestions only; final report state remains on examinations/report_versions.

CREATE TABLE IF NOT EXISTS report_ai_drafts (
    draft_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_templates(template_id) ON DELETE SET NULL,
    generated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    provider VARCHAR(60),
    model VARCHAR(120),
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    draft_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
    limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
    disclaimer TEXT,
    prompt_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'Generated'
        CHECK (status IN ('Generated', 'Applied', 'Discarded')),
    apply_mode VARCHAR(30),
    applied_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_ai_drafts_exam_created
    ON report_ai_drafts(exam_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_ai_drafts_generated_by
    ON report_ai_drafts(generated_by, created_at DESC);
