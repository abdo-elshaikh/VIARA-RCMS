-- Migration 201: Chat channels and notifications branch scoping
-- MBT-509: Multi-branch institutional & branch-level chat and notifications isolation

ALTER TABLE chat_channels
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_channels_branch ON chat_channels(branch_id);

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications(branch_id);
