-- Migration 202: Exam Branch Transfers & Audit Lineage
-- MBT-503: Audited examination inter-branch transfer and referral preserving original branch

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS original_branch_id UUID REFERENCES financial_branches(branch_id);

CREATE INDEX IF NOT EXISTS idx_examinations_original_branch ON examinations(original_branch_id);

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS original_branch_id UUID REFERENCES financial_branches(branch_id);

CREATE INDEX IF NOT EXISTS idx_appointments_original_branch ON appointments(original_branch_id);

CREATE TABLE IF NOT EXISTS exam_branch_transfers (
    transfer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES examinations(exam_id) ON DELETE CASCADE,
    source_branch_id UUID NOT NULL REFERENCES financial_branches(branch_id),
    target_branch_id UUID NOT NULL REFERENCES financial_branches(branch_id),
    previous_modality_id UUID REFERENCES modalities(modality_id),
    target_modality_id UUID REFERENCES modalities(modality_id),
    transferred_by UUID NOT NULL REFERENCES users(user_id),
    reason TEXT NOT NULL,
    cost_responsibility VARCHAR(32) NOT NULL DEFAULT 'source_branch',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_exam_transfer_branches_different CHECK (source_branch_id <> target_branch_id),
    CONSTRAINT chk_exam_transfer_cost_responsibility CHECK (cost_responsibility IN ('source_branch', 'target_branch', 'shared'))
);

CREATE INDEX IF NOT EXISTS idx_exam_branch_transfers_exam ON exam_branch_transfers(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_branch_transfers_source ON exam_branch_transfers(source_branch_id);
CREATE INDEX IF NOT EXISTS idx_exam_branch_transfers_target ON exam_branch_transfers(target_branch_id);
