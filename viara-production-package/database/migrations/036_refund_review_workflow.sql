ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(user_id),
    ADD COLUMN IF NOT EXISTS review_reason TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_refunds_status_created
    ON refunds(status, created_at DESC);
