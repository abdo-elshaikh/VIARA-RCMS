CREATE TABLE IF NOT EXISTS api_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    prefix VARCHAR(20) NOT NULL,
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'read_write')),
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) NOT NULL DEFAULT 'read';
ALTER TABLE api_tokens ALTER COLUMN prefix TYPE VARCHAR(20);
ALTER TABLE api_tokens ALTER COLUMN name TYPE VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_api_token_access_level') THEN
        ALTER TABLE api_tokens ADD CONSTRAINT chk_api_token_access_level CHECK (access_level IN ('read', 'read_write'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens(prefix);
