-- Portal content is independent of operational center settings.
CREATE TABLE IF NOT EXISTS portal_page_settings (
    page_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (page_id = 1),
    draft JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    published_version_id BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_page_versions (
    version_id BIGSERIAL PRIMARY KEY,
    page_id SMALLINT NOT NULL REFERENCES portal_page_settings(page_id),
    content JSONB NOT NULL,
    source_revision INTEGER NOT NULL,
    published_by TEXT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_preview_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    content JSONB NOT NULL,
    revision INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by TEXT
);
CREATE INDEX IF NOT EXISTS portal_preview_expiry_idx ON portal_preview_sessions(expires_at);
CREATE INDEX IF NOT EXISTS portal_versions_page_idx ON portal_page_versions(page_id, version_id DESC);
