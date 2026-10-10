-- Queue shell for future DICOM/image AI analysis.
-- Jobs are intentionally separate from final reports and AI text drafts.

CREATE TABLE IF NOT EXISTS pacs_ai_analysis_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    study_instance_uid VARCHAR(255) NOT NULL,
    orthanc_study_id VARCHAR(255),
    requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    analysis_type VARCHAR(60) NOT NULL DEFAULT 'preliminary_image_review',
    priority VARCHAR(20) NOT NULL DEFAULT 'Routine'
        CHECK (priority IN ('Routine', 'Urgent', 'Emergency')),
    status VARCHAR(30) NOT NULL DEFAULT 'Queued'
        CHECK (status IN ('Queued', 'Running', 'Completed', 'Failed', 'Canceled')),
    provider VARCHAR(80),
    model VARCHAR(160),
    model_version VARCHAR(80),
    result_summary TEXT,
    result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    radiologist_status VARCHAR(30) NOT NULL DEFAULT 'Pending'
        CHECK (radiologist_status IN ('Pending', 'Accepted', 'Rejected', 'Reviewed')),
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pacs_ai_analysis_jobs_exam_created
    ON pacs_ai_analysis_jobs(exam_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pacs_ai_analysis_jobs_status_created
    ON pacs_ai_analysis_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_pacs_ai_analysis_jobs_study
    ON pacs_ai_analysis_jobs(study_instance_uid);
