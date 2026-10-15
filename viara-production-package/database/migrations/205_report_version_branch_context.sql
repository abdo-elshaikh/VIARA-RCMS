-- Migration 205: Report Version Historical Branch Scoping (MBT-105)
-- Captures immutable historical branch context on report versions to prevent alterations when exams are transferred or edited.

ALTER TABLE report_versions
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);

CREATE INDEX IF NOT EXISTS idx_report_versions_branch ON report_versions(branch_id);
