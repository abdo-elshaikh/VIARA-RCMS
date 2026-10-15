-- Migration 192: System Updates Management & Audit Trail
-- Tracks on-premise and cloud update jobs, versions, pre-update backup archives, and progress logs.

CREATE TABLE IF NOT EXISTS system_updates (
    update_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_version VARCHAR(50) NOT NULL,
    to_version VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
    package_name VARCHAR(255),
    package_sha256 VARCHAR(64),
    backup_file VARCHAR(255),
    release_notes TEXT,
    initiated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    logs JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_updates_status ON system_updates(status);
CREATE INDEX IF NOT EXISTS idx_system_updates_applied_at ON system_updates(applied_at DESC);
