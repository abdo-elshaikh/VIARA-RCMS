CREATE TABLE IF NOT EXISTS pacs_measurement_drafts (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    study_instance_uid TEXT NOT NULL,
    payload_enc TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id, study_instance_uid)
);
