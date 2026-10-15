CREATE TABLE IF NOT EXISTS pacs_viewer_bookmarks (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    study_instance_uid TEXT NOT NULL,
    key_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, study_instance_uid),
    CHECK (jsonb_typeof(key_images) = 'array')
);
