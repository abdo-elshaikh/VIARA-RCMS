CREATE TABLE IF NOT EXISTS user_passkeys (
    passkey_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE CHECK (char_length(credential_id) BETWEEN 16 AND 2048),
    public_key BYTEA NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0 CHECK (counter >= 0),
    transports TEXT[] NOT NULL DEFAULT '{}',
    device_type VARCHAR(32),
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    label VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_active_user
    ON user_passkeys(user_id, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
    challenge_id_hash CHAR(64) PRIMARY KEY CHECK (challenge_id_hash ~ '^[0-9a-f]{64}$'),
    challenge TEXT NOT NULL CHECK (char_length(challenge) BETWEEN 16 AND 2048),
    purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('registration', 'authentication')),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry
    ON webauthn_challenges(expires_at)
    WHERE consumed_at IS NULL;
