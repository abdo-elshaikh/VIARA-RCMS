-- 200_display_call_events_branch.sql
-- Add branch_id to display_call_events for multi-branch isolation

ALTER TABLE display_call_events
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);

CREATE INDEX IF NOT EXISTS idx_display_call_events_branch_id
ON display_call_events(branch_id);
